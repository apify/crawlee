import { resolve } from 'node:path';

/**
 * The on-disk directory layout a `FileSystemStorageBackend` writes under its configured
 * `localDataDirectory`. The layout is part of the documented contract, so the tests compute it here
 * instead of reading it back off the backend instance — that way they assert the layout rather than
 * echo whatever the backend happens to have resolved.
 */
export function storageLayout(localDataDirectory: string) {
    return {
        datasetsDirectory: resolve(localDataDirectory, 'datasets'),
        keyValueStoresDirectory: resolve(localDataDirectory, 'key_value_stores'),
        requestQueuesDirectory: resolve(localDataDirectory, 'request_queues'),
    };
}
