import type { Dictionary, StorageClient } from '@crawlee/types';
import { Configuration } from '../configuration';
import { KeyValueStore } from './key_value_store';

/**
 * Cleans up the local storage folder (defaults to `./storage`) created when running code locally.
 * Purging will remove all the files in all storages except for INPUT.json in the default KV store.
 *
 * Purging of storages is happening automatically when we run our crawler (or when we open some storage
 * explicitly, e.g. via `RequestList.open()`). We can disable that via `purgeOnStart` {@apilink Configuration}
 * option or by setting `CRAWLEE_PURGE_ON_START` environment variable to `0` or `false`.
 *
 * This is a shortcut for running (optional) `purge` method on the StorageClient interface, in other words
 * it will call the `purge` method of the underlying storage implementation we are currently using. In addition,
 * this method will make sure the storage is purged only once for a given execution context, so it is safe to call
 * it multiple times.
 */
export async function purgeDefaultStorages(config = Configuration.getGlobalConfig()) {
    const client = config.getStorageClient() as StorageClient & { __purged?: boolean };

    if (config.get('purgeOnStart') && !client.__purged) {
        client.__purged = true;
        await client.purge?.();
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
    const kvStore = await KeyValueStore.open(options?.keyValueStoreName, { config: options?.config || Configuration.getGlobalConfig() });
    return kvStore.getAutoSavedValue<State>(name || 'CRAWLEE_GLOBAL_STATE', defaultValue);
}
