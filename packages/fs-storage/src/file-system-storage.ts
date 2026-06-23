import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import {
    FileSystemDatasetClient as NativeDatasetClient,
    FileSystemKeyValueStoreClient as NativeKeyValueStoreClient,
    FileSystemRequestQueueClient as NativeRequestQueueClient,
} from '@crawlee/fs-storage-native';
import { DatasetClient } from './resource-clients/dataset.js';
import { KeyValueStoreClient } from './resource-clients/key-value-store.js';
import { RequestQueueClient } from './resource-clients/request-queue.js';

export interface FileSystemStorageOptions {
    /**
     * Path to directory where the data will be saved.
     * @default process.env.CRAWLEE_STORAGE_DIR ?? './storage'
     */
    localDataDirectory?: string;

    /**
     * Optional logger for FileSystemStorageClient warnings.
     */
    logger?: CrawleeLogger;

    /**
     * Assert that this process is the *sole* consumer of every request queue it opens.
     *
     * When `true` (the default), opening a queue immediately reclaims any requests that a previous
     * run left *in progress* (e.g. after a crash), so they become fetchable again right away. This is
     * the right behavior for the common single-process crawl.
     *
     * Set this to `false` if multiple processes share the same on-disk request queue concurrently
     * (for example, the {@apilink parallel scraping setup | "Parallel Scraping Guide"}). In that mode
     * an in-progress request is treated as a potential live peer's lock and is only reclaimed once
     * that lock expires on the wall clock, so two workers won't process the same request at once.
     *
     * @default true
     */
    assumeSoleOwner?: boolean;
}

/**
 * A file-system storage client backed by the native `@crawlee/fs-storage-native` Rust extension.
 *
 * The native extension owns the on-disk format, timestamps, item counting, request-queue locking and
 * state persistence. This class is responsible for resolving the user-facing `id` / `name` / `alias`
 * identifiers to native storages, caching the opened clients (so that `storageExists`, `purge` and
 * `teardown` can operate over them), and exposing them through the `@crawlee/types` interfaces.
 */
export class FileSystemStorageClient implements storage.StorageClient {
    readonly localDataDirectory: string;
    readonly datasetsDirectory: string;
    readonly keyValueStoresDirectory: string;
    readonly requestQueuesDirectory: string;
    readonly logger?: CrawleeLogger;
    readonly assumeSoleOwner: boolean;

    readonly keyValueStoreCache: KeyValueStoreClient[] = [];
    readonly datasetClientCache: DatasetClient[] = [];
    readonly requestQueueCache: RequestQueueClient[] = [];

    constructor(options: FileSystemStorageOptions = {}) {
        s.object({
            localDataDirectory: s.string().optional(),
            assumeSoleOwner: s.boolean().optional(),
        }).parse(options);

        this.logger = options.logger;
        this.assumeSoleOwner = options.assumeSoleOwner ?? true;

        // v3.0.0 used `crawlee_storage` as the default, we changed this in v3.0.1 to just `storage`,
        // this function handles it without making BC breaks - it respects existing `crawlee_storage`
        // directories, and uses the `storage` only if it's not there.
        const defaultStorageDir = () => {
            if (existsSync(resolve('./crawlee_storage'))) {
                return './crawlee_storage';
            }

            return './storage';
        };

        this.localDataDirectory = options.localDataDirectory ?? process.env.CRAWLEE_STORAGE_DIR ?? defaultStorageDir();
        this.datasetsDirectory = resolve(this.localDataDirectory, 'datasets');
        this.keyValueStoresDirectory = resolve(this.localDataDirectory, 'key_value_stores');
        this.requestQueuesDirectory = resolve(this.localDataDirectory, 'request_queues');
    }

    /**
     * Return a cache key that includes the resolved storage directory, so that two
     * `FileSystemStorageClient` instances pointing at different directories get separate cache
     * partitions. Mirrors crawlee-python's `FileSystemStorageClient`, which includes the storage
     * directory in its cache key.
     */
    getStorageClientCacheKey(): string {
        return `FileSystemStorageClient:${resolve(this.localDataDirectory)}`;
    }

    private static resolveStorageKey(options: { id?: string; name?: string; alias?: string }): {
        id?: string;
        name?: string;
        alias?: string;
        cacheKey: string | undefined;
    } {
        const isAlias = 'alias' in options && !!options.alias;
        const rawKey = isAlias ? options.alias : (options.name ?? options.id);
        // Normalize the internal __default__ alias to the user-facing 'default' name.
        const cacheKey = rawKey === '__default__' ? 'default' : rawKey;
        return { id: options.id, name: options.name, alias: options.alias, cacheKey };
    }

    async createDatasetClient(options: storage.CreateDatasetClientOptions = {}): Promise<storage.DatasetClient> {
        const { id, name, alias, cacheKey } = FileSystemStorageClient.resolveStorageKey(options);

        if (cacheKey) {
            const found = this.datasetClientCache.find(
                (store) =>
                    store.id === cacheKey ||
                    store.name?.toLowerCase() === cacheKey.toLowerCase() ||
                    store.cacheKey.toLowerCase() === cacheKey.toLowerCase(),
            );
            if (found) {
                return found;
            }
        }

        const nativeClient = await NativeDatasetClient.open(id, name, alias, this.localDataDirectory);
        const newStore = await DatasetClient.create({
            name: alias ? undefined : (name ?? cacheKey),
            cacheKey: cacheKey ?? '',
            nativeClient,
        });
        this.datasetClientCache.push(newStore);

        return newStore;
    }

