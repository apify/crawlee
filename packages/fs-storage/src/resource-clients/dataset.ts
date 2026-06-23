import type * as storage from '@crawlee/types';
import type { CrawleeLogger, Dictionary } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import type { FileSystemDatasetClient as NativeFileSystemDatasetClient } from '@crawlee/fs-storage-native';

/**
 * `getData` options accepted by the high-level `Dataset` frontend but not supported by the native
 * file-system backend (it can only paginate raw items by `offset`/`limit`/`desc`). They are silently
 * ignored, so we warn once if a caller passes any of them.
 *
 * Implementing these in the native client is tracked in
 * https://github.com/apify/crawlee-storage/issues/8.
 */
const UNSUPPORTED_GET_DATA_OPTIONS = ['clean', 'fields', 'omit', 'skipHidden', 'skipEmpty'] as const;

/**
 * "Return everything" sentinel for {@link DatasetClient.getData}. The native client requires an
 * explicit upper bound, so when the caller omits `limit` we forward this value. It matches what the
 * Apify API reports in the `x-apify-pagination-limit` header when no `limit` query parameter is set,
 * keeping the local backend's pagination behavior aligned with the platform.
 */
const ALL_ITEMS_LIMIT = 999_999_999_999;

export interface DatasetClientOptions {
    /** The user-facing storage name, or `undefined` for unnamed (alias / default) storages. */
    name?: string;
    /**
     * The key used for cache lookup in {@link FileSystemStorageClient}. For named storages this equals
     * the name; for alias (unnamed) storages it is the alias string. Falls back to the storage id.
     */
    cacheKey: string;
    nativeClient: NativeFileSystemDatasetClient;
    logger?: CrawleeLogger;
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
    private readonly logger?: CrawleeLogger;

    constructor(options: DatasetClientOptions) {
        this.name = options.name;
        this.cacheKey = options.cacheKey;
        this.nativeClient = options.nativeClient;
        this.logger = options.logger;
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
        const passedOptions = options as Record<string, unknown>;
        const ignored = UNSUPPORTED_GET_DATA_OPTIONS.filter((key) => passedOptions[key] !== undefined);
        if (ignored.length > 0) {
            this.logger?.warning?.(
                `getData() options [${ignored.join(', ')}] are not supported by the file-system dataset ` +
                    `and were ignored. Only "offset", "limit" and "desc" are honored.`,
            );
        }

        const { desc, limit, offset } = s
            .object({
                desc: s.boolean().optional(),
                limit: s.number().int().optional(),
                offset: s.number().int().optional(),
            })
            .parse(options);

        const page = await this.nativeClient.getData(
            offset ?? 0,
            Math.min(limit ?? ALL_ITEMS_LIMIT, ALL_ITEMS_LIMIT),
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
