import { Readable } from 'node:stream';

import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import { parseArgument, schemas } from '@crawlee/utils/internal';
import { z } from 'zod';

import type { FileSystemKeyValueStoreClient as NativeFileSystemKeyValueStoreBackend } from '@crawlee/fs-storage-native';
import { isStream } from '../utils.js';
import { CachedIdClient } from './cached-id-client.js';

const keySchema = z.string();

const inputRecordShape = z.object({
    key: z.string().min(1),
    value: z.union([
        z.string(),
        z.instanceof(Buffer),
        z.instanceof(ArrayBuffer),
        schemas.typedArray,
        // A stream is an object; this only checks it is a non-null, non-array object
        // (the stream guard in `setValue` does the real check).
        schemas.plainObject,
    ]),
    contentType: z.string().min(1).optional(),
});

export interface KeyValueStoreBackendOptions {
    /** The user-facing storage name, or `undefined` for unnamed (alias / default) storages. */
    name?: string;
    /**
     * The key used for cache lookup in {@link FileSystemStorageBackend}. For named storages this equals
     * the name; for alias (unnamed) storages it is the alias string. Falls back to the storage id.
     */
    cacheKey: string;
    nativeBackend: NativeFileSystemKeyValueStoreBackend;
    logger?: CrawleeLogger;
    /** The keys {@link purgeExceptPreserved} spares — `FileSystemStorageOptions.preservedKeys`, deduplicated. */
    preservedKeys: string[];
}

/**
 * A file-system key-value store backend backed by the native `@crawlee/fs-storage-native` Rust
 * extension.
 *
 * This adapter is a plain byte transport: values are written and read verbatim as `Buffer`s with a
 * content type carried alongside them. Serializing arbitrary values into bytes and parsing them back
 * is the {@apilink KeyValueStore} frontend codec's job, not this backend's.
 */
export class KeyValueStoreBackend extends CachedIdClient implements storage.KeyValueStoreBackend {
    readonly name?: string;
    readonly cacheKey: string;

    readonly #nativeBackend: NativeFileSystemKeyValueStoreBackend;

    /** See {@link KeyValueStoreBackendOptions.preservedKeys}. */
    readonly #preservedKeys: string[];

    constructor(options: KeyValueStoreBackendOptions) {
        super();
        this.name = options.name;
        this.cacheKey = options.cacheKey;
        this.#nativeBackend = options.nativeBackend;
        this.#preservedKeys = options.preservedKeys;
    }

    get keyValueStoreDirectory(): string {
        return this.#nativeBackend.pathToKvs;
    }

    static async create(options: KeyValueStoreBackendOptions): Promise<KeyValueStoreBackend> {
        const backend = new KeyValueStoreBackend(options);
        backend.cachedId = (await options.nativeBackend.getMetadata()).id;
        return backend;
    }

    async getMetadata(): Promise<storage.KeyValueStoreInfo> {
        return this.#nativeBackend.getMetadata();
    }

    async drop(): Promise<void> {
        await this.#nativeBackend.dropStorage();
    }

    async purge(): Promise<void> {
        await this.#nativeBackend.purge();
    }

    /**
     * Remove every record from the store except the preserved keys. Used by
     * {@link FileSystemStorageBackend.purge} to clean the default key-value store at the start of a run.
     */
    async purgeExceptPreserved(): Promise<void> {
        await this.#nativeBackend.purge(this.#preservedKeys);
    }

    async listKeys(options: storage.KeyValueStoreListKeysOptions = {}): Promise<storage.KeyValueStoreListKeysResult> {
        const { prefix, exclusiveStartKey, limit } = parseArgument(options, schemas.keyValueStoreListKeysOptions);

        // The native `listKeys` already returns a self-describing page (items + pagination cursors)
        // matching the `KeyValueStoreListKeysResult` contract.
        return this.#nativeBackend.listKeys(exclusiveStartKey, limit, prefix);
    }

    /**
     * Generates a public `file://` URL for accessing a specific record in the key-value store.
     *
     * Existence-agnostic per the {@apilink KeyValueStoreBackend} contract: the URL points at the file
     * the key is bound to if there is a record, and at the file it would be written to otherwise.
     * @param key The key of the record to generate the public URL for.
     */
    async getPublicUrl(key: string): Promise<string | undefined> {
        parseArgument(key, keySchema);
        return this.#nativeBackend.getPublicUrl(key);
    }

    /**
     * Tests whether a record with the given key exists without retrieving its value.
     *
     * @param key The queried record key.
     * @returns `true` if the record exists, `false` otherwise.
     */
    async recordExists(key: string): Promise<boolean> {
        parseArgument(key, keySchema);
        return this.#nativeBackend.recordExists(key);
    }

    async getValue(key: string): Promise<storage.KeyValueStoreRecord | undefined> {
        parseArgument(key, keySchema);

        const record = await this.#nativeBackend.getValue(key);
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
        // By the time a value reaches the backend the frontend (KeyValueStore codec) has already
        // serialized it: non-bytes become a `string`, everything else is a `Buffer`/typed array or a
        // stream. So we only accept those shapes here — there is no JSON inference or `String(value)`
        // coercion left to do.
        parseArgument(record, inputRecordShape);

        const { key, value } = record;
        // The frontend resolves the content type before it reaches the backend; this backend is a plain
        // byte transport and does not infer content types.
        const contentType = record.contentType ?? 'application/octet-stream';

        // Stream the value straight to disk without buffering it all into memory. The native client
        // consumes a Web `ReadableStream`, so convert the Node `Readable` we get from the frontend.
        if (isStream(value)) {
            const webStream = Readable.toWeb(value as Readable) as ReadableStream<Uint8Array>;
            await this.#nativeBackend.setValueStream(key, webStream, contentType);
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

        await this.#nativeBackend.setValue(key, buffer, contentType);
    }

    async deleteValue(key: string): Promise<void> {
        parseArgument(key, keySchema);
        await this.#nativeBackend.deleteValue(key);
    }
}
