import type { StorageClient } from '@crawlee/types';
import { Configuration } from '../configuration';

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
