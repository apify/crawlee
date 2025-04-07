import crypto from 'node:crypto';

import type { Dictionary, StorageClient } from '@crawlee/types';

import { Configuration } from '../configuration';
import { KeyValueStore } from './key_value_store';

/**
 * Options for purging default storage.
 */
interface PurgeDefaultStorageOptions {
    /**
     * If set to `true`, calling multiple times will only have effect at the first time.
     */
    onlyPurgeOnce?: boolean;
    config?: Configuration;
    client?: StorageClient;
}

/**
 * Cleans up the local storage folder (defaults to `./storage`) created when running code locally.
 * Purging will remove all the files in all storages except for INPUT.json in the default KV store.
 *
 * Purging of storages is happening automatically when we run our crawler (or when we open some storage
 * explicitly, e.g. via `RequestList.open()`). We can disable that via `purgeOnStart` {@apilink Configuration}
 * option or by setting `CRAWLEE_PURGE_ON_START` environment variable to `0` or `false`.
 *
 * This is a shortcut for running (optional) `purge` method on the StorageClient interface, in other words
 * it will call the `purge` method of the underlying storage implementation we are currently using. You can
 * make sure the storage is purged only once for a given execution context if you set `onlyPurgeOnce` to `true` in
 * the `options` object
 */
export async function purgeDefaultStorages(options?: PurgeDefaultStorageOptions): Promise<void>;
/**
 * Cleans up the local storage folder (defaults to `./storage`) created when running code locally.
 * Purging will remove all the files in all storages except for INPUT.json in the default KV store.
 *
 * Purging of storages is happening automatically when we run our crawler (or when we open some storage
 * explicitly, e.g. via `RequestList.open()`). We can disable that via `purgeOnStart` {@apilink Configuration}
 * option or by setting `CRAWLEE_PURGE_ON_START` environment variable to `0` or `false`.
 *
 * This is a shortcut for running (optional) `purge` method on the StorageClient interface, in other words
 * it will call the `purge` method of the underlying storage implementation we are currently using.
 */
export async function purgeDefaultStorages(config?: Configuration, client?: StorageClient): Promise<void>;
export async function purgeDefaultStorages(
    configOrOptions?: Configuration | PurgeDefaultStorageOptions,
    client?: StorageClient,
) {
    const options: PurgeDefaultStorageOptions =
        configOrOptions instanceof Configuration
            ? {
                  client,
                  config: configOrOptions,
              }
            : (configOrOptions ?? {});
    const { config = Configuration.getGlobalConfig(), onlyPurgeOnce = false } = options;
    ({ client = config.getStorageClient() } = options);

    const casted = client as StorageClient & { __purged?: boolean };

    // if `onlyPurgeOnce` is true, will purge anytime this function is called, otherwise - only on start
    if (!onlyPurgeOnce || (config.get('purgeOnStart') && !casted.__purged)) {
        casted.__purged = true;
        await casted.purge?.();
    }
}

export interface UseStateOptions {
    config?: Configuration;
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
 * @param options An optional object parameter where a custom `keyValueStoreName` and `config` can be passed in.
 */
export async function useState<State extends Dictionary = Dictionary>(
    name?: string,
    defaultValue = {} as State,
    options?: UseStateOptions,
) {
    const kvStore = await KeyValueStore.open(options?.keyValueStoreName, {
        config: options?.config || Configuration.getGlobalConfig(),
    });
    return kvStore.getAutoSavedValue<State>(name || 'CRAWLEE_GLOBAL_STATE', defaultValue);
}

/**
 * Helper function that creates ID from uniqueKey for local emulation of request queue.
 * It's also used for local cache of remote request queue.
 *
 * This function may not exactly match how requestId is created server side.
 * So we never pass requestId created by this to server and use it only for local cache.
 *
 * @internal
 */
export function getRequestId(uniqueKey: string) {
    const str = crypto.createHash('sha256').update(uniqueKey).digest('base64').replace(/[+/=]/g, '');

    return str.slice(0, 15);
}

/**
 * When requesting queue head we always fetch requestsInProgressCount * QUERY_HEAD_BUFFER number of requests.
 * @internal
 */
export const QUERY_HEAD_MIN_LENGTH = 100;

/**
 * Indicates how long it usually takes for the underlying storage to propagate all writes
 * to be available to subsequent reads.
 * @internal
 */
export const STORAGE_CONSISTENCY_DELAY_MILLIS = 3000;

/** @internal */
export const QUERY_HEAD_BUFFER = 3;

/**
 * If queue was modified (request added/updated/deleted) before more than API_PROCESSED_REQUESTS_DELAY_MILLIS
 * then we assume the get head operation to be consistent.
 * @internal
 */
export const API_PROCESSED_REQUESTS_DELAY_MILLIS = 10_000;

/**
 * How many times we try to get queue head with queueModifiedAt older than API_PROCESSED_REQUESTS_DELAY_MILLIS.
 * @internal
 */
export const MAX_QUERIES_FOR_CONSISTENCY = 6;
