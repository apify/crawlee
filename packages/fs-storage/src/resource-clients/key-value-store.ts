import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import { isBodyParseable } from '../body-parser.js';
import type { FileSystemKeyValueStoreClient as NativeFileSystemKeyValueStoreClient } from '@crawlee/fs-storage-native';
import { isStream } from '../utils.js';
import { CachedIdClient } from './cached-id-client.js';
import mime from 'mime-types';

const STORE_METADATA_FILENAME = '__metadata__.json';
const RECORD_METADATA_SUFFIX = '.__metadata__.json';

/** A value file present on disk that the native client does not track (no metadata sidecar). */
interface BareFile {
    /** The decoded record key. */
    key: string;
    /** Absolute path to the value file on disk. */
    filePath: string;
    /** Content type inferred from the file extension (defaults to `text/plain`). */
    contentType: string;
}

export interface KeyValueStoreClientOptions {
    /** The user-facing storage name, or `undefined` for unnamed (alias / default) storages. */
    name?: string;
    /**
     * The key used for cache lookup in {@link FileSystemStorageClient}. For named storages this equals
     * the name; for alias (unnamed) storages it is the alias string. Falls back to the storage id.
     */
    cacheKey: string;
    nativeClient: NativeFileSystemKeyValueStoreClient;
    logger?: CrawleeLogger;
}

/**
 * A file-system key-value store client backed by the native `@crawlee/fs-storage-native` Rust
 * extension.
 *
 * The native client stores and returns raw bytes; this adapter is responsible for serializing
 * arbitrary values into a `Buffer` on the way in ({@link KeyValueStoreClient.setValue}) and parsing
 * them back into JS values on the way out ({@link KeyValueStoreClient.getValue}), preserving the
 * historical content-type handling.
 */
export class KeyValueStoreClient extends CachedIdClient implements storage.KeyValueStoreClient {
    readonly name?: string;
    readonly cacheKey: string;

    private readonly nativeClient: NativeFileSystemKeyValueStoreClient;
    private readonly logger?: CrawleeLogger;

    constructor(options: KeyValueStoreClientOptions) {
        super();
        this.name = options.name;
        this.cacheKey = options.cacheKey;
        this.nativeClient = options.nativeClient;
        this.logger = options.logger;
    }

    get keyValueStoreDirectory(): string {
        return this.nativeClient.pathToKvs;
    }

    static async create(options: KeyValueStoreClientOptions): Promise<KeyValueStoreClient> {
        const client = new KeyValueStoreClient(options);
        client._cachedId = (await options.nativeClient.getMetadata()).id;
        return client;
    }

    async getMetadata(): Promise<storage.KeyValueStoreInfo> {
        return this.nativeClient.getMetadata();
    }

    async drop(): Promise<void> {
        await this.nativeClient.dropStorage();
    }

    async purge(): Promise<void> {
        await this.nativeClient.purge();
    }

    /**
     * Remove every record from the store except the run input (the `INPUT` key). Used by
     * {@link FileSystemStorageClient.purge} to clean the default key-value store at the start of a run
     * while preserving the run's input, matching the historical file-system storage behavior.
     *
     * The native client's `purge()` clears everything unconditionally, so we instead delete keys
     * individually here.
     */
    async purgeExceptInput(): Promise<void> {
        const keysToDelete: string[] = [];
        const iterator = await this.nativeClient.iterateKeys();
        for await (const record of iterator) {
            if (record.key !== 'INPUT') {
                keysToDelete.push(record.key);
            }
        }

        await Promise.all(keysToDelete.map(async (key) => this.nativeClient.deleteValue(key)));
    }

