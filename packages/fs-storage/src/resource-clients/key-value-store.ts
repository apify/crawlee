import { Readable } from 'node:stream';

import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import type { FileSystemKeyValueStoreClient as NativeFileSystemKeyValueStoreClient } from '@crawlee/fs-storage-native';
import { isStream } from '../utils.js';
import { CachedIdClient } from './cached-id-client.js';
import mime from 'mime-types';

/**
 * Extensions appended to a key when probing for an out-of-band ("bare") value file that has no
 * metadata sidecar. A lookup for `INPUT` therefore also matches a hand-placed `INPUT.json` or
 * `INPUT.txt`, mirroring the historical extension-stripping behavior. The empty string (the literal
 * key) is tried first.
 */
const BARE_FILE_EXTENSIONS = ['', '.json', '.txt', '.bin'] as const;

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
 * This adapter is a plain byte transport: values are written and read verbatim as `Buffer`s with a
 * content type carried alongside them. Serializing arbitrary values into bytes and parsing them back
 * is the {@apilink KeyValueStore} frontend codec's job, not this client's.
 */
export class KeyValueStoreClient extends CachedIdClient implements storage.KeyValueStoreClient {
    readonly name?: string;
    readonly cacheKey: string;

    private readonly nativeClient: NativeFileSystemKeyValueStoreClient;

    constructor(options: KeyValueStoreClientOptions) {
        super();
        this.name = options.name;
        this.cacheKey = options.cacheKey;
        this.nativeClient = options.nativeClient;
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
     * Remove every record from the store except the run input. Used by
     * {@link FileSystemStorageClient.purge} to clean the default key-value store at the start of a run
     * while preserving the run's input, matching the historical file-system storage behavior.
     *
     * The native `purge` keep-list matches by exact key with no extension globbing, so we pass every
     * filename the input might live under (`INPUT`, `INPUT.json`, `INPUT.txt`).
     */
    async purgeExceptInput(): Promise<void> {
        await this.nativeClient.purge(BARE_FILE_EXTENSIONS.map((extension) => `INPUT${extension}`));
    }

    async listKeys(options: storage.KeyValueStoreListKeysOptions = {}): Promise<storage.KeyValueStoreItemData[]> {
        const { prefix, exclusiveStartKey, limit } = s
            .object({
                prefix: s.string().optional(),
                exclusiveStartKey: s.string().optional(),
                limit: s.number().int().greaterThan(0).optional(),
            })
            .parse(options);

        // The native iterator handles `prefix`, `exclusiveStartKey`, and `limit` natively, but it does
        // not throw for an unknown `exclusiveStartKey`, so we preflight it here. Untracked value files
        // on disk ("bare files", e.g. a hand-placed `INPUT.json`) are deliberately NOT enumerated — they
        // are readable by known key via `getValue`, but listing only ever returns tracked records.
        if (exclusiveStartKey !== undefined && !(await this.nativeClient.recordExists(exclusiveStartKey))) {
            throw new Error(
                `exclusiveStartKey "${exclusiveStartKey}" was not found in the key-value store. ` +
                    `This is likely a bug — the key may have been deleted between paginated listKeys calls.`,
            );
        }

        const items: storage.KeyValueStoreItemData[] = [];
        const iterator = await this.nativeClient.iterateKeys(exclusiveStartKey, limit, undefined, prefix);
        for await (const record of iterator) {
            items.push({ key: record.key, size: record.size ?? 0 });
        }
        return items;
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
        // guard here to keep the historical `undefined`-for-missing contract. Probe bare files too so
        // an out-of-band `INPUT.json` still yields a URL.
        const resolvedKey = await this.resolveExistingKey(key);
        return resolvedKey === undefined ? undefined : this.nativeClient.getPublicUrl(resolvedKey);
    }

    /**
     * Tests whether a record with the given key exists without retrieving its value.
     *
     * @param key The queried record key.
     * @returns `true` if the record exists, `false` otherwise.
     */
    async recordExists(key: string): Promise<boolean> {
        s.string().parse(key);
        return (await this.resolveExistingKey(key)) !== undefined;
    }

    async getValue(key: string): Promise<storage.KeyValueStoreRecord | undefined> {
        s.string().parse(key);

        // Normal lookup first: a tracked record (value file + metadata sidecar), whose content type is
        // read verbatim from the sidecar — parsing is the frontend's job (see the KeyValueStore codec).
        const record = await this.nativeClient.getValue(key);
        if (record) {
            return {
                key: record.key,
                value: record.value,
                contentType: record.contentType,
            };
        }

        // Fall back to an out-of-band value file with no sidecar (e.g. a hand-written or
        // platform-provided `INPUT.json`).
        return this.getBareValue(key);
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
     * Read an out-of-band value file with no metadata sidecar — e.g. an `INPUT.json` placed by the
     * user or the Apify platform. Probes the literal key plus the `.json`/`.txt` variants (the native
     * lookup is by filename) and returns the first match. The native client reports a bare file as
     * `application/octet-stream`; since it has no sidecar, we infer the content type from the matched
     * extension here so the frontend codec can parse it (e.g. a `.json` file is read as JSON). The
     * record is keyed by the requested `key`, not the on-disk filename. Returns `undefined` if no such
     * file exists.
     */
    private async getBareValue(key: string): Promise<storage.KeyValueStoreRecord | undefined> {
        for (const extension of BARE_FILE_EXTENSIONS) {
            const record = await this.nativeClient.getValue(`${key}${extension}`, false);
            if (!record) {
                continue;
            }

            // Infer the content type from the extension we matched; fall back to the native
            // `application/octet-stream` for an extensionless file.
            const contentType = (extension && mime.contentType(extension)) || record.contentType;
            return { key, value: record.value, contentType };
        }
        return undefined;
    }

    /**
     * Resolve `key` to the on-disk filename that actually exists, checking tracked records first and
     * then out-of-band bare files (the literal key plus the `.json`/`.txt` variants). Returns the
     * matching key/filename, or `undefined` if nothing exists.
     */
    private async resolveExistingKey(key: string): Promise<string | undefined> {
        if (await this.nativeClient.recordExists(key)) {
            return key;
        }
        for (const extension of BARE_FILE_EXTENSIONS) {
            const candidate = `${key}${extension}`;
            if (await this.nativeClient.recordExists(candidate, false)) {
                return candidate;
            }
        }
        return undefined;
    }
}
