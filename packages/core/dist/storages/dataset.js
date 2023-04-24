"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Dataset = exports.chunkBySize = exports.checkAndSerialize = exports.DATASET_ITERATORS_DEFAULT_LIMIT = void 0;
const tslib_1 = require("tslib");
const consts_1 = require("@apify/consts");
const ow_1 = tslib_1.__importDefault(require("ow"));
const sync_1 = require("csv-stringify/sync");
const configuration_1 = require("../configuration");
const log_1 = require("../log");
const storage_manager_1 = require("./storage_manager");
const utils_1 = require("./utils");
const key_value_store_1 = require("./key_value_store");
/** @internal */
exports.DATASET_ITERATORS_DEFAULT_LIMIT = 10000;
const SAFETY_BUFFER_PERCENT = 0.01 / 100; // 0.01%
/**
 * Accepts a JSON serializable object as an input, validates its serializability,
 * and validates its serialized size against limitBytes. Optionally accepts its index
 * in an array to provide better error messages. Returns serialized object.
 * @ignore
 */
function checkAndSerialize(item, limitBytes, index) {
    const s = typeof index === 'number' ? ` at index ${index} ` : ' ';
    const isItemObject = item && typeof item === 'object' && !Array.isArray(item);
    if (!isItemObject) {
        throw new Error(`Data item${s}is not an object. You can push only objects into a dataset.`);
    }
    let payload;
    try {
        payload = JSON.stringify(item);
    }
    catch (e) {
        const err = e;
        throw new Error(`Data item${s}is not serializable to JSON.\nCause: ${err.message}`);
    }
    const bytes = Buffer.byteLength(payload);
    if (bytes > limitBytes) {
        throw new Error(`Data item${s}is too large (size: ${bytes} bytes, limit: ${limitBytes} bytes)`);
    }
    return payload;
}
exports.checkAndSerialize = checkAndSerialize;
/**
 * Takes an array of JSONs (payloads) as input and produces an array of JSON strings
 * where each string is a JSON array of payloads with a maximum size of limitBytes per one
 * JSON array. Fits as many payloads as possible into a single JSON array and then moves
 * on to the next, preserving item order.
 *
 * The function assumes that none of the items is larger than limitBytes and does not validate.
 * @ignore
 */
function chunkBySize(items, limitBytes) {
    if (!items.length)
        return [];
    if (items.length === 1)
        return items;
    // Split payloads into buckets of valid size.
    let lastChunkBytes = 2; // Add 2 bytes for [] wrapper.
    const chunks = [];
    for (const payload of items) {
        const bytes = Buffer.byteLength(payload);
        if (bytes <= limitBytes && (bytes + 2) > limitBytes) {
            // Handle cases where wrapping with [] would fail, but solo object is fine.
            chunks.push(payload);
            lastChunkBytes = bytes;
        }
        else if (lastChunkBytes + bytes <= limitBytes) {
            // ensure array
            if (!Array.isArray(chunks[chunks.length - 1])) {
                chunks.push([]);
            }
            chunks[chunks.length - 1].push(payload);
            lastChunkBytes += bytes + 1; // Add 1 byte for ',' separator.
        }
        else {
            chunks.push([payload]);
            lastChunkBytes = bytes + 2; // Add 2 bytes for [] wrapper.
        }
    }
    // Stringify array chunks.
    return chunks.map((chunk) => (typeof chunk === 'string' ? chunk : `[${chunk.join(',')}]`));
}
exports.chunkBySize = chunkBySize;
/**
 * The `Dataset` class represents a store for structured data where each object stored has the same attributes,
 * such as online store products or real estate offers. You can imagine it as a table,
 * where each object is a row and its attributes are columns.
 * Dataset is an append-only storage - you can only add new records to it but you cannot modify or remove existing records.
 * Typically it is used to store crawling results.
 *
 * Do not instantiate this class directly, use the
 * {@apilink Dataset.open} function instead.
 *
 * `Dataset` stores its data either on local disk or in the Apify cloud,
 * depending on whether the `APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN` environment variables are set.
 *
 * If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the data is stored in
 * the local directory in the following files:
 * ```
 * {APIFY_LOCAL_STORAGE_DIR}/datasets/{DATASET_ID}/{INDEX}.json
 * ```
 * Note that `{DATASET_ID}` is the name or ID of the dataset. The default dataset has ID: `default`,
 * unless you override it by setting the `APIFY_DEFAULT_DATASET_ID` environment variable.
 * Each dataset item is stored as a separate JSON file, where `{INDEX}` is a zero-based index of the item in the dataset.
 *
 * If the `APIFY_TOKEN` environment variable is set but `APIFY_LOCAL_STORAGE_DIR` not, the data is stored in the
 * [Apify Dataset](https://docs.apify.com/storage/dataset)
 * cloud storage. Note that you can force usage of the cloud storage also by passing the `forceCloud`
 * option to {@apilink Dataset.open} function,
 * even if the `APIFY_LOCAL_STORAGE_DIR` variable is set.
 *
 * **Example usage:**
 *
 * ```javascript
 * // Write a single row to the default dataset
 * await Dataset.pushData({ col1: 123, col2: 'val2' });
 *
 * // Open a named dataset
 * const dataset = await Dataset.open('some-name');
 *
 * // Write a single row
 * await dataset.pushData({ foo: 'bar' });
 *
 * // Write multiple rows
 * await dataset.pushData([
 *   { foo: 'bar2', col2: 'val2' },
 *   { col3: 123 },
 * ]);
 *
 * // Export the entirety of the dataset to one file in the key-value store
 * await dataset.exportToCSV('MY-DATA');
 * ```
 * @category Result Stores
 */
