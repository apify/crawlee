import ow from 'ow';
import _ from 'underscore';
import { MAX_PAYLOAD_SIZE_BYTES } from '@apify/consts';
import { StorageManager } from './storage_manager';
import log from '../utils_log';

/* eslint-disable no-unused-vars,import/order */
// @ts-ignore
import { ApifyClient } from 'apify-client';
// @ts-ignore
import { ApifyStorageLocal } from '@apify/storage-local';
import { Configuration } from '../configuration';
/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order */

export const DATASET_ITERATORS_DEFAULT_LIMIT = 10000;
export const LOCAL_FILENAME_DIGITS = 9;
const SAFETY_BUFFER_PERCENT = 0.01 / 100; // 0.01%

/**
 * Accepts a JSON serializable object as an input, validates its serializability,
 * and validates its serialized size against limitBytes. Optionally accepts its index
 * in an array to provide better error messages. Returns serialized object.
 *
 * @param {*} item
 * @param {number} limitBytes
 * @param {number} [index]
 * @returns {string}
 * @ignore
 */
export const checkAndSerialize = (item, limitBytes, index) => {
    const s = typeof index === 'number' ? ` at index ${index} ` : ' ';

    const isItemObject = item && typeof item === 'object' && !Array.isArray(item);
    if (!isItemObject) {
        throw new Error(`Data item${s}is not an object. You can push only objects into a dataset.`);
    }

    let payload;
    try {
        payload = JSON.stringify(item);
    } catch (err) {
        throw new Error(`Data item${s}is not serializable to JSON.\nCause: ${err.message}`);
    }

    const bytes = Buffer.byteLength(payload);
    if (bytes > limitBytes) {
        throw new Error(`Data item${s}is too large (size: ${bytes} bytes, limit: ${limitBytes} bytes)`);
    }
    return payload;
};

/**
 * Takes an array of JSONs (payloads) as input and produces an array of JSON strings
 * where each string is a JSON array of payloads with a maximum size of limitBytes per one
 * JSON array. Fits as many payloads as possible into a single JSON array and then moves
 * on to the next, preserving item order.
 *
 * The function assumes that none of the items is larger than limitBytes and does not validate.
 *
 * @param {Array<string>} items
 * @param {number} limitBytes
 * @returns {Array<string>}
 * @ignore
 */
export const chunkBySize = (items, limitBytes) => {
    if (!items.length) return [];
    if (items.length === 1) return items;

    let lastChunkBytes = 2; // Add 2 bytes for [] wrapper.
    const chunks = [];
    // Split payloads into buckets of valid size.
    for (const payload of items) {
        const bytes = Buffer.byteLength(payload);

        if (bytes <= limitBytes && (bytes + 2) > limitBytes) {
            // Handle cases where wrapping with [] would fail, but solo object is fine.
            chunks.push(payload);
            lastChunkBytes = bytes;
        } else if (lastChunkBytes + bytes <= limitBytes) {
            if (!Array.isArray(_.last(chunks))) chunks.push([]); // ensure array
            _.last(chunks).push(payload);
            lastChunkBytes += bytes + 1; // Add 1 byte for ',' separator.
        } else {
            chunks.push([payload]);
            lastChunkBytes = bytes + 2; // Add 2 bytes for [] wrapper.
        }
    }

    // Stringify array chunks.
    return chunks.map((chunk) => (typeof chunk === 'string' ? chunk : `[${chunk.join(',')}]`));
};

/**
 * The `Dataset` class represents a store for structured data where each object stored has the same attributes,
 * such as online store products or real estate offers. You can imagine it as a table,
 * where each object is a row and its attributes are columns.
 * Dataset is an append-only storage - you can only add new records to it but you cannot modify or remove existing records.
 * Typically it is used to store crawling results.
 *
 * Do not instantiate this class directly, use the
 * {@link Apify#openDataset} function instead.
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
 * option to {@link Apify#openDataset} function,
 * even if the `APIFY_LOCAL_STORAGE_DIR` variable is set.
 *
 * **Example usage:**
 *
 * ```javascript
 * // Write a single row to the default dataset
 * await Apify.pushData({ col1: 123, col2: 'val2' });
 *
 * // Open a named dataset
 * const dataset = await Apify.openDataset('some-name');
 *
 * // Write a single row
 * await dataset.pushData({ foo: 'bar' });
 *
 * // Write multiple rows
 * await dataset.pushData([
 *   { foo: 'bar2', col2: 'val2' },
 *   { col3: 123 },
 * ]);
 * ```
 * @hideconstructor
 */
export class Dataset {
    /**
     * @param {object} options
     * @param {string} options.id
     * @param {string} [options.name]
     * @param {ApifyClient|ApifyStorageLocal} options.client
     * @param {boolean} options.isLocal
     */
    constructor(options) {
        this.id = options.id;
        this.name = options.name;
        this.isLocal = options.isLocal;
        this.client = options.client.dataset(this.id);
        this.log = log.child({ prefix: 'Dataset' });
    }

