import { randomUUID } from 'node:crypto';

import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import { DatasetClient } from './resource-clients/dataset.js';
import { KeyValueStoreClient } from './resource-clients/key-value-store.js';
import { RequestQueueClient } from './resource-clients/request-queue.js';

export interface MemoryStorageOptions {
    /**
     * Ignored. Kept for API compatibility with the previous disk-backed implementation and with
     * `FileSystemStorageClient`. The in-memory storage never touches the disk.
     */
    localDataDirectory?: string;

    /**
     * Ignored. Kept for API compatibility. The in-memory storage never writes metadata files.
     */
    writeMetadata?: boolean;

    /**
     * Ignored. Kept for API compatibility. The in-memory storage never persists to disk.
     * Use `FileSystemStorageClient` (the default) if you need persistence.
     */
    persistStorage?: boolean;

    /**
     * Optional logger for MemoryStorageClient warnings.
     */
    logger?: CrawleeLogger;
}

export class MemoryStorageClient implements storage.StorageClient {
    readonly logger?: CrawleeLogger;

    /**
     * Unique per-instance cache partition key. Mirrors the way `FileSystemStorageClient` partitions its
     * cache by storage directory: two distinct `MemoryStorageClient` instances must not share cached clients.
     */
    private readonly cacheKey = `MemoryStorageClient:${randomUUID()}`;

    readonly keyValueStoreCache: KeyValueStoreClient[] = [];
    readonly datasetClientCache: DatasetClient[] = [];
    readonly requestQueueCache: RequestQueueClient[] = [];

    constructor(options: MemoryStorageOptions = {}) {
        s.object({
            localDataDirectory: s.string().optional(),
            writeMetadata: s.boolean().optional(),
            persistStorage: s.boolean().optional(),
        }).parse(options);

        this.logger = options.logger;
    }

    /**
     * Return a per-instance unique cache key so that distinct `MemoryStorageClient` instances get separate
     * cache partitions in the storage-client cache.
     */
    getStorageClientCacheKey(): string {
        return this.cacheKey;
    }

    private static resolveStorageKey(options: { id?: string; name?: string; alias?: string }): {
        isAlias: boolean;
        directoryKey: string | undefined;
    } {
        const isAlias = 'alias' in options && !!options.alias;
        const rawKey = isAlias ? options.alias : (options.name ?? options.id);
        // Normalize the internal __default__ alias to the user-facing 'default' name.
        const directoryKey = rawKey === '__default__' ? 'default' : rawKey;
        return { isAlias, directoryKey };
    }

    async createDatasetClient(options: storage.CreateDatasetClientOptions = {}): Promise<storage.DatasetClient> {
        const { isAlias, directoryKey } = MemoryStorageClient.resolveStorageKey(options);

        if (directoryKey) {
            const found = this.datasetClientCache.find(
                (store) =>
                    store.id === directoryKey ||
                    store.name?.toLowerCase() === directoryKey.toLowerCase() ||
                    store.directoryName.toLowerCase() === directoryKey.toLowerCase(),
            );
            if (found) {
                return found;
            }
        }

        const newStore = new DatasetClient({
            name: isAlias ? undefined : directoryKey,
            directoryName: directoryKey,
            client: this,
        });
        this.datasetClientCache.push(newStore);

        return newStore;
    }

    async createKeyValueStoreClient(
        options: storage.CreateKeyValueStoreClientOptions = {},
    ): Promise<storage.KeyValueStoreClient> {
        const { isAlias, directoryKey } = MemoryStorageClient.resolveStorageKey(options);

        if (directoryKey) {
            const found = this.keyValueStoreCache.find(
                (store) =>
                    store.id === directoryKey ||
                    store.name?.toLowerCase() === directoryKey.toLowerCase() ||
                    store.directoryName.toLowerCase() === directoryKey.toLowerCase(),
            );
            if (found) {
                return found;
            }
        }

        const newStore = new KeyValueStoreClient({
            name: isAlias ? undefined : directoryKey,
            directoryName: directoryKey,
            client: this,
        });
        this.keyValueStoreCache.push(newStore);

        return newStore;
    }

    async createRequestQueueClient(
        options: storage.CreateRequestQueueClientOptions = {},
    ): Promise<storage.RequestQueueClient> {
        const { isAlias, directoryKey } = MemoryStorageClient.resolveStorageKey(options);

        if (directoryKey) {
            const found = this.requestQueueCache.find(
                (queue) =>
                    queue.id === directoryKey ||
                    queue.name?.toLowerCase() === directoryKey.toLowerCase() ||
                    queue.directoryName.toLowerCase() === directoryKey.toLowerCase(),
            );
            if (found) {
                return found;
            }
        }

        const newStore = new RequestQueueClient({
            name: isAlias ? undefined : directoryKey,
            directoryName: directoryKey,
            client: this,
        });
        this.requestQueueCache.push(newStore);

        return newStore;
    }

    async storageExists(id: string, type: 'Dataset' | 'KeyValueStore' | 'RequestQueue'): Promise<boolean> {
        let clients: { id: string }[];

        switch (type) {
            case 'Dataset':
                clients = this.datasetClientCache;
                break;
            case 'KeyValueStore':
                clients = this.keyValueStoreCache;
                break;
            case 'RequestQueue':
                clients = this.requestQueueCache;
                break;
            default:
                return false;
        }

        // In-memory storage only knows about clients in its cache.
        return clients.some((store) => store.id === id);
    }

    async setStatusMessage(message: string, options: storage.SetStatusMessageOptions = {}): Promise<void> {
        s.string().parse(message);
        s.object({
            isStatusMessageTerminal: s.boolean().optional(),
        }).parse(options);

        return Promise.resolve();
    }

    /**
     * Cleans up the default storages before the run starts. For the in-memory storage this simply
     * resets the in-memory state of the cached default dataset, key-value store and request queue.
     *
     * As with `FileSystemStorageClient`, the run's input (the `INPUT` key in the default key-value
     * store) is preserved — only the rest of the default storages is cleared.
     */
    async purge(): Promise<void> {
        // The run default is opened via `{ alias: '__default__' }`, which `resolveStorageKey`
        // normalizes to `directoryName === 'default'` (with `name === undefined`) — that is the clause
        // that actually matches it. The `name === 'default'` clause additionally covers a store a user
        // explicitly opened via `{ name: 'default' }`. (`'__default__'` never reaches `directoryName`,
        // as it is always normalized to `'default'` first, so it does not need to be checked here.)
        const isDefault = (store: { name?: string; directoryName: string }) =>
            store.name === 'default' || store.directoryName === 'default';

        const purgeDefaults = async <T extends { name?: string; directoryName: string }>(
            cache: T[],
            purgeStore: (store: T) => Promise<void>,
        ) => {
            await Promise.all(cache.filter(isDefault).map(async (store) => purgeStore(store)));
        };

        await Promise.all([
            // Preserve the run input (INPUT) when purging the default key-value store, matching
            // `FileSystemStorageClient`.
            purgeDefaults(this.keyValueStoreCache, async (store) => store.purgeExceptInput()),
            purgeDefaults(this.datasetClientCache, async (store) => store.purge()),
            purgeDefaults(this.requestQueueCache, async (store) => store.purge()),
        ]);
    }

    /**
     * This method should be called at the end of the process. The in-memory storage holds no resources
     * that outlive the process (no file handles, no cross-process locks), so there is nothing to do.
     */
    async teardown(): Promise<void> {
        // Nothing to tear down for in-memory storage.
    }
}