    async listKeys(options: storage.KeyValueStoreListKeysOptions = {}): Promise<storage.KeyValueStoreItemData[]> {
        const { prefix, exclusiveStartKey, limit } = s
            .object({
                prefix: s.string().optional(),
                exclusiveStartKey: s.string().optional(),
                limit: s.number().int().greaterThan(0).optional(),
            })
            .parse(options);

        // The native iterator yields keys in lexical order and natively supports `exclusiveStartKey`
        // and `limit`, but not `prefix`, and it does not throw for an unknown `exclusiveStartKey`.
        // To preserve the historical semantics (prefix filtering and a hard error for a missing
        // `exclusiveStartKey`), we collect the full key list and slice it here. We also merge in any
        // untracked value files present on disk (native keys take precedence on collisions).
        const itemsByKey = new Map<string, storage.KeyValueStoreItemData>();

        for (const bareFile of await this.listBareFiles()) {
            const size = await readFile(bareFile.filePath)
                .then((buffer) => buffer.byteLength)
                .catch(() => 0);
            itemsByKey.set(bareFile.key, { key: bareFile.key, size });
        }

        const iterator = await this.nativeClient.iterateKeys();
        for await (const record of iterator) {
            itemsByKey.set(record.key, { key: record.key, size: record.size ?? 0 });
        }

        // Emulate the API: keys are returned in lexical order.
        const items = [...itemsByKey.values()].sort((a, b) => a.key.localeCompare(b.key));

        let filteredItems = items.filter((item) => !prefix || item.key.startsWith(prefix));

        if (exclusiveStartKey) {
            const keyPos = filteredItems.findIndex((item) => item.key === exclusiveStartKey);
            if (keyPos === -1) {
                throw new Error(
                    `exclusiveStartKey "${exclusiveStartKey}" was not found in the key-value store. ` +
                        `This is likely a bug — the key may have been deleted between paginated listKeys calls.`,
                );
            }
            filteredItems = filteredItems.slice(keyPos + 1);
        }

        if (limit !== undefined) {
            filteredItems = filteredItems.slice(0, limit);
        }

        return filteredItems;
    }

    /**
     * Generates a public `file://` URL for accessing a specific record in the key-value store.
     *
     * Returns `undefined` if the record does not exist.
     * @param key The key of the record to generate the public URL for.
     */
    async getPublicUrl(key: string): Promise<string | undefined> {
        s.string().parse(key);

        // The native client builds the URL purely from the path and does not check existence, so we
        // guard here to keep the historical `undefined`-for-missing contract.
        if (await this.nativeClient.recordExists(key)) {
            return this.nativeClient.getPublicUrl(key);
        }

        // Fall back to an untracked value file on disk.
        const bareFile = await this.findBareFile(key);
        return bareFile ? pathToFileURL(bareFile.filePath).href : undefined;
    }

    /**
     * Tests whether a record with the given key exists without retrieving its value.
     *
     * @param key The queried record key.
     * @returns `true` if the record exists, `false` otherwise.
     */
    async recordExists(key: string): Promise<boolean> {
        s.string().parse(key);
        if (await this.nativeClient.recordExists(key)) {
            return true;
        }
        return (await this.findBareFile(key)) !== undefined;
    }

    async getValue(key: string): Promise<storage.KeyValueStoreRecord | undefined> {
        s.string().parse(key);

        const record = await this.nativeClient.getValue(key);

        if (record) {
            // Return raw bytes + verbatim content type. Parsing is the frontend's job (see the
            // KeyValueStore codec); this client is a plain byte transport.
            return {
                key: record.key,
                value: record.value,
                contentType: record.contentType,
            };
        }

        // Fall back to a value file placed on disk out-of-band (e.g. a hand-written or
        // platform-provided `INPUT.json`) that the native client does not track.
        return this.readBareFile(key);
    }

    async setValue(record: storage.KeyValueStoreInputRecord): Promise<void> {
        // By the time a value reaches the client the frontend (KeyValueStore codec) has already
        // serialized it: non-bytes become a `string`, everything else is a `Buffer`/typed array or a
        // stream. So we only accept those shapes here — there is no JSON inference or `String(value)`
        // coercion left to do.
        s.object({
            key: s.string().lengthGreaterThan(0),
            value: s.union([
                s.string(),
                s.instance(Buffer),
                s.instance(ArrayBuffer),
                s.typedArray(),
                // A stream is an object; disabling validation makes shapeshift only check it is a
                // non-null, non-array object (the stream guard below does the real check).
                s.object({}).setValidationEnabled(false),
            ]),
            contentType: s.string().lengthGreaterThan(0).optional(),
        }).parse(record);

        const { key, value } = record;
        // The frontend resolves the content type before it reaches the client; this client is a plain
        // byte transport and does not infer content types.
        const contentType = record.contentType ?? 'application/octet-stream';

        // Stream the value straight to disk without buffering it all into memory. The native client
        // consumes a Web `ReadableStream`, so convert the Node `Readable` we get from the frontend.
        if (isStream(value)) {
            const webStream = Readable.toWeb(value as Readable) as ReadableStream<Uint8Array>;
            await this.nativeClient.setValueStream(key, webStream, contentType);
            return;
        }

        // Normalize the remaining (already-serialized) value into a Buffer for the native client.
        const buffer = Buffer.isBuffer(value)
            ? value
            : value instanceof ArrayBuffer
              ? Buffer.from(value)
              : ArrayBuffer.isView(value)
                ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
                : Buffer.from(value as string);

        await this.nativeClient.setValue(key, buffer, contentType);
    }

