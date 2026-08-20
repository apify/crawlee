import { MemoryStorageBackend } from '@crawlee/core';
import type { StorageIdentifier } from '@crawlee/types';

/** An in-memory backend whose storages omit `purge`, i.e. cannot be emptied in place. */
export class StorageBackendWithoutPurge extends MemoryStorageBackend {
    override async createDatasetBackend(options: StorageIdentifier = {}) {
        return withoutPurge(await super.createDatasetBackend(options));
    }

    override async createKeyValueStoreBackend(options: StorageIdentifier = {}) {
        return withoutPurge(await super.createKeyValueStoreBackend(options));
    }

    override async createRequestQueueBackend(options: StorageIdentifier = {}) {
        return withoutPurge(await super.createRequestQueueBackend(options));
    }

    /** The inherited run-scoped purge would call the `purge()` that is no longer there. */
    override async purge() {}
}

/**
 * Shadows the prototype method on this one instance rather than wrapping it: the storage state lives in the
 * real backend's private fields, so it has to stay the object handling the calls.
 */
function withoutPurge<T extends object>(backend: T): T {
    Object.defineProperty(backend, 'purge', { value: undefined, configurable: true });

    return backend;
}
