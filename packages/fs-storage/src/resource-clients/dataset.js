import { parseArgument, schemas } from '@crawlee/utils/internal';
import { CachedIdClient } from './cached-id-client.js';
/**
 * `getData` options accepted by the high-level `Dataset` frontend but not supported by the native
 * file-system backend (it can only paginate raw items by `offset`/`limit`/`desc`). They are silently
 * ignored, so we warn once if a caller passes any of them.
 *
 * Implementing these in the native client is tracked in
 * https://github.com/apify/crawlee-storage/issues/8.
 */
const UNSUPPORTED_GET_DATA_OPTIONS = ['clean', 'fields', 'omit', 'skipHidden', 'skipEmpty'];
/**
 * A file-system dataset backend backed by the native `@crawlee/fs-storage-native` Rust extension.
 *
 * This class is a thin adapter: it forwards each operation to the native client (which owns the
 * on-disk format, timestamps and item counting) and converts results into the shapes expected by
 * the `@crawlee/types` interfaces.
 */
export class DatasetBackend extends CachedIdClient {
    name;
    cacheKey;
    #nativeBackend;
    #logger;
    constructor(options) {
        super();
        this.name = options.name;
        this.cacheKey = options.cacheKey;
        this.#nativeBackend = options.nativeBackend;
        this.#logger = options.logger;
    }
    get datasetDirectory() {
        return this.#nativeBackend.pathToDataset;
    }
    static async create(options) {
        const backend = new DatasetBackend(options);
        backend.cachedId = (await options.nativeBackend.getMetadata()).id;
        return backend;
    }
    async getMetadata() {
        return this.#nativeBackend.getMetadata();
    }
    async drop() {
        await this.#nativeBackend.dropStorage();
    }
    async purge() {
        await this.#nativeBackend.purge();
    }
    async pushData(items) {
        await this.#nativeBackend.pushData(items);
    }
    async getData(options = {}) {
        const passedOptions = options;
        const ignored = UNSUPPORTED_GET_DATA_OPTIONS.filter((key) => passedOptions[key] !== undefined);
        if (ignored.length > 0) {
            this.#logger?.warning?.(`getData() options [${ignored.join(', ')}] are not supported by the file-system dataset ` +
                `and were ignored. Only "offset", "limit" and "desc" are honored.`);
        }
        const { desc, limit, offset } = parseArgument(options, schemas.datasetListItemsOptions);
        const page = await this.#nativeBackend.getData(offset ?? 0, limit, desc ?? false, false);
        return {
            count: page.count,
            desc: page.desc,
            items: page.items,
            limit: page.limit,
            offset: page.offset,
            total: page.total,
        };
    }
}