    async createKeyValueStoreClient(
        options: storage.CreateKeyValueStoreClientOptions = {},
    ): Promise<storage.KeyValueStoreClient> {
        const { id, name, alias, cacheKey } = FileSystemStorageClient.resolveStorageKey(options);

        if (cacheKey) {
            const found = this.keyValueStoreCache.find(
                (store) =>
                    store.id === cacheKey ||
                    store.name?.toLowerCase() === cacheKey.toLowerCase() ||
                    store.cacheKey.toLowerCase() === cacheKey.toLowerCase(),
            );
            if (found) {
                return found;
            }
        }

        const nativeClient = await NativeKeyValueStoreClient.open(id, name, alias, this.localDataDirectory);
        const newStore = await KeyValueStoreClient.create({
            name: alias ? undefined : (name ?? cacheKey),
            cacheKey: cacheKey ?? '',
            nativeClient,
            logger: this.logger,
        });
        this.keyValueStoreCache.push(newStore);

        return newStore;
    }

    async createRequestQueueClient(
        options: storage.CreateRequestQueueClientOptions = {},
    ): Promise<storage.RequestQueueClient> {
        const { id, name, alias, cacheKey } = FileSystemStorageClient.resolveStorageKey(options);

        if (cacheKey) {
            const found = this.requestQueueCache.find(
                (queue) =>
                    queue.id === cacheKey ||
                    queue.name?.toLowerCase() === cacheKey.toLowerCase() ||
                    queue.cacheKey.toLowerCase() === cacheKey.toLowerCase(),
            );
            if (found) {
                return found;
            }
        }

        const nativeClient = await NativeRequestQueueClient.open(
            id,
            name,
            alias,
            this.localDataDirectory,
            // useTestClock — always real wall-clock outside of native tests.
            undefined,
            this.assumeSoleOwner,
        );
        const newStore = await RequestQueueClient.create({
            name: alias ? undefined : (name ?? cacheKey),
            cacheKey: cacheKey ?? '',
            nativeClient,
            logger: this.logger,
        });
        this.requestQueueCache.push(newStore);

        return newStore;
    }

    async storageExists(id: string, type: 'Dataset' | 'KeyValueStore' | 'RequestQueue'): Promise<boolean> {
        let clients: { id: string }[];
        let baseDir: string;

        switch (type) {
            case 'Dataset':
                clients = this.datasetClientCache;
                baseDir = this.datasetsDirectory;
                break;
            case 'KeyValueStore':
                clients = this.keyValueStoreCache;
                baseDir = this.keyValueStoresDirectory;
                break;
            case 'RequestQueue':
                clients = this.requestQueueCache;
                baseDir = this.requestQueuesDirectory;
                break;
            default:
                return false;
        }

        // Check the in-memory cache by actual storage ID first.
        if (clients.some((store) => store.id === id)) {
            return true;
        }

        // Otherwise, check whether a directory named exactly after the queried ID exists on disk.
        // Only an exact directory-name match counts — this avoids false positives for alias-created
        // directories (e.g. a directory named 'asdf' created via `{ alias: 'asdf' }` should not make
        // `storageExists('asdf')` return true, since the actual storage ID is a UUID, not the alias).
        const cachedClients = clients as (KeyValueStoreClient | DatasetClient | RequestQueueClient)[];
        if (cachedClients.some((store) => store.cacheKey === id && store.id !== id)) {
            return false;
        }

        const { access } = await import('node:fs/promises');
        try {
            await access(resolve(baseDir, id));
            return true;
        } catch {
            return false;
        }
    }

    async setStatusMessage(message: string, options: storage.SetStatusMessageOptions = {}): Promise<void> {
        s.string().parse(message);
        s.object({
            isStatusMessageTerminal: s.boolean().optional(),
        }).parse(options);

        return Promise.resolve();
    }

    /**
     * Cleans up the default storages before the run starts:
     *  - the default dataset;
     *  - all records from the default key-value store, except for the "INPUT" key;
     *  - the default request queue.
     */
    async purge(): Promise<void> {
        const isDefault = (store: { name?: string; cacheKey: string }) =>
            store.name === 'default' || store.cacheKey === 'default';

        await Promise.all([
            // Preserve the run input (INPUT) when purging the default key-value store.
            ...this.keyValueStoreCache.filter(isDefault).map(async (store) => store.purgeExceptInput()),
            ...this.datasetClientCache.filter(isDefault).map(async (store) => store.purge()),
            ...this.requestQueueCache.filter(isDefault).map(async (store) => store.purge()),
        ]);
    }

    /**
     * This method should be called at the end of the process, to ensure all data is saved.
     *
     * It persists the state of every opened request queue so that requests fetched but not yet handled
     * are not stuck (until their lock expires) for the next consumer of the same on-disk queue.
     */
    async teardown(): Promise<void> {
        await Promise.all(this.requestQueueCache.map(async (queue) => queue.persistState()));
    }
}
