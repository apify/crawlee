import type * as storage from '@crawlee/types';
import type { CrawleeLogger, Dictionary } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import type { FileSystemDatasetClient as NativeFileSystemDatasetBackend } from '@crawlee/fs-storage-native';

import { CachedIdClient } from './cached-id-client.js';

/**
 * `getData` options accepted by the high-level `Dataset` frontend but not supported by the native
 * file-system backend (it can only paginate raw items by `offset`/`limit`/`desc`). They are silently
 * ignored, so we warn once if a caller passes any of them.
 *
 * Implementing these in the native client is tracked in
 * https://github.com/apify/crawlee-storage/issues/8.
 */
const UNSUPPORTED_GET_DATA_OPTIONS = ['clean', 'fields', 'omit', 'skipHidden', 'skipEmpty'] as const;

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
export class DatasetBackend<Data extends Dictionary = Dictionary>
    extends CachedIdClient
    implements storage.DatasetBackend<Data>
{
    readonly name?: string;
    readonly cacheKey: string;

    private readonly nativeBackend: NativeFileSystemDatasetBackend;
    private readonly logger?: CrawleeLogger;

    constructor(options: DatasetBackendOptions) {
        super();
        this.name = options.name;
        this.cacheKey = options.cacheKey;
        this.nativeBackend = options.nativeBackend;
        this.logger = options.logger;
    }

    get datasetDirectory(): string {
        return this.nativeBackend.pathToDataset;
    }

    static async create<Data extends Dictionary = Dictionary>(
        options: DatasetBackendOptions,
    ): Promise<DatasetBackend<Data>> {
        const backend = new DatasetBackend<Data>(options);
        backend.cachedId = (await options.nativeBackend.getMetadata()).id;
        return backend;
    }

    async getMetadata(): Promise<storage.DatasetInfo> {
        return this.nativeBackend.getMetadata();
    }

    async drop(): Promise<void> {
        await this.nativeBackend.dropStorage();
    }

    async purge(): Promise<void> {
        await this.nativeBackend.purge();
    }

    async pushData(items: Data[]): Promise<void> {
        await this.nativeBackend.pushData(items);
    }

    async getData(options: storage.DatasetBackendListOptions = {}): Promise<storage.PaginatedList<Data>> {
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

        const page = await this.nativeBackend.getData(offset ?? 0, limit, desc ?? false, false);

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
