import type { BaseHttpClient } from '@crawlee/http-client';
import type { Dictionary, StorageBackend } from '@crawlee/types';
import { Configuration } from '../configuration.js';
import type { IProxyConfiguration } from '../proxy_configuration.js';
/**
 * Options for purging default storage.
 */
interface PurgeDefaultStorageOptions {
    /**
     * If set to `true`, calling multiple times will only have effect at the first time.
     */
    onlyPurgeOnce?: boolean;
    configuration?: Configuration;
    storageBackend?: StorageBackend;
}
/**
 * Cleans up the local storage folder (defaults to `./storage`) created when running code locally.
 * Purging empties the storages that belong to a single run — the default one and every alias-keyed one —
 * keeping only INPUT.json in the default KV store. Named storages persist across runs and are not touched.
 *
 * Purging of storages is happening automatically when we run our crawler (or when we open some storage
 * explicitly, e.g. via `RequestList.open()`). We can disable that via `purgeOnStart` {@apilink Configuration}
 * option or by setting `CRAWLEE_PURGE_ON_START` environment variable to `0` or `false`.
 *
 * This is a shortcut for running (optional) `purge` method on the StorageBackend interface, in other words
 * it will call the `purge` method of the underlying storage implementation we are currently using. You can
 * make sure the storage is purged only once for a given execution context if you set `onlyPurgeOnce` to `true` in
 * the `options` object
 */
export declare function purgeDefaultStorages(options?: PurgeDefaultStorageOptions): Promise<void>;
/**
 * Cleans up the local storage folder (defaults to `./storage`) created when running code locally.
 * Purging empties the storages that belong to a single run — the default one and every alias-keyed one —
 * keeping only INPUT.json in the default KV store. Named storages persist across runs and are not touched.
 *
 * Purging of storages is happening automatically when we run our crawler (or when we open some storage
 * explicitly, e.g. via `RequestList.open()`). We can disable that via `purgeOnStart` {@apilink Configuration}
 * option or by setting `CRAWLEE_PURGE_ON_START` environment variable to `0` or `false`.
 *
 * This is a shortcut for running (optional) `purge` method on the StorageBackend interface, in other words
 * it will call the `purge` method of the underlying storage implementation we are currently using.
 */
export declare function purgeDefaultStorages(configuration?: Configuration, storageBackend?: StorageBackend): Promise<void>;
export interface UseStateOptions {
    configuration?: Configuration;
    /**
     * The name of the key-value store you'd like the state to be stored in.
     * If not provided, the default store will be used.
     */
    keyValueStoreName?: string | null;
}
/**
 * Easily create and manage state values. All state values are automatically persisted.
 *
 * Values can be modified by simply using the assignment operator.
 *
 * @param name The name of the store to use.
 * @param defaultValue If the store does not yet have a value in it, the value will be initialized with the `defaultValue` you provide.
 * @param options An optional object parameter where a custom `keyValueStoreName` and `configuration` can be passed in.
 */
export declare function useState<State extends Dictionary = Dictionary>(name?: string, defaultValue?: State, options?: UseStateOptions): Promise<State>;
/**
 * Helper function that creates ID from uniqueKey for local emulation of request queue.
 * It's also used for local cache of remote request queue.
 *
 * This function may not exactly match how requestId is created server side.
 * So we never pass requestId created by this to server and use it only for local cache.
 *
 * @internal
 */
export declare function getRequestId(uniqueKey: string): string;
/**
 * When requesting queue head we always fetch requestsInProgressCount * QUERY_HEAD_BUFFER number of requests.
 * @internal
 */
export declare const QUERY_HEAD_MIN_LENGTH = 100;
/**
 * Indicates how long it usually takes for the underlying storage to propagate all writes
 * to be available to subsequent reads.
 * @internal
 */
export declare const STORAGE_CONSISTENCY_DELAY_MILLIS = 3000;
/** @internal */
export declare const QUERY_HEAD_BUFFER = 3;
/**
 * If queue was modified (request added/updated/deleted) before more than API_PROCESSED_REQUESTS_DELAY_MILLIS
 * then we assume the get head operation to be consistent.
 * @internal
 */
export declare const API_PROCESSED_REQUESTS_DELAY_MILLIS = 10000;
/**
 * How many times we try to get queue head with queueModifiedAt older than API_PROCESSED_REQUESTS_DELAY_MILLIS.
 * @internal
 */
export declare const MAX_QUERIES_FOR_CONSISTENCY = 6;
/** @internal */
export interface DualIterableOptions<TItem, TRawPage> {
    /** Factory that returns an async generator yielding pages. */
    createPages: () => AsyncGenerator<TRawPage>;
    /** Extracts individual items from a page (for iteration). */
    extractItems: (page: TRawPage) => TItem[];
}
/**
 * Creates an object that is both an `AsyncIterable<TItem>` (for `for await...of`)
 * and a `Promise<TItem[]>` (for `await`) from a single async page generator.
 *
 * - `await result` drains all pages from a fresh generator and returns every
 *   item as a flat array.
 * - `for await (const item of result)` streams all items across all pages,
 *   yielding them one by one without buffering everything in memory.
 *
 * Each usage path creates its own generator instance, so `await` and
 * `for await...of` never interfere with each other.
 *
 * @internal
 */
export declare function createDualIterable<TItem, TRawPage>(options: DualIterableOptions<TItem, TRawPage>): AsyncIterable<TItem> & Promise<TItem[]>;
/**
 * Options for the static `open()` method on storage classes ({@apilink Dataset}, {@apilink KeyValueStore}, {@apilink RequestQueue}).
 */
export interface StorageOpenOptions {
    /**
     * SDK configuration instance, defaults to the static register.
     */
    configuration?: Configuration;
    /**
     * Optional storage backend that should be used to open storages.
     */
    storageBackend?: StorageBackend;
    /**
     * Used to pass the proxy configuration for the `requestsFromUrl` objects.
     * Takes advantage of the internal address rotation and authentication process.
     * If undefined, the `requestsFromUrl` requests will be made without proxy.
     */
    proxyConfiguration?: IProxyConfiguration;
    /**
     * HTTP client to be used to download the list of URLs in `RequestQueue`.
     */
    httpClient?: BaseHttpClient;
}
export {};
