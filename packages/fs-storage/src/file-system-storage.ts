import { opendir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import {
    FileSystemDatasetClient as NativeDatasetBackend,
    FileSystemKeyValueStoreClient as NativeKeyValueStoreBackend,
    FileSystemRequestQueueClient as NativeRequestQueueBackend,
} from '@crawlee/fs-storage-native';
import { DatasetBackend } from './resource-clients/dataset.js';
import { KeyValueStoreBackend } from './resource-clients/key-value-store.js';
import { RequestQueueBackend } from './resource-clients/request-queue.js';

/** The alias `@crawlee/core` opens the default (unnamed) storage under. */
const DEFAULT_STORAGE_ALIAS = '__default__';

export interface FileSystemStorageOptions {
    /**
     * Path to directory where the data will be saved.
     */
    localDataDirectory: string;

    /**
     * Optional logger for FileSystemStorageBackend warnings.
     */
    logger?: CrawleeLogger;

    /**
     * How the on-disk request queues opened by this backend are expected to be accessed.
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
 * A file-system storage backend backed by the native `@crawlee/fs-storage-native` Rust extension.
 *
 * The native extension owns the on-disk format, timestamps, item counting, request-queue locking and
 * state persistence. This class is responsible for resolving the user-facing `id` / `name` / `alias`
 * identifiers to native storages, caching the opened backends (so that `storageExists`, `purge` and
 * `teardown` can operate over them), and exposing them through the `@crawlee/types` interfaces.
 */
export class FileSystemStorageBackend implements storage.StorageBackend {
    readonly localDataDirectory: string;
    readonly datasetsDirectory: string;
    readonly keyValueStoresDirectory: string;
    readonly requestQueuesDirectory: string;
    readonly logger?: CrawleeLogger;
    readonly requestQueueAccess: 'single' | 'shared';

    readonly keyValueStoreBackendCache: KeyValueStoreBackend[] = [];
    readonly datasetBackendCache: DatasetBackend[] = [];
    readonly requestQueueBackendCache: RequestQueueBackend[] = [];

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
     * `FileSystemStorageBackend` instances pointing at different directories get separate cache
     * partitions, by including the storage directory in the cache key.
     */
    getStorageBackendCacheKey(): string {
        return `FileSystemStorageBackend:${resolve(this.localDataDirectory)}`;
    }

    private static resolveStorageKey(options: { id?: string; name?: string; alias?: string }): {
        id?: string;
        name?: string;
        alias?: string;
        cacheKey: string | undefined;
    } {
        // No identifier at all means the default storage, which is opened under the reserved alias —
        // same rule as `resolveStorageIdentifier` in @crawlee/core, so that a backend used directly
        // lands on the very storage the frontends would have opened.
        const alias = options.alias || (!options.id && !options.name ? DEFAULT_STORAGE_ALIAS : undefined);
        const rawKey = alias ?? options.name ?? options.id;
        // Normalize the internal __default__ alias to the user-facing 'default' name.
        const cacheKey = rawKey === DEFAULT_STORAGE_ALIAS ? 'default' : rawKey;
        return { id: options.id, name: options.name, alias, cacheKey };
    }

    async createDatasetBackend(options: storage.StorageIdentifier = {}): Promise<storage.DatasetBackend> {
        const { id, name, alias, cacheKey } = FileSystemStorageBackend.resolveStorageKey(options);

        if (cacheKey) {
            const found = this.datasetBackendCache.find(
                (store) =>
                    store.id === cacheKey ||
                    store.name?.toLowerCase() === cacheKey.toLowerCase() ||
                    store.cacheKey.toLowerCase() === cacheKey.toLowerCase(),
            );
            if (found) {
                return found;
            }
        }

        const nativeBackend = await NativeDatasetBackend.open(id, name, alias, this.localDataDirectory);
        const newStore = await DatasetBackend.create({
            name: alias ? undefined : (name ?? cacheKey),
            cacheKey: cacheKey ?? '',
            nativeBackend,
            logger: this.logger,
        });
        this.datasetBackendCache.push(newStore);

        return newStore;
    }

    async createKeyValueStoreBackend(options: storage.StorageIdentifier = {}): Promise<storage.KeyValueStoreBackend> {
        const { id, name, alias, cacheKey } = FileSystemStorageBackend.resolveStorageKey(options);

        if (cacheKey) {
            const found = this.keyValueStoreBackendCache.find(
                (store) =>
                    store.id === cacheKey ||
                    store.name?.toLowerCase() === cacheKey.toLowerCase() ||
                    store.cacheKey.toLowerCase() === cacheKey.toLowerCase(),
            );
            if (found) {
                return found;
            }
        }

        const nativeBackend = await NativeKeyValueStoreBackend.open(id, name, alias, this.localDataDirectory);
        const newStore = await KeyValueStoreBackend.create({
            name: alias ? undefined : (name ?? cacheKey),
            cacheKey: cacheKey ?? '',
            nativeBackend,
            logger: this.logger,
        });
        this.keyValueStoreBackendCache.push(newStore);

        return newStore;
    }

    async createRequestQueueBackend(options: storage.StorageIdentifier = {}): Promise<storage.RequestQueueBackend> {
        const { id, name, alias, cacheKey } = FileSystemStorageBackend.resolveStorageKey(options);

        if (cacheKey) {
            const found = this.requestQueueBackendCache.find(
                (queue) =>
                    queue.id === cacheKey ||
                    queue.name?.toLowerCase() === cacheKey.toLowerCase() ||
                    queue.cacheKey.toLowerCase() === cacheKey.toLowerCase(),
            );
            if (found) {
                return found;
            }
        }

        const nativeBackend = await NativeRequestQueueBackend.open(
            id,
            name,
            alias,
            this.localDataDirectory,
            // useTestClock — always real wall-clock outside of native tests.
            undefined,
            this.requestQueueAccess,
        );
        const newStore = await RequestQueueBackend.create({
            name: alias ? undefined : (name ?? cacheKey),
            cacheKey: cacheKey ?? '',
            nativeBackend,
            logger: this.logger,
        });
        this.requestQueueBackendCache.push(newStore);

        return newStore;
    }

    async storageExists(id: string, type: 'Dataset' | 'KeyValueStore' | 'RequestQueue'): Promise<boolean> {
        let backends: (KeyValueStoreBackend | DatasetBackend | RequestQueueBackend)[];
        let baseDir: string;

        switch (type) {
            case 'Dataset':
                backends = this.datasetBackendCache;
                baseDir = this.datasetsDirectory;
                break;
            case 'KeyValueStore':
                backends = this.keyValueStoreBackendCache;
                baseDir = this.keyValueStoresDirectory;
                break;
            case 'RequestQueue':
                backends = this.requestQueueBackendCache;
                baseDir = this.requestQueuesDirectory;
                break;
            default:
                return false;
        }

        // Check the in-memory cache by actual storage ID first.
        if (backends.some((store) => store.id === id)) {
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
        const resolvedId = await FileSystemStorageBackend.resolveStorageIdOnDisk(baseDir, id);
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
        const directId = (await FileSystemStorageBackend.readMetadata(resolve(baseDirectory, entryNameOrId)))?.id;
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

            const metadataId = (await FileSystemStorageBackend.readMetadata(resolve(baseDirectory, directory.name)))
                ?.id;
            if (metadataId === entryNameOrId) {
                return metadataId;
            }
        }

        return undefined;
    }

    /** Read a storage directory's `__metadata__.json`, or `undefined` if there is none to read. */
    private static async readMetadata(
        storageDirectory: string,
    ): Promise<{ id?: string; name?: string | null } | undefined> {
        try {
            const fileContent = await readFile(resolve(storageDirectory, '__metadata__.json'), 'utf8');
            return JSON.parse(fileContent) as { id?: string; name?: string | null };
        } catch {
            // Directory missing, or no/unreadable metadata file — nothing to report.
            return undefined;
        }
    }

    /**
     * Cleans up the storages that belong to a single run before the run starts:
     *  - the default dataset and request queue, plus every alias-keyed one;
     *  - all records from the default key-value store except for the "INPUT" key, and all records from
     *    every alias-keyed key-value store.
     *
     * Named storages are the opt-in way of keeping data across runs, so they are left untouched.
     */
    async purge(): Promise<void> {
        await Promise.all([
            this.purgeRunScopedStorages(
                this.keyValueStoresDirectory,
                async (alias) => this.createKeyValueStoreBackend({ alias }) as Promise<KeyValueStoreBackend>,
                // Only the default store holds the run input, so it is the only one that keeps `INPUT`.
                async (store, isDefault) => (isDefault ? store.purgeExceptInput() : store.purge()),
            ),
            this.purgeRunScopedStorages(
                this.datasetsDirectory,
                async (alias) => this.createDatasetBackend({ alias }) as Promise<DatasetBackend>,
                async (store) => store.purge(),
            ),
            this.purgeRunScopedStorages(
                this.requestQueuesDirectory,
                async (alias) => this.createRequestQueueBackend({ alias }) as Promise<RequestQueueBackend>,
                async (store) => store.purge(),
            ),
        ]);
    }

    /**
     * Purge every run-scoped storage under `storagesDirectory` — the default one and every alias-keyed
     * one, whether or not it has been opened in this process yet.
     *
     * Storages are opened through `open` rather than purged on disk directly, both so that a leftover
     * from a previous process is reachable at all, and so that a storage already open in this process is
     * purged through the very backend the run is using instead of a divergent second one.
     */
    private async purgeRunScopedStorages<T>(
        storagesDirectory: string,
        open: (alias: string) => Promise<T>,
        purgeStorage: (storage: T, isDefault: boolean) => Promise<void>,
    ): Promise<void> {
        // The default storage is listed unconditionally, so that a run over an empty directory still ends
        // up with it opened (and cached) exactly as it was before. It is also listed first, so that it
        // wins the deduplication below: distinct directory names can share a cache key (`__default__` and
        // `default` both normalize to `default`), and opening both would leave the cache holding two
        // backends for one logical storage.
        const aliasesByCacheKey = new Map<string | undefined, string>();

        for (const alias of [
            DEFAULT_STORAGE_ALIAS,
            ...(await FileSystemStorageBackend.listUnnamedStorages(storagesDirectory)),
        ]) {
            const { cacheKey } = FileSystemStorageBackend.resolveStorageKey({ alias });
            if (!aliasesByCacheKey.has(cacheKey)) {
                aliasesByCacheKey.set(cacheKey, alias);
            }
        }

        await Promise.all(
            Array.from(aliasesByCacheKey, async ([cacheKey, alias]) => {
                await purgeStorage(await open(alias), cacheKey === 'default');
            }),
        );
    }

    /**
     * The directory names of the on-disk storages under `storagesDirectory` that Crawlee created without
     * a name — the default storage and every alias-keyed one. Since the directory is named after the
     * storage's `name ?? alias ?? id`, the name is read from the metadata rather than guessed.
     *
     * A directory with no readable `__metadata__.json` was not created by Crawlee (a hand-placed input
     * directory, say), so it is left out — purging it would destroy data we never wrote.
     */
    private static async listUnnamedStorages(storagesDirectory: string): Promise<string[]> {
        let directories;
        try {
            directories = await opendir(storagesDirectory);
        } catch {
            return [];
        }

        const unnamed: string[] = [];

        for await (const directory of directories) {
            if (!directory.isDirectory()) {
                continue;
            }

            const metadata = await FileSystemStorageBackend.readMetadata(resolve(storagesDirectory, directory.name));
            if (metadata !== undefined && typeof metadata.name !== 'string') {
                unnamed.push(directory.name);
            }
        }

        return unnamed;
    }

    /**
     * This method should be called at the end of the process, to ensure all data is saved.
     *
     * It persists the state of every opened request queue so that requests fetched but not yet handled
     * are not stuck (until their lock expires) for the next consumer of the same on-disk queue.
     */
    async teardown(): Promise<void> {
        await Promise.all(this.requestQueueBackendCache.map(async (queue) => queue.persistState()));
    }
}