    /**
     * Stores an object or an array of objects to the dataset.
     * The function returns a promise that resolves when the operation finishes.
     * It has no result, but throws on invalid args or other errors.
     *
     * **IMPORTANT**: Make sure to use the `await` keyword when calling `pushData()`,
     * otherwise the actor process might finish before the data is stored!
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
     * @param {object|Array<object>} data Object or array of objects containing data to be stored in the default dataset.
     * The objects must be serializable to JSON and the JSON representation of each object must be smaller than 9MB.
     * @return {Promise<void>}
     */
    async pushData(data) {
        ow(data, ow.object);
        const dispatch = async (payload) => await this.client.pushItems(payload);
        const limit = MAX_PAYLOAD_SIZE_BYTES - Math.ceil(MAX_PAYLOAD_SIZE_BYTES * SAFETY_BUFFER_PERCENT);

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
     * Returns {@link DatasetContent} object holding the items in the dataset based on the provided parameters.
     *
     * If you need to get data in an unparsed format, use the {@link Apify#newClient} function to get a new
     * `apify-client` instance and call
     * [`datasetClient.downloadItems()`](https://github.com/apify/apify-client-js#DatasetClient+downloadItems)
     *
     * @param {Object} [options] All `getData()` parameters are passed
     *   via an options object with the following keys:
     * @param {number} [options.offset=0]
     *   Number of array elements that should be skipped at the start.
     * @param {number} [options.limit=250000]
     *   Maximum number of array elements to return.
     * @param {boolean} [options.desc=false]
     *   If `true` then the objects are sorted by `createdAt` in descending order.
     *   Otherwise they are sorted in ascending order.
     * @param {string[]} [options.fields]
     *   An array of field names that will be included in the result. If omitted, all fields are included in the results.
     * @param {string} [options.unwind]
     *   Specifies a name of the field in the result objects that will be used to unwind the resulting objects.
     *   By default, the results are returned as they are.
     * @param {boolean} [options.clean=false]
     *   If `true` then the function returns only non-empty items and skips hidden fields (i.e. fields starting with `#` character).
     *   Note that the `clean` parameter is a shortcut for `skipHidden: true` and `skipEmpty: true` options.
     * @param {boolean} [options.skipHidden=false]
     *   If `true` then the function doesn't return hidden fields (fields starting with "#" character).
     * @param {boolean} [options.skipEmpty=false]
     *   If `true` then the function doesn't return empty items.
     *   Note that in this case the returned number of items might be lower than limit parameter and pagination must be done using the `limit` value.
     * @return {Promise<DatasetContent>}
     */
    async getData(options = {}) {
        try {
            return await this.client.listItems(options);
        } catch (e) {
            if (e.message.includes('Cannot create a string longer than')) {
                throw new Error('dataset.getData(): The response is too large for parsing. You can fix this by lowering the "limit" option.');
            }
            throw e;
        }
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
     *   cleanItemCount: 10
     * }
     * ```
     *
     * @returns {Promise<object>}
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
     * const dataset = await Apify.openDataset('my-results');
     * await dataset.forEach(async (item, index) => {
     *   console.log(`Item at ${index}: ${JSON.stringify(item)}`);
     * });
     * ```
     *
     * @param {DatasetConsumer} iteratee A function that is called for every item in the dataset.
     * @param {Object} [options] All `forEach()` parameters are passed
     *   via an options object with the following keys:
     * @param {boolean} [options.desc=false] If `true` then the objects are sorted by `createdAt` in descending order.
     * @param {string[]} [options.fields] If provided then returned objects will only contain specified keys.
     * @param {string} [options.unwind] If provided then objects will be unwound based on provided field.
     * @param {number} [index=0] Specifies the initial index number passed to the `iteratee` function.
     * @return {Promise<void>}
     */
    async forEach(iteratee, options = {}, index = 0) {
        if (!options.offset) options.offset = 0;
        if (options.format && options.format !== 'json') throw new Error('Dataset.forEach/map/reduce() support only a "json" format.');
        if (!options.limit) options.limit = DATASET_ITERATORS_DEFAULT_LIMIT;

        const { items, total, limit, offset } = await this.getData(options);

        for (const item of items) {
            await iteratee(item, index++);
        }

        const newOffset = offset + limit;
        if (newOffset >= total) return;

        const newOpts = { ...options, offset: newOffset };
        return this.forEach(iteratee, newOpts, index);
    }

    /**
     * Produces a new array of values by mapping each value in list through a transformation function `iteratee()`.
     * Each invocation of `iteratee()` is called with two arguments: `(element, index)`.
     *
     * If `iteratee` returns a `Promise` then it's awaited before a next call.
     *
     * @param {DatasetMapper} iteratee
     * @param {Object} [options] All `map()` parameters are passed
     *   via an options object with the following keys:
     * @param {boolean} [options.desc=false] If `true` then the objects are sorted by createdAt in descending order.
     * @param {string[]} [options.fields] If provided then returned objects will only contain specified keys
     * @param {string} [options.unwind] If provided then objects will be unwound based on provided field.
     * @return {Promise<Array<object>>}
     */
    map(iteratee, options) {
        const result = [];

        const wrappedFunc = (item, index) => {
            return Promise
                .resolve()
                .then(() => iteratee(item, index))
                .then((res) => result.push(res));
        };

        return this
            .forEach(wrappedFunc, options)
            .then(() => result);
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
     * @param {DatasetReducer} iteratee
     * @param {object} memo Initial state of the reduction.
     * @param {Object} [options] All `reduce()` parameters are passed
     *   via an options object with the following keys:
     * @param {boolean} [options.desc=false] If `true` then the objects are sorted by createdAt in descending order.
     * @param {string[]} [options.fields] If provided then returned objects will only contain specified keys
     * @param {string} [options.unwind] If provided then objects will be unwound based on provided field.
     * @return {Promise<object>}
     */
    reduce(iteratee, memo, options) {
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

        return this
            .forEach(wrappedFunc, options)
            .then(() => currentMemo);
    }

    /**
     * Removes the dataset either from the Apify cloud storage or from the local directory,
     * depending on the mode of operation.
     *
     * @return {Promise<void>}
     */
    async drop() {
        await this.client.delete();
        const manager = new StorageManager(Dataset);
        manager.closeStorage(this);
    }
}

/**
 * Opens a dataset and returns a promise resolving to an instance of the {@link Dataset} class.
 *
 * Datasets are used to store structured data where each object stored has the same attributes,
 * such as online store products or real estate offers.
 * The actual data is stored either on the local filesystem or in the cloud.
 *
 * For more details and code examples, see the {@link Dataset} class.
 *
 * @param {string} [datasetIdOrName]
 *   ID or name of the dataset to be opened. If `null` or `undefined`,
 *   the function returns the default dataset associated with the actor run.
 * @param {Object} [options]
 * @param {boolean} [options.forceCloud=false]
 *   If set to `true` then the function uses cloud storage usage even if the `APIFY_LOCAL_STORAGE_DIR`
 *   environment variable is set. This way it is possible to combine local and cloud storage.
 * @param {Configuration} [options.config] SDK configuration instance, defaults to the static register
 * @returns {Promise<Dataset>}
 * @memberof module:Apify
 * @name openDataset
 * @function
 */
export const openDataset = (datasetIdOrName, options = {}) => {
    ow(datasetIdOrName, ow.optional.string);
    ow(options, ow.object.exactShape({
        forceCloud: ow.optional.boolean,
        config: ow.optional.object.instanceOf(Configuration),
    }));

    const manager = new StorageManager(Dataset, options.config);
    return manager.openStorage(datasetIdOrName, options);
};

/**
 * Stores an object or an array of objects to the default {@link Dataset} of the current actor run.
 *
 * This is just a convenient shortcut for {@link Dataset#pushData}.
 * For example, calling the following code:
 * ```javascript
 * await Apify.pushData({ myValue: 123 });
 * ```
 *
 * is equivalent to:
 * ```javascript
 * const dataset = await Apify.openDataset();
 * await dataset.pushData({ myValue: 123 });
 * ```
 *
 * For more information, see {@link Apify#openDataset} and {@link Dataset#pushData}
 *
 * **IMPORTANT**: Make sure to use the `await` keyword when calling `pushData()`,
 * otherwise the actor process might finish before the data are stored!
 *
 * @param {object} item Object or array of objects containing data to be stored in the default dataset.
 * The objects must be serializable to JSON and the JSON representation of each object must be smaller than 9MB.
 * @returns {Promise<void>}
 *
 * @memberof module:Apify
 * @name pushData
 * @function
 */
export const pushData = async (item) => {
    const dataset = await openDataset();

    return dataset.pushData(item);
};

/**
 * @typedef DatasetContent
 * @property {Array<object>} items Dataset entries based on chosen format parameter.
 * @property {number} total Total count of entries in the dataset.
 * @property {number} offset Position of the first returned entry in the dataset.
 * @property {number} count Count of dataset entries returned in this set.
 * @property {number} limit Maximum number of dataset entries requested.
 */

/**
 * User-function used in the `Dataset.forEach()` API.
 *
 * @callback DatasetConsumer
 * @param {object} item Current {@link Dataset} entry being processed.
 * @param {number} index Position of current {Dataset} entry.
 * @returns {object}
 */

/**
 * User-function used in the `Dataset.map()` API.
 *
 * @callback DatasetMapper
 * @param {object} item Currect {@link Dataset} entry being processed.
 * @param {number} index Position of current {Dataset} entry.
 * @returns {object}
 */

/**
 * User-function used in the `Dataset.reduce()` API.
 * @callback DatasetReducer
 * @param {object} memo Previous state of the reduction.
 * @param {object} item Currect {@link Dataset} entry being processed.
 * @param {number} index Position of current {Dataset} entry.
 * @returns {object}
 */
