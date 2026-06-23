import type * as storage from '@crawlee/types';
import type { Dictionary } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import type { FileSystemDatasetClient as NativeFileSystemDatasetClient } from '@crawlee/fs-storage-native';

/**
 * This is what the API returns in the `x-apify-pagination-limit` header when no limit query
 * parameter is used. The native client expects an explicit upper bound, so we forward this value
 * when the caller does not specify a `limit`.
 */
const LIST_ITEMS_LIMIT = 999_999_999_999;

export interface DatasetClientOptions {
    /** The user-facing storage name, or `undefined` for unnamed (alias / default) storages. */
    name?: string;
    /**
     * The key used for cache lookup in {@link FileSystemStorageClient}. For named storages this equals
     * the name; for alias (unnamed) storages it is the alias string. Falls back to the storage id.
     */
    cacheKey: string;
    nativeClient: NativeFileSystemDatasetClient;
}

/**
 * A file-system dataset client backed by the native `@crawlee/fs-storage-native` Rust extension.
 *
 * This class is a thin adapter: it forwards each operation to the native client (which owns the
 * on-disk format, timestamps and item counting) and converts results into the shapes expected by
 * the `@crawlee/types` interfaces.
 */
export class DatasetClient<Data extends Dictionary = Dictionary> implements storage.DatasetClient<Data> {
    readonly name?: string;
    readonly cacheKey: string;

    private readonly nativeClient: NativeFileSystemDatasetClient;

    constructor(options: DatasetClientOptions) {
        this.name = options.name;
        this.cacheKey = options.cacheKey;
        this.nativeClient = options.nativeClient;
    }

    /** The storage id assigned by the native client. */
    get id(): string {
        return this._cachedId;
    }

    /**
     * The id is read once from the native metadata at construction time (see
     * {@link DatasetClient.create}) and cached, so that the synchronous `id` getter — required by
     * {@link FileSystemStorageClient.storageExists} and the cache lookups — does not have to await.
     */
    private _cachedId!: string;

    get datasetDirectory(): string {
        return this.nativeClient.pathToDataset;
    }

    static async create<Data extends Dictionary = Dictionary>(
        options: DatasetClientOptions,
    ): Promise<DatasetClient<Data>> {
        const client = new DatasetClient<Data>(options);
        client._cachedId = (await options.nativeClient.getMetadata()).id;
        return client;
    }

    async getMetadata(): Promise<storage.DatasetInfo> {
        return this.nativeClient.getMetadata();
    }

    async drop(): Promise<void> {
        await this.nativeClient.dropStorage();
    }

    async purge(): Promise<void> {
        await this.nativeClient.purge();
    }

    async pushData(items: Data[]): Promise<void> {
        await this.nativeClient.pushData(items);
    }

    async getData(options: storage.DatasetClientListOptions = {}): Promise<storage.PaginatedList<Data>> {
        const { desc, limit, offset } = s
            .object({
                desc: s.boolean().optional(),
                limit: s.number().int().optional(),
                offset: s.number().int().optional(),
            })
            .parse(options);

        const page = await this.nativeClient.getData(
            offset ?? 0,
            Math.min(limit ?? LIST_ITEMS_LIMIT, LIST_ITEMS_LIMIT),
            desc ?? false,
            false,
        );

        return {
            count: page.count,
            desc: page.desc,
            items: page.items as Data[],
            limit: page.limit,
            offset: page.offset,
            total: page.total,
        };
    }
}