class Dataset {
    /**
     * @internal
     */
    constructor(options, config = configuration_1.Configuration.getGlobalConfig()) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "client", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "log", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: log_1.log.child({ prefix: 'Dataset' })
        });
        this.id = options.id;
        this.name = options.name;
        this.client = options.client.dataset(this.id);
    }
    /**
     * Stores an object or an array of objects to the dataset.
     * The function returns a promise that resolves when the operation finishes.
     * It has no result, but throws on invalid args or other errors.
     *
     * **IMPORTANT**: Make sure to use the `await` keyword when calling `pushData()`,
     * otherwise the crawler process might finish before the data is stored!
     *
     * The size of the data is limited by the receiving API and therefore `pushData()` will only
     * allow objects whose JSON representation is smaller than 9MB. When an array is passed,
     * none of the included objects
     * may be larger than 9MB, but the array itself may be of any size.
     *
     * The function internally
     * chunks the array into separate items and pushes them sequentially.
     * The chunking process is stable (keeps order of data), but it does not provide a transaction
     * safety mechanism. Therefore, in the event of an uploading error (after several automatic retries),
     * the function's Promise will reject and the dataset will be left in a state where some of
     * the items have already been saved to the dataset while other items from the source array were not.
     * To overcome this limitation, the developer may, for example, read the last item saved in the dataset
     * and re-attempt the save of the data from this item onwards to prevent duplicates.
     * @param data Object or array of objects containing data to be stored in the default dataset.
     *   The objects must be serializable to JSON and the JSON representation of each object must be smaller than 9MB.
     */
    async pushData(data) {
        (0, ow_1.default)(data, 'data', ow_1.default.object);
        const dispatch = (payload) => this.client.pushItems(payload);
        const limit = consts_1.MAX_PAYLOAD_SIZE_BYTES - Math.ceil(consts_1.MAX_PAYLOAD_SIZE_BYTES * SAFETY_BUFFER_PERCENT);
        // Handle singular Objects
        if (!Array.isArray(data)) {
            const payload = checkAndSerialize(data, limit);
            return dispatch(payload);
        }
        // Handle Arrays
        const payloads = data.map((item, index) => checkAndSerialize(item, limit, index));
        const chunks = chunkBySize(payloads, limit);
        // Invoke client in series to preserve order of data
        for (const chunk of chunks) {
            await dispatch(chunk);
        }
    }
    /**
     * Returns {@apilink DatasetContent} object holding the items in the dataset based on the provided parameters.
     */
    async getData(options = {}) {
        try {
            return await this.client.listItems(options);
        }
        catch (e) {
            const error = e;
            if (error.message.includes('Cannot create a string longer than')) {
                throw new Error('dataset.getData(): The response is too large for parsing. You can fix this by lowering the "limit" option.');
            }
            throw e;
        }
    }
    /**
     * Save the entirety of the dataset's contents into one file within a key-value store.
     *
     * @param key The name of the value to save the data in.
     * @param [options] An optional options object where you can provide the dataset and target KVS name.
     * @param [contentType] Only JSON and CSV are supported currently, defaults to JSON.
     */
    async exportTo(key, options, contentType) {
        const kvStore = await key_value_store_1.KeyValueStore.open(options?.toKVS ?? null);
        const items = [];
        const fetchNextChunk = async (offset = 0) => {
            const limit = 1000;
            const value = await this.client.listItems({ offset, limit });
            if (value.count === 0) {
                return;
            }
            items.push(...value.items);
            if (value.total > offset + value.count) {
                return fetchNextChunk(offset + value.count);
            }
        };
        await fetchNextChunk();
        if (contentType === 'text/csv') {
            const value = (0, sync_1.stringify)([
                Object.keys(items[0]),
                ...items.map((item) => Object.values(item)),
            ]);
            return kvStore.setValue(key, value, { contentType });
        }
        if (contentType === 'application/json') {
            return kvStore.setValue(key, items);
        }
        throw new Error(`Unsupported content type: ${contentType}`);
    }
    /**
     * Save entire default dataset's contents into one JSON file within a key-value store.
     *
     * @param key The name of the value to save the data in.
     * @param [options] An optional options object where you can provide the target KVS name.
     */
    async exportToJSON(key, options) {
        await this.exportTo(key, options, 'application/json');
    }
    /**
     * Save entire default dataset's contents into one CSV file within a key-value store.
     *
     * @param key The name of the value to save the data in.
     * @param [options] An optional options object where you can provide the target KVS name.
     */
    async exportToCSV(key, options) {
        await this.exportTo(key, options, 'text/csv');
    }
    /**
     * Save entire default dataset's contents into one JSON file within a key-value store.
     *
     * @param key The name of the value to save the data in.
     * @param [options] An optional options object where you can provide the dataset and target KVS name.
     */
    static async exportToJSON(key, options) {
        const dataset = await this.open(options?.fromDataset);
        await dataset.exportToJSON(key, options);
    }
    /**
     * Save entire default dataset's contents into one CSV file within a key-value store.
     *
     * @param key The name of the value to save the data in.
     * @param [options] An optional options object where you can provide the dataset and target KVS name.
     */
    static async exportToCSV(key, options) {
        const dataset = await this.open(options?.fromDataset);
        await dataset.exportToCSV(key, options);
    }
    /**
     * Returns an object containing general information about the dataset.
     *
     * The function returns the same object as the Apify API Client's
     * [getDataset](https://docs.apify.com/api/apify-client-js/latest#ApifyClient-datasets-getDataset)
     * function, which in turn calls the
     * [Get dataset](https://apify.com/docs/api/v2#/reference/datasets/dataset/get-dataset)
     * API endpoint.
     *
     * **Example:**
     * ```
     * {
     *   id: "WkzbQMuFYuamGv3YF",
     *   name: "my-dataset",
     *   userId: "wRsJZtadYvn4mBZmm",
     *   createdAt: new Date("2015-12-12T07:34:14.202Z"),
     *   modifiedAt: new Date("2015-12-13T08:36:13.202Z"),
     *   accessedAt: new Date("2015-12-14T08:36:13.202Z"),
     *   itemCount: 14,
     * }
     * ```
     */
    async getInfo() {
        return this.client.get();
    }
    /**
     * Iterates over dataset items, yielding each in turn to an `iteratee` function.
     * Each invocation of `iteratee` is called with two arguments: `(item, index)`.
     *
     * If the `iteratee` function returns a Promise then it is awaited before the next call.
     * If it throws an error, the iteration is aborted and the `forEach` function throws the error.
     *
     * **Example usage**
     * ```javascript
     * const dataset = await Dataset.open('my-results');
     * await dataset.forEach(async (item, index) => {
     *   console.log(`Item at ${index}: ${JSON.stringify(item)}`);
     * });
     * ```
     *
     * @param iteratee A function that is called for every item in the dataset.
     * @param [options] All `forEach()` parameters.
     * @param [index] Specifies the initial index number passed to the `iteratee` function.
     * @default 0
     */
    async forEach(iteratee, options = {}, index = 0) {
        if (!options.offset)
            options.offset = 0;
        if (options.format && options.format !== 'json')
            throw new Error('Dataset.forEach/map/reduce() support only a "json" format.');
        if (!options.limit)
            options.limit = exports.DATASET_ITERATORS_DEFAULT_LIMIT;
        const { items, total, limit, offset } = await this.getData(options);
        for (const item of items) {
            await iteratee(item, index++);
        }
        const newOffset = offset + limit;
        if (newOffset >= total)
            return;
        const newOpts = { ...options, offset: newOffset };
        return this.forEach(iteratee, newOpts, index);
    }
    /**
     * Produces a new array of values by mapping each value in list through a transformation function `iteratee()`.
     * Each invocation of `iteratee()` is called with two arguments: `(element, index)`.
     *
     * If `iteratee` returns a `Promise` then it's awaited before a next call.
     *
     * @param iteratee
     * @param [options] All `map()` parameters.
     */
    async map(iteratee, options = {}) {
        const result = [];
        await this.forEach(async (item, index) => {
            const res = await iteratee(item, index);
            result.push(res);
        }, options);
        return result;
    }
    /**
     * Reduces a list of values down to a single value.
     *
     * Memo is the initial state of the reduction, and each successive step of it should be returned by `iteratee()`.
     * The `iteratee()` is passed three arguments: the `memo`, then the `value` and `index` of the iteration.
     *
     * If no `memo` is passed to the initial invocation of reduce, the `iteratee()` is not invoked on the first element of the list.
     * The first element is instead passed as the memo in the invocation of the `iteratee()` on the next element in the list.
     *
     * If `iteratee()` returns a `Promise` then it's awaited before a next call.
     *
     * @param iteratee
     * @param memo Initial state of the reduction.
     * @param [options] All `reduce()` parameters.
     */
    async reduce(iteratee, memo, options = {}) {
        let currentMemo = memo;
        const wrappedFunc = (item, index) => {
            return Promise
                .resolve()
                .then(() => {
                return !index && currentMemo === undefined
                    ? item
                    : iteratee(currentMemo, item, index);
            })
                .then((newMemo) => {
                currentMemo = newMemo;
            });
        };
        await this.forEach(wrappedFunc, options);
        return currentMemo;
    }
    /**
     * Removes the dataset either from the Apify cloud storage or from the local directory,
     * depending on the mode of operation.
     */
    async drop() {
        await this.client.delete();
        const manager = storage_manager_1.StorageManager.getManager(Dataset, this.config);
        manager.closeStorage(this);
    }
    /**
     * Opens a dataset and returns a promise resolving to an instance of the {@apilink Dataset} class.
     *
     * Datasets are used to store structured data where each object stored has the same attributes,
     * such as online store products or real estate offers.
     * The actual data is stored either on the local filesystem or in the cloud.
     *
     * For more details and code examples, see the {@apilink Dataset} class.
     *
     * @param [datasetIdOrName]
     *   ID or name of the dataset to be opened. If `null` or `undefined`,
     *   the function returns the default dataset associated with the crawler run.
     * @param [options] Storage manager options.
     */
    static async open(datasetIdOrName, options = {}) {
        (0, ow_1.default)(datasetIdOrName, ow_1.default.optional.string);
        (0, ow_1.default)(options, ow_1.default.object.exactShape({
            config: ow_1.default.optional.object.instanceOf(configuration_1.Configuration),
        }));
        options.config ?? (options.config = configuration_1.Configuration.getGlobalConfig());
        await (0, utils_1.purgeDefaultStorages)();
        const manager = storage_manager_1.StorageManager.getManager(this, options.config);
        return manager.openStorage(datasetIdOrName, options.config.getStorageClient());
    }
    /**
     * Stores an object or an array of objects to the default {@apilink Dataset} of the current crawler run.
     *
     * This is just a convenient shortcut for {@apilink Dataset.pushData}.
     * For example, calling the following code:
     * ```javascript
     * await Dataset.pushData({ myValue: 123 });
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const dataset = await Dataset.open();
     * await dataset.pushData({ myValue: 123 });
     * ```
     *
     * For more information, see {@apilink Dataset.open} and {@apilink Dataset.pushData}
     *
     * **IMPORTANT**: Make sure to use the `await` keyword when calling `pushData()`,
     * otherwise the crawler process might finish before the data are stored!
     *
     * @param item Object or array of objects containing data to be stored in the default dataset.
     * The objects must be serializable to JSON and the JSON representation of each object must be smaller than 9MB.
     * @ignore
     */
    static async pushData(item) {
        const dataset = await this.open();
        return dataset.pushData(item);
    }
    /**
     * Returns {@apilink DatasetContent} object holding the items in the dataset based on the provided parameters.
     */
    static async getData(options = {}) {
        const dataset = await this.open();
        return dataset.getData(options);
    }
}
exports.Dataset = Dataset;
//# sourceMappingURL=dataset.js.map