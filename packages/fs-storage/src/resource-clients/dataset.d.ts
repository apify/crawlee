import type * as storage from '@crawlee/types';
import type { CrawleeLogger, Dictionary } from '@crawlee/types';
import type { FileSystemDatasetClient as NativeFileSystemDatasetBackend } from '@crawlee/fs-storage-native';
import { CachedIdClient } from './cached-id-client.js';
export interface DatasetBackendOptions {
    /** The user-facing storage name, or `undefined` for unnamed (alias / default) storages. */
    name?: string;
    /**
     * The key used for cache lookup in {@link FileSystemStorageBackend}. For named storages this equals
     * the name; for alias (unnamed) storages it is the alias string. Falls back to the storage id.
     */
    cacheKey: string;
    nativeBackend: NativeFileSystemDatasetBackend;
    logger?: CrawleeLogger;
}
/**
 * A file-system dataset backend backed by the native `@crawlee/fs-storage-native` Rust extension.
 *
 * This class is a thin adapter: it forwards each operation to the native client (which owns the
 * on-disk format, timestamps and item counting) and converts results into the shapes expected by
 * the `@crawlee/types` interfaces.
 */
export declare class DatasetBackend<Data extends Dictionary = Dictionary> extends CachedIdClient implements storage.DatasetBackend<Data> {
    #private;
    readonly name?: string;
    readonly cacheKey: string;
    constructor(options: DatasetBackendOptions);
    get datasetDirectory(): string;
    static create<Data extends Dictionary = Dictionary>(options: DatasetBackendOptions): Promise<DatasetBackend<Data>>;
    getMetadata(): Promise<storage.DatasetInfo>;
    drop(): Promise<void>;
    purge(): Promise<void>;
    pushData(items: Data[]): Promise<void>;
    getData(options?: storage.DatasetBackendListOptions): Promise<storage.PaginatedList<Data>>;
}
