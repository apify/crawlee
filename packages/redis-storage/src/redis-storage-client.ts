import type { Redis } from 'ioredis';

import type * as storage from '@crawlee/types';
import type { Dictionary } from '@crawlee/types';
import { MemoryStorage, type MemoryStorageOptions } from '@crawlee/memory-storage';

import { RedisRequestQueueClient } from './resource-clients/request-queue';
import { RedisRequestQueueCollectionClient } from './resource-clients/request-queue-collection';

export interface RedisStorageClientOptions {
    /**
     * Local storage directory used by the delegated {@linkcode MemoryStorage}
     * for datasets and key-value stores.
     * @default process.env.CRAWLEE_STORAGE_DIR ?? './storage'
     */
    localDataDirectory?: MemoryStorageOptions['localDataDirectory'];

    /**
     * Whether the delegated MemoryStorage should persist datasets and
     * key-value stores to the local filesystem.
     * @default true
     */
    persistStorage?: MemoryStorageOptions['persistStorage'];
}

/**
 * A Crawlee {@linkcode storage.StorageClient} backed by Redis.
 *
 * **Request queues** are stored entirely in Redis using atomic Lua scripts for
 * deduplication, ordered processing and distributed lock management. This
 * allows multiple worker processes (on any machine) to share a single queue.
 *
 * **Datasets** and **Key-Value stores** are currently delegated to an
 * in-process {@linkcode MemoryStorage} instance (with optional disk
 * persistence). Full Redis backends for those types may be added in future
 * releases.
 *
 * @example
 * ```ts
 * import Redis from 'ioredis';
 * import { Configuration } from 'crawlee';
 * import { RedisStorageClient } from '@crawlee/redis-storage';
 *
 * const redis = new Redis('redis://localhost:6379');
 * const storage = new RedisStorageClient(redis);
 * Configuration.getGlobalConfig().set('storageClient', storage);
 * ```
 */
export class RedisStorageClient implements storage.StorageClient {
    private readonly redis: Redis;
    private readonly memoryStorage: MemoryStorage;
    private readonly queueCollectionClient: RedisRequestQueueCollectionClient;

    constructor(redis: Redis, options: RedisStorageClientOptions = {}) {
        this.redis = redis;
        this.memoryStorage = new MemoryStorage({
            localDataDirectory: options.localDataDirectory,
            persistStorage: options.persistStorage,
        });
        this.queueCollectionClient = new RedisRequestQueueCollectionClient(redis);
    }

    // ── Dataset / KV store — delegated to MemoryStorage ──────────────────────

    datasets(): storage.DatasetCollectionClient {
        return this.memoryStorage.datasets();
    }

    dataset<Data extends Dictionary = Dictionary>(id: string): storage.DatasetClient<Data> {
        return this.memoryStorage.dataset<Data>(id);
    }

    keyValueStores(): storage.KeyValueStoreCollectionClient {
        return this.memoryStorage.keyValueStores();
    }

    keyValueStore(id: string): storage.KeyValueStoreClient {
        return this.memoryStorage.keyValueStore(id);
    }

    // ── Request queues — backed by Redis ─────────────────────────────────────

    requestQueues(): storage.RequestQueueCollectionClient {
        return this.queueCollectionClient;
    }

    requestQueue(id: string, _options?: storage.RequestQueueOptions): storage.RequestQueueClient {
        return new RedisRequestQueueClient(this.redis, id);
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async purge(): Promise<void> {
        await this.memoryStorage.purge();
    }

    async teardown(): Promise<void> {
        await this.memoryStorage.teardown();
    }

    async setStatusMessage(_message: string, _options?: storage.SetStatusMessageOptions): Promise<void> {
        // Status messages are a no-op for self-hosted Redis deployments.
    }
}
