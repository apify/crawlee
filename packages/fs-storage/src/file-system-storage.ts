import { opendir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import { parseArgument, schemas } from '@crawlee/utils/internal';
import { z } from 'zod';

import { DatasetBackend } from './resource-clients/dataset.js';
import { KeyValueStoreBackend } from './resource-clients/key-value-store.js';
import { RequestQueueBackend } from './resource-clients/request-queue.js';

const fileSystemStorageOptionsSchema = z.object({
    localDataDirectory: z.string(),
    requestQueueAccess: z.enum(['single', 'shared']).default('single'),
    logger: schemas.logger.optional(),
});

// The native package throws at load time on platforms without a published binary (e.g.
// linux musl), and `@crawlee/core` imports this module eagerly via its service locator.
// Load it lazily so merely importing `@crawlee/fs-storage` stays safe everywhere and the
// native binding is only loaded when a file-system storage is actually used.
let nativeModule: Promise<typeof import('@crawlee/fs-storage-native')> | undefined;
async function importNativeModule() {
    nativeModule ??= import('@crawlee/fs-storage-native');
    return nativeModule;
}

/** The alias `@crawlee/core` opens the default (unnamed) storage under. */
const DEFAULT_STORAGE_ALIAS = '__default__';

/** The directory the default storage lives in, one level below `datasets` / `key_value_stores` / etc. */
const DEFAULT_STORAGE_DIRECTORY = 'default';

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

    readonly #keyValueStoreBackendCache: KeyValueStoreBackend[] = [];
    readonly #datasetBackendCache: DatasetBackend[] = [];
    readonly #requestQueueBackendCache: RequestQueueBackend[] = [];

    constructor(options: FileSystemStorageOptions) {
        const { logger, requestQueueAccess, localDataDirectory } = parseArgument(
            options,
            fileSystemStorageOptionsSchema,
        );

        this.logger = logger;
        this.requestQueueAccess = requestQueueAccess;

        this.localDataDirectory = localDataDirectory;
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

    static #resolveStorageKey(options: { id?: string; name?: string; alias?: string }): {
        id?: string;
        name?: string;
        alias?: string;
        cacheKey: string;
    } {
        // No identifier at all means the default storage, which is opened under the reserved alias —
        // same rule as `resolveStorageIdentifier` in @crawlee/core, so that a backend used directly
        // lands on the very storage the frontends would have opened.
        const requestedAlias = options.alias || (!options.id && !options.name ? DEFAULT_STORAGE_ALIAS : undefined);
        // `__default__` is an internal sentinel and must not escape onto disk: the default storage lives
        // in `default`, which is what the docs, the project templates and every pre-existing local
        // `storage/` directory expect. Normalizing here keeps the cache key and the directory in step.
        const alias = requestedAlias === DEFAULT_STORAGE_ALIAS ? DEFAULT_STORAGE_DIRECTORY : requestedAlias;
        // `alias` covers the identifier-less case, so one of the three is always set.
        const cacheKey = alias ?? options.name ?? options.id!;
        return { id: options.id, name: options.name, alias, cacheKey };
    }

    async createDatasetBackend(options: storage.StorageIdentifier = {}): Promise<storage.DatasetBackend> {
        const { id, name, alias, cacheKey } = FileSystemStorageBackend.#resolveStorageKey(options);

        const found = this.#datasetBackendCache.find(
            (store) =>
                store.id === cacheKey ||
                store.name?.toLowerCase() === cacheKey.toLowerCase() ||
                store.cacheKey.toLowerCase() === cacheKey.toLowerCase(),
        );
        if (found) {
            return found;
        }

        const nativeBackend = await (
            await importNativeModule()
        ).FileSystemDatasetClient.open(id, name, alias, this.localDataDirectory);
        const newStore = await DatasetBackend.create({
            name: alias ? undefined : (name ?? cacheKey),
            cacheKey,
            nativeBackend,
            logger: this.logger,
        });
        this.#datasetBackendCache.push(newStore);

        return newStore;
    }

    async createKeyValueStoreBackend(options: storage.StorageIdentifier = {}): Promise<storage.KeyValueStoreBackend> {
        const { id, name, alias, cacheKey } = FileSystemStorageBackend.#resolveStorageKey(options);

        const found = this.#keyValueStoreBackendCache.find(
            (store) =>
                store.id === cacheKey ||
                store.name?.toLowerCase() === cacheKey.toLowerCase() ||
                store.cacheKey.toLowerCase() === cacheKey.toLowerCase(),
        );
        if (found) {
            return found;
        }

        const nativeBackend = await (
            await importNativeModule()
        ).FileSystemKeyValueStoreClient.open(id, name, alias, this.localDataDirectory);
        const newStore = await KeyValueStoreBackend.create({
            name: alias ? undefined : (name ?? cacheKey),
            cacheKey,
            nativeBackend,
            logger: this.logger,
        });
        this.#keyValueStoreBackendCache.push(newStore);

        return newStore;
    }

    async createRequestQueueBackend(options: storage.StorageIdentifier = {}): Promise<storage.RequestQueueBackend> {
        const { id, name, alias, cacheKey } = FileSystemStorageBackend.#resolveStorageKey(options);

        const found = this.#requestQueueBackendCache.find(
            (queue) =>
                queue.id === cacheKey ||
                queue.name?.toLowerCase() === cacheKey.toLowerCase() ||
                queue.cacheKey.toLowerCase() === cacheKey.toLowerCase(),
        );
        if (found) {
            return found;
        }

        const nativeBackend = await (
            await importNativeModule()
        ).FileSystemRequestQueueClient.open(
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
            cacheKey,
            nativeBackend,
            logger: this.logger,
        });
        this.#requestQueueBackendCache.push(newStore);

        return newStore;
    }

    async storageExists(id: string, type: 'Dataset' | 'KeyValueStore' | 'RequestQueue'): Promise<boolean> {
        let backends: (KeyValueStoreBackend | DatasetBackend | RequestQueueBackend)[];
        let baseDir: string;

        switch (type) {
            case 'Dataset':
                backends = this.#datasetBackendCache;
                baseDir = this.datasetsDirectory;
                break;
            case 'KeyValueStore':
                backends = this.#keyValueStoreBackendCache;
                baseDir = this.keyValueStoresDirectory;
                break;
            case 'RequestQueue':
                backends = this.#requestQueueBackendCache;
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
        const resolvedId = await FileSystemStorageBackend.#resolveStorageIdOnDisk(baseDir, id);
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
    static async #resolveStorageIdOnDisk(baseDirectory: string, entryNameOrId: string): Promise<string | undefined> {
        // Directory named exactly after the string: return its real (metadata) id, which may differ
        // from the string when the string is a name rather than an id.
        const directId = (await FileSystemStorageBackend.#readMetadata(resolve(baseDirectory, entryNameOrId)))?.id;
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

            const metadataId = (await FileSystemStorageBackend.#readMetadata(resolve(baseDirectory, directory.name)))
                ?.id;
            if (metadataId === entryNameOrId) {
                return metadataId;
            }
        }

        return undefined;
    }

    /** Read a storage directory's `__metadata__.json`, or `undefined` if there is none to read. */
    static async #readMetadata(storageDirectory: string): Promise<{ id?: string; name?: string | null } | undefined> {
        try {
            const fileContent = await readFile(resolve(storageDirectory, '__metadata__.json'), 'utf8');
            return JSON.parse(fileContent) as { id?: string; name?: string | null };
        } catch {
            // Directory missing, or no/unreadable metadata file — nothing to report.
            return undefined;
        }
    }

    /**
     * Cleans up the run-scoped storages before the run starts, sweeping the storage directories so that
     * leftovers from a previous process are caught too.
     */
    async purge(): Promise<void> {
        await Promise.all([
            this.#purgeRunScopedStorages(
                this.keyValueStoresDirectory,
                async (alias) => this.createKeyValueStoreBackend({ alias }) as Promise<KeyValueStoreBackend>,
                // Only the default store holds the run input, so it is the only one that keeps `INPUT`.
                async (store, isDefault) => (isDefault ? store.purgeExceptInput() : store.purge()),
            ),
            this.#purgeRunScopedStorages(
                this.datasetsDirectory,
                async (alias) => this.createDatasetBackend({ alias }) as Promise<DatasetBackend>,
                async (store) => store.purge(),
            ),
            this.#purgeRunScopedStorages(
                this.requestQueuesDirectory,
                async (alias) => this.createRequestQueueBackend({ alias }) as Promise<RequestQueueBackend>,
                async (store) => store.purge(),
            ),
        ]);
    }

    /**
     * Purge every run-scoped storage under `storagesDirectory`, whether or not it has been opened in this
     * process yet. Storages are opened rather than emptied on disk directly, so that one already open
     * under the same name or alias is purged through the backend the run is using, not a second one.
     */
    async #purgeRunScopedStorages<T>(
        storagesDirectory: string,
        open: (alias: string) => Promise<T>,
        purgeStorage: (storage: T, isDefault: boolean) => Promise<void>,
    ): Promise<void> {
        // The default storage is listed unconditionally, so that a run over an empty directory still ends
        // up with it opened (and cached) exactly as it was before. Deduplicating by cache key then keeps
        // it to a single open: every run after the first also finds its `default` directory on disk, and
        // opening the same storage twice concurrently would race two backends onto one directory.
        const aliasesByCacheKey = new Map<string, string>();

        for (const alias of [
            DEFAULT_STORAGE_ALIAS,
            ...(await FileSystemStorageBackend.#listUnnamedStorages(storagesDirectory)),
        ]) {
            const { cacheKey } = FileSystemStorageBackend.#resolveStorageKey({ alias });
            if (!aliasesByCacheKey.has(cacheKey)) {
                aliasesByCacheKey.set(cacheKey, alias);
            }
        }

        await Promise.all(
            Array.from(aliasesByCacheKey, async ([cacheKey, alias]) => {
                await purgeStorage(await open(alias), cacheKey === DEFAULT_STORAGE_DIRECTORY);
            }),
        );
    }

    /**
     * The directory names of the on-disk storages under `storagesDirectory` that Crawlee created without
     * a name — the default storage and every alias-keyed one. Since the directory is named after the
     * storage's `name ?? alias`, the name is read from the metadata rather than guessed.
     *
     * Two kinds of directory are left out, as purging them would destroy data this process never wrote:
     * one without a readable `__metadata__.json` (not written by Crawlee — a hand-placed input directory,
     * say), and one named after its own id, which is reachable only by `{ id }` and so is not run-scoped.
     */
    static async #listUnnamedStorages(storagesDirectory: string): Promise<string[]> {
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

            const metadata = await FileSystemStorageBackend.#readMetadata(resolve(storagesDirectory, directory.name));
            if (metadata !== undefined && typeof metadata.name !== 'string' && metadata.id !== directory.name) {
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
        await Promise.all(this.#requestQueueBackendCache.map(async (queue) => queue.persistState()));
    }
}
