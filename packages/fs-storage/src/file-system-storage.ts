import { opendir, readFile } from 'node:fs/promises';
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
     */
    localDataDirectory: string;

    /**
     * Optional logger for FileSystemStorageClient warnings.
     */
    logger?: CrawleeLogger;

    /**
     * How the on-disk request queues opened by this client are expected to be accessed.
     *
     * With `'single'` (the default), this process asserts it is the *sole* consumer of every request
     * queue it opens: on open, any requests that a previous run left *in progress* (e.g. after a
     * crash) are reclaimed immediately, so they become fetchable again right away. This is the right
     * behavior for the common single-process crawl.
     *
     * Use `'shared'` if multiple processes share the same on-disk request queue concurrently (for
     * example, the {@apilink parallel scraping setup | "Parallel Scraping Guide"}). In that mode an
     * in-progress request is treated as a potential live peer's lock and is only reclaimed once that
     * lock expires on the wall clock, so two workers won't process the same request at once.
     *
     * @default 'single'
     */
    requestQueueAccess?: 'single' | 'shared';
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
    readonly requestQueueAccess: 'single' | 'shared';

    readonly keyValueStoreCache: KeyValueStoreClient[] = [];
    readonly datasetClientCache: DatasetClient[] = [];
    readonly requestQueueCache: RequestQueueClient[] = [];

    constructor(options: FileSystemStorageOptions) {
        s.object({
            localDataDirectory: s.string(),
            requestQueueAccess: s.enum(['single', 'shared']).optional(),
        }).parse(options);

        this.logger = options.logger;
        this.requestQueueAccess = options.requestQueueAccess ?? 'single';

        this.localDataDirectory = options.localDataDirectory;
        this.datasetsDirectory = resolve(this.localDataDirectory, 'datasets');
        this.keyValueStoresDirectory = resolve(this.localDataDirectory, 'key_value_stores');
        this.requestQueuesDirectory = resolve(this.localDataDirectory, 'request_queues');
    }

    /**
     * Return a cache key that includes the resolved storage directory, so that two
     * `FileSystemStorageClient` instances pointing at different directories get separate cache
     * partitions, by including the storage directory in the cache key.
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
            logger: this.logger,
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
            this.requestQueueAccess,
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
        let clients: (KeyValueStoreClient | DatasetClient | RequestQueueClient)[];
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

        // Otherwise, resolve any on-disk storage that matches the queried string — either by its
        // directory name, or (for a storage opened by name, whose directory is named after the name)
        // by scanning the `__metadata__.json` files for a matching id.
        //
        // A directory-name match does NOT by itself prove the string is the storage's *id*: the
        // directory is named after `name ?? id`, so `named-storage`/`on-disk` (a name or alias) also
        // has a matching directory. We therefore read the real id from the metadata and only report
        // existence when it equals the queried string. This matches upstream PR #3800/#3808 and
        // prevents a named storage from being re-resolved as `{ id: name }` on a subsequent run.
        const resolvedId = await FileSystemStorageClient.resolveStorageIdOnDisk(baseDir, id);
        return resolvedId === id;
    }

    /**
     * Resolve the real `id` of the on-disk storage identified by `entryNameOrId` under `baseDirectory`,
     * or `undefined` if none matches. The storage's real id lives in its directory's
     * `__metadata__.json`; the directory itself is named after the storage's `name ?? id`. So this
     * first tries the directory named exactly `entryNameOrId` (reading its metadata id), then falls
     * back to scanning sibling directories for one whose metadata id equals `entryNameOrId` (the case
     * of a storage opened by name and later looked up by its auto-assigned id).
     */
    private static async resolveStorageIdOnDisk(
        baseDirectory: string,
        entryNameOrId: string,
    ): Promise<string | undefined> {
        // Directory named exactly after the string: return its real (metadata) id, which may differ
        // from the string when the string is a name rather than an id.
        const directId = await FileSystemStorageClient.readMetadataId(resolve(baseDirectory, entryNameOrId));
        if (directId !== undefined) {
            return directId;
        }

        // No such directory — scan siblings for one whose metadata id matches the string.
        let directories;
        try {
            directories = await opendir(baseDirectory);
        } catch {
            return undefined;
        }

        for await (const directory of directories) {
            if (!directory.isDirectory()) {
                continue;
            }

            const metadataId = await FileSystemStorageClient.readMetadataId(resolve(baseDirectory, directory.name));
            if (metadataId === entryNameOrId) {
                return metadataId;
            }
        }

        return undefined;
    }

    /** Read the `id` field from a storage directory's `__metadata__.json`, or `undefined` if absent. */
    private static async readMetadataId(storageDirectory: string): Promise<string | undefined> {
        try {
            const fileContent = await readFile(resolve(storageDirectory, '__metadata__.json'), 'utf8');
            return (JSON.parse(fileContent) as { id?: string }).id;
        } catch {
            // Directory missing, or no/unreadable metadata file — no id to report.
            return undefined;
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
        // Resolve the default stores up front so leftover on-disk records are purged even when the
        // store has not been opened in this process yet (e.g. a fresh run over a pre-existing
        // directory). Opening caches the client, so the subsequent purge operates on a real client.
        // The default store is opened via the internal `__default__` alias (see resolveStorageIdentifier
        // in @crawlee/core), which resolves to the `default` cache key — match that here so we purge the
        // very client the default open would return rather than creating a divergent one.
        const [defaultKeyValueStore, defaultDataset, defaultRequestQueue] = await Promise.all([
            this.createKeyValueStoreClient({ alias: '__default__' }) as Promise<KeyValueStoreClient>,
            this.createDatasetClient({ alias: '__default__' }) as Promise<DatasetClient>,
            this.createRequestQueueClient({ alias: '__default__' }) as Promise<RequestQueueClient>,
        ]);

        await Promise.all([
            // Preserve the run input (INPUT) when purging the default key-value store.
            defaultKeyValueStore.purgeExceptInput(),
            defaultDataset.purge(),
            defaultRequestQueue.purge(),
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
