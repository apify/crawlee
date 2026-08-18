import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import type { FileSystemKeyValueStoreClient as NativeFileSystemKeyValueStoreBackend } from '@crawlee/fs-storage-native';
import { CachedIdClient } from './cached-id-client.js';
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
}
/**
 * A file-system key-value store backend backed by the native `@crawlee/fs-storage-native` Rust
 * extension.
 *
 * This adapter is a plain byte transport: values are written and read verbatim as `Buffer`s with a
 * content type carried alongside them. Serializing arbitrary values into bytes and parsing them back
 * is the {@apilink KeyValueStore} frontend codec's job, not this backend's.
 */
export declare class KeyValueStoreBackend extends CachedIdClient implements storage.KeyValueStoreBackend {
    #private;
    readonly name?: string;
    readonly cacheKey: string;
    constructor(options: KeyValueStoreBackendOptions);
    get keyValueStoreDirectory(): string;
    static create(options: KeyValueStoreBackendOptions): Promise<KeyValueStoreBackend>;
    getMetadata(): Promise<storage.KeyValueStoreInfo>;
    drop(): Promise<void>;
    purge(): Promise<void>;
    /**
     * Remove every record from the store except the run input. Used by
     * {@link FileSystemStorageBackend.purge} to clean the default key-value store at the start of a run
     * while preserving the run's input, matching the historical file-system storage behavior.
     *
     * The native `purge` keep-list matches by exact key with no extension globbing, so we pass every
     * filename the input might live under (`INPUT`, `INPUT.json`, `INPUT.txt`, `INPUT.bin`).
     */
    purgeExceptInput(): Promise<void>;
    listKeys(options?: storage.KeyValueStoreListKeysOptions): Promise<storage.KeyValueStoreListKeysResult>;
    /**
     * Generates a public `file://` URL for accessing a specific record in the key-value store.
     *
     * Returns `undefined` if the record does not exist.
     * @param key The key of the record to generate the public URL for.
     */
    getPublicUrl(key: string): Promise<string | undefined>;
    /**
     * Tests whether a record with the given key exists without retrieving its value.
     *
     * @param key The queried record key.
     * @returns `true` if the record exists, `false` otherwise.
     */
    recordExists(key: string): Promise<boolean>;
    getValue(key: string): Promise<storage.KeyValueStoreRecord | undefined>;
    setValue(record: storage.KeyValueStoreInputRecord): Promise<void>;
    deleteValue(key: string): Promise<void>;
    /**
     * Resolve `key` to the on-disk key that actually exists, or `undefined` if nothing does. Every
     * key is checked against its tracked record; the run-input keys additionally fall back to
     * out-of-band bare files, in which case the matched on-disk key is returned so callers like
     * `getPublicUrl` point at the file that exists. Two run-input shapes are handled (see
     * {@link bareFallbacksFor}): the logical `INPUT`, which probes the conventional extensions, and a
     * literal bare filename such as `INPUT.json` as listed by `listKeys`, which resolves itself.
     */
    private resolveExistingKey;
    /**
     * The native `resolveValue`/`resolveExistingKey` bare-file fallbacks to use for `key`, or
     * `undefined` if `key` is a plain tracked-record lookup with no bare-file probing.
     *
     * - The logical run-input key (`INPUT`) probes the full extension ladder (`INPUT`, `INPUT.json`,
     *   `INPUT.txt`, `INPUT.bin`), matching how Crawlee reads run input.
     * - A literal bare filename as surfaced by `listKeys` (`INPUT.json`/`.txt`/`.bin`) resolves itself:
     *   the tracked record first, then the bare file at that exact name (a single empty-extension
     *   fallback), so a listed key round-trips through `getValue`/`recordExists`.
     */
    private bareFallbacksFor;
}