    async deleteValue(key: string): Promise<void> {
        s.string().parse(key);
        await this.nativeClient.deleteValue(key);
    }

    /**
     * Read a value file that exists on disk but is not tracked by the native client (it has no
     * metadata sidecar) — e.g. an `INPUT.json` placed by the user or the Apify platform. Returns the
     * raw bytes plus the content type inferred from the file extension, or `undefined` if no such
     * file exists or its content is unparseable. Parsing the returned bytes is the frontend's job.
     */
    private async readBareFile(key: string): Promise<storage.KeyValueStoreRecord | undefined> {
        const bareFile = await this.findBareFile(key);
        if (!bareFile) {
            return undefined;
        }

        if (!mime.extension(bareFile.contentType)) {
            this.logger?.warning?.(
                `Key-value store record "${key}" was loaded from a file without a known extension; ` +
                    `assuming "${bareFile.contentType}".`,
            );
        }

        let buffer: Buffer;
        try {
            buffer = await readFile(bareFile.filePath);
        } catch {
            return undefined;
        }

        // This client is a plain byte transport — the frontend (KeyValueStore codec) parses the
        // returned bytes. We only validate here that the body is parseable for the inferred content
        // type, so an unparseable value (e.g. malformed JSON) is treated as a missing record,
        // matching the historical fallback behavior; the validated bytes are returned verbatim.
        try {
            isBodyParseable(buffer, bareFile.contentType);
        } catch {
            this.logger?.warning?.(`Failed to parse key-value store record "${key}" read from disk; ignoring it.`);
            return undefined;
        }

        return {
            key,
            value: buffer,
            contentType: bareFile.contentType,
        };
    }

    /**
     * Find an untracked value file on disk matching `key`, if any.
     *
     * Note: the comparison percent-encodes both sides with `encodeURIComponent`, which escapes a
     * *different* set of characters than the native client's on-disk encoding (the Rust side escapes
     * every non-alphanumeric byte). That mismatch is harmless here because both operands go through
     * the same `encodeURIComponent` — `bareFile.key` was already decoded from disk in
     * {@link KeyValueStoreClient.listBareFiles} — so this only normalizes our own comparison and never
     * tries to reconstruct a native filename. Do not "align" this with the native encoding without
     * reworking how bare files are decoded.
     */
    private async findBareFile(key: string): Promise<BareFile | undefined> {
        const target = encodeURIComponent(key);
        for (const bareFile of await this.listBareFiles()) {
            if (encodeURIComponent(bareFile.key) === target) {
                return bareFile;
            }
        }
        return undefined;
    }

    /**
     * List value files present in the store directory that the native client does not track. Each
     * such file is reported once, keyed by its (URL-decoded) name with the extension stripped, with a
     * content type inferred from its extension.
     */
    private async listBareFiles(): Promise<BareFile[]> {
        let entries: string[];
        try {
            entries = await readdir(this.keyValueStoreDirectory);
        } catch {
            // The store directory may not exist yet.
            return [];
        }

        const result: BareFile[] = [];

        for (const entry of entries) {
            // Skip the store metadata file and per-record metadata sidecars.
            if (entry === STORE_METADATA_FILENAME || entry.endsWith(RECORD_METADATA_SUFFIX)) {
                continue;
            }

            // A native-tracked record has a `<name>.__metadata__.json` sidecar; if one exists for this
            // entry, the native client already owns it and it is not a "bare" file.
            if (entries.includes(`${entry}${RECORD_METADATA_SUFFIX}`)) {
                continue;
            }

            const dotIndex = entry.lastIndexOf('.');
            const extension = dotIndex > 0 ? entry.slice(dotIndex + 1) : '';
            const decodedName = decodeURIComponent(dotIndex > 0 ? entry.slice(0, dotIndex) : entry);
            const contentType = (extension && (mime.contentType(extension) || undefined)) || 'text/plain';

            result.push({
                key: decodedName,
                filePath: resolve(this.keyValueStoreDirectory, entry),
                contentType,
            });
        }

        return result;
    }
}
