import { Readable } from 'node:stream';

import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import type { FileSystemKeyValueStoreClient as NativeFileSystemKeyValueStoreClient } from '@crawlee/fs-storage-native';
import { isStream } from '../utils.js';
import { CachedIdClient } from './cached-id-client.js';

/**
 * Out-of-band ("bare") value-file fallbacks tried when the {@link ALLOWED_BARE_FILES} lookup misses the tracked
 * record, so a lookup for `INPUT` also matches a hand-placed `INPUT.json`/`.txt`/`.bin`. Passed to the
 * native `resolveValue`/`resolveExistingKey`, which do the probing and re-keying.
 *
 * Each entry declares the content type to report on a match — the native client does no MIME
 * inference. An empty `contentType` is its sentinel for "keep the synthesized
 * `application/octet-stream`", used for the extensionless key and `.bin`.
 */
const BARE_FILE_FALLBACKS: { extension: string; contentType: string }[] = [
    { extension: '', contentType: '' },
    { extension: '.json', contentType: 'application/json; charset=utf-8' },
    { extension: '.txt', contentType: 'text/plain; charset=utf-8' },
    { extension: '.bin', contentType: '' },
];

const ALLOWED_BARE_FILES = ['INPUT'];

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
     * filename the input might live under (`INPUT`, `INPUT.json`, `INPUT.txt`, `INPUT.bin`).
     */
    async purgeExceptInput(): Promise<void> {
        await this.nativeClient.purge(BARE_FILE_FALLBACKS.flatMap(({ extension }) => `INPUT${extension}`));
    }

    async listKeys(options: storage.KeyValueStoreListKeysOptions = {}): Promise<storage.KeyValueStoreItemData[]> {
        const { prefix, exclusiveStartKey, limit } = s
            .object({
                prefix: s.string().optional(),
                exclusiveStartKey: s.string().optional(),
                limit: s.number().int().greaterThan(0).optional(),
            })
            .parse(options);

        const items: storage.KeyValueStoreItemData[] = [];
        const iterator = await this.nativeClient.iterateKeys(exclusiveStartKey, limit, undefined, prefix);
        for await (const record of iterator) {
            items.push(record);
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

        // The native `getPublicUrl` stats the encoded path but does not probe bare-file extensions,
        // so we resolve the on-disk key first (handling e.g. `INPUT` -> `INPUT.json`) and normalize
        // the native `null`-for-missing result to the historical `undefined` contract.
        const resolvedKey = await this.resolveExistingKey(key);
        if (resolvedKey === undefined) {
            return undefined;
        }
        return (await this.nativeClient.getPublicUrl(resolvedKey)) ?? undefined;
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

        const record = ALLOWED_BARE_FILES.includes(key)
            ? await this.nativeClient.resolveValue(key, BARE_FILE_FALLBACKS)
            : await this.nativeClient.getValue(key);

        if (record) {
            return {
                key: record.key,
                value: record.value,
                contentType: record.contentType,
            };
        }

        return undefined;
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
     * Resolve `key` to the on-disk key that actually exists, or `undefined` if nothing does. Every
     * key is checked against its tracked record; only the run input ({@link ALLOWED_BARE_FILES}) additionally
     * falls back to out-of-band bare files (`INPUT.json`/`.txt`/`.bin`), in which case the matched
     * on-disk key is returned so callers like `getPublicUrl` point at the file that exists.
     */
    private async resolveExistingKey(key: string): Promise<string | undefined> {
        if (ALLOWED_BARE_FILES.includes(key)) {
            return (
                (await this.nativeClient.resolveExistingKey(
                    key,
                    BARE_FILE_FALLBACKS.map(({ extension }) => extension),
                )) ?? undefined
            );
        }
        return (await this.nativeClient.recordExists(key)) ? key : undefined;
    }
}
