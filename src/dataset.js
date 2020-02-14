import path from 'path';
import { promisify } from 'util';
import fs from 'fs-extra';
import _ from 'underscore';
import { leftpad } from 'apify-shared/utilities';
import LruCache from 'apify-shared/lru_cache';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { ENV_VARS, LOCAL_STORAGE_SUBDIRS, MAX_PAYLOAD_SIZE_BYTES } from 'apify-shared/consts';
import { apifyClient, ensureDirExists, openRemoteStorage, openLocalStorage, ensureTokenOrLocalStorageEnvExists } from './utils';

export const DATASET_ITERATORS_DEFAULT_LIMIT = 10000;
export const LOCAL_STORAGE_SUBDIR = LOCAL_STORAGE_SUBDIRS.datasets;
export const LOCAL_FILENAME_DIGITS = 9;
export const LOCAL_GET_ITEMS_DEFAULT_LIMIT = 250000;
const MAX_OPENED_STORES = 1000;
const SAFETY_BUFFER_PERCENT = 0.01 / 100; // 0.01%

const writeFilePromised = promisify(fs.writeFile);
const readFilePromised = promisify(fs.readFile);
const readdirPromised = promisify(fs.readdir);
const statPromised = promisify(fs.stat);
const emptyDirPromised = promisify(fs.emptyDir);

const getLocaleFilename = index => `${leftpad(index, LOCAL_FILENAME_DIGITS, 0)}.json`;

const { datasets } = apifyClient;
const datasetsCache = new LruCache({ maxLength: MAX_OPENED_STORES }); // Open Datasets are stored here.

/**
 * Accepts a JSON serializable object as an input, validates its serializability,
 * and validates its serialized size against limitBytes. Optionally accepts its index
 * in an array to provide better error messages. Returns serialized object.
 *
 * @param {Object} item
 * @param {Number} limitBytes
 * @param {Number} [index]
 * @returns {string}
 * @ignore
 */
export const checkAndSerialize = (item, limitBytes, index) => {
    const s = typeof index === 'number' ? ` at index ${index} ` : ' ';
    let payload;
    try {
        checkParamOrThrow(item, 'item', 'Object');
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
 * @param {Array} items
 * @param {Number} limitBytes
 * @returns {Array}
 * @ignore
 */
export const chunkBySize = (items, limitBytes) => {
    if (!items.length) return [];
    if (items.length === 1) return items;

    let lastChunkBytes = 2; // Add 2 bytes for [] wrapper.
    const chunks = [];
    // Split payloads into buckets of valid size.
    for (const payload of items) { // eslint-disable-line
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
    return chunks.map(chunk => (typeof chunk === 'string' ? chunk : `[${chunk.join(',')}]`));
};

/**
 * The `Dataset` class represents a store for structured data where each object stored has the same attributes,
 * such as online store products or real estate offers. You can imagine it as a table,
 * where each object is a row and its attributes are columns.
 * Dataset is an append-only storage - you can only add new records to it but you cannot modify or remove existing records.
 * Typically it is used to store crawling results.
 *
 * Do not instantiate this class directly, use the
 * [`Apify.openDataset()`](apify#module_Apify.openDataset) function instead.
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
 * <a href="https://docs.apify.com/storage/dataset" target="_blank">Apify Dataset</a>
 * cloud storage. Note that you can force usage of the cloud storage also by passing the `forceCloud`
 * option to [`Apify.openDataset()`](apify#module_Apify.openDataset) function,
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
     * @param {string} datasetId
     * @param {string} datasetName
     */
    constructor(datasetId, datasetName) {
        checkParamOrThrow(datasetId, 'datasetId', 'String');
        checkParamOrThrow(datasetName, 'datasetName', 'Maybe String');

        this.datasetId = datasetId;
        this.datasetName = datasetName;
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
     *
     * @param {Object|Array} data Object or array of objects containing data to be stored in the default dataset.
     * The objects must be serializable to JSON and the JSON representation of each object must be smaller than 9MB.
     * @return {Promise<void>}
     */
    async pushData(data) {
        checkParamOrThrow(data, 'data', 'Array | Object');
        const dispatch = async payload => datasets.putItems({ datasetId: this.datasetId, data: payload });
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
     * Returns {DatasetContent} object holding the items in the dataset based on the provided parameters.
     *
     * **NOTE**: If using dataset with local disk storage, the `format` option must be `json` and
     * the following options are not supported:
     * `unwind`, `disableBodyParser`, `attachment`, `bom` and `simplified`.
     * If you try to use them, you will receive an error.
     *
     * @param {Object} [options] All `getData()` parameters are passed
     *   via an options object with the following keys:
     * @param {String} [options.format='json']
     *   Format of the `items` property, possible values are: `json`, `csv`, `xlsx`, `html`, `xml` and `rss`.
     * @param {Number} [options.offset=0]
     *   Number of array elements that should be skipped at the start.
     * @param {Number} [options.limit=250000]
     *   Maximum number of array elements to return.
     * @param {Boolean} [options.desc=false]
     *   If `true` then the objects are sorted by `createdAt` in descending order.
     *   Otherwise they are sorted in ascending order.
     * @param {Array} [options.fields]
     *   An array of field names that will be included in the result. If omitted, all fields are included in the results.
     * @param {String} [options.unwind]
     *   Specifies a name of the field in the result objects that will be used to unwind the resulting objects.
     *   By default, the results are returned as they are.
     * @param {Boolean} [options.disableBodyParser=false]
     *   If `true` then response from API will not be parsed.
     * @param {Boolean} [options.attachment=false]
     *   If `true` then the response will define the `Content-Disposition: attachment` HTTP header, forcing a web
     *   browser to download the file rather than to display it. By default, this header is not present.
     * @param {String} [options.delimiter=',']
     *   A delimiter character for CSV files, only used if `format` is `csv`.
     * @param {Boolean} [options.bom]
     *   All responses are encoded in UTF-8 encoding. By default, the CSV files are prefixed with the UTF-8 Byte
     *   Order Mark (BOM), while JSON, JSONL, XML, HTML and RSS files are not. If you want to override this default
     *   behavior, set `bom` option to `true` to include the BOM, or set `bom` to `false` to skip it.
     * @param {String} [options.xmlRoot='results']
     *   Overrides the default root element name of the XML output. By default, the root element is `results`.
     * @param {String} [options.xmlRow='page']
     *   Overrides the default element name that wraps each page or page function result object in XML output.
     *   By default, the element name is `page` or `result`, depending on the value of the `simplified` option.
     * @param {Boolean} [options.skipHeaderRow=false]
     *   If set to `true` then header row in CSV format is skipped.
     * @param {Boolean} [options.clean=false]
     *   If `true` then the function returns only non-empty items and skips hidden fields (i.e. fields starting with `#` character).
     *   Note that the `clean` parameter is a shortcut for `skipHidden: true` and `skipEmpty: true` options.
     * @param {Boolean} [options.skipHidden=false]
     *   If `true` then the function doesn't return hidden fields (fields starting with "#" character).
     * @param {Boolean} [options.skipEmpty=false]
     *   If `true` then the function doesn't return empty items.
     *   Note that in this case the returned number of items might be lower than limit parameter and pagination must be done using the `limit` value.
     * @param {Boolean} [options.simplified]
     *   If `true` then function applies the `fields: ['url','pageFunctionResult','errorInfo']` and `unwind: 'pageFunctionResult'` options.
     *   This feature is used to emulate simplified results provided by Apify API version 1 used for
     *   the legacy Apify Crawler and it's not recommended to use it in new integrations.
     * @param {Boolean} [options.skipFailedPages]
     *   If `true` then, the all the items with errorInfo property will be skipped from the output.
     *   This feature is here to emulate functionality of Apify API version 1 used for
     *   the legacy Apify Crawler product and it's not recommended to use it in new integrations.
     * @return {Promise<DatasetContent>}
     */
    async getData(options = {}) {
        // TODO (JC): Do we really need this function? It only works with API but not locally,
        // and it's just 1:1 copy of what apify-client provides, and returns { items } which can
        // be a Buffer ... it doesn't really make much sense
        const { datasetId } = this;
        const params = Object.assign({ datasetId }, options);

        try {
            return await datasets.getItems(params);
        } catch (e) {
            if (e.message.includes('Cannot create a string longer than')) {
                throw new Error(
                    'dataset.getData(): The response is too large for parsing. You can fix this by lowering the "limit" option.',
                );
            }
            throw e;
        }
    }

    // TODO yin: After ApifyClient declarations, re-export this typedef for {DatasetInfo}.
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
     * @returns {Promise<Object>}
     */
    async getInfo() {
        return datasets.getDataset({ datasetId: this.datasetId });
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
     * @param {Boolean} [options.desc=false] If `true` then the objects are sorted by `createdAt` in descending order.
     * @param {Array} [options.fields] If provided then returned objects will only contain specified keys.
     * @param {String} [options.unwind] If provided then objects will be unwound based on provided field.
     * @param {Number} [index=0] Specifies the initial index number passed to the `iteratee` function.
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

        const newOpts = Object.assign({}, options, {
            offset: newOffset,
        });
        return this.forEach(iteratee, newOpts, index);
    }

    /**
     * Produces a new array of values by mapping each value in list through a transformation function `iteratee()`.
     * Each invocation of `iteratee()` is called with two arguments: `(element, index)`.
     *
     * If `iteratee` returns a `Promise` then it's awaited before a next call.
     *
     * @template T
     * @param {DatasetMapper} iteratee
     * @param {Object} options All `map()` parameters are passed
     *   via an options object with the following keys:
     * @param {Boolean} [options.desc=false] If `true` then the objects are sorted by createdAt in descending order.
     * @param {Array} [options.fields] If provided then returned objects will only contain specified keys
     * @param {String} [options.unwind] If provided then objects will be unwound based on provided field.
     * @return {Promise<T[]>}
     */
    map(iteratee, options) {
        const result = [];

        const wrappedFunc = (item, index) => {
            return Promise
                .resolve()
                .then(() => iteratee(item, index))
                .then(res => result.push(res));
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
     * @template T
     * @param {DatasetReducer} iteratee
     * @param {T} memo Initial state of the reduction.
     * @param {Object} options All `reduce()` parameters are passed
     *   via an options object with the following keys:
     * @param {Boolean} [options.desc=false] If `true` then the objects are sorted by createdAt in descending order.
     * @param {Array} [options.fields] If provided then returned objects will only contain specified keys
     * @param {String} [options.unwind] If provided then objects will be unwound based on provided field.
     * @return {Promise<T>}
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
        await datasets.deleteDataset({ datasetId: this.datasetId });
        datasetsCache.remove(this.datasetId);
        if (this.datasetName) datasetsCache.remove(this.datasetName);
    }

    /** @ignore */
    async delete() {
        log.deprecated('dataset.delete() is deprecated. Please use dataset.drop() instead. '
            + 'This is to make it more obvious to users that the function deletes the dataset and not individual records in the dataset.');
        await this.drop();
    }
}

/**
 * This is a local emulation of a dataset.
 *
 * @ignore
 */
export class DatasetLocal {
    constructor(datasetId, localStorageDir) {
        checkParamOrThrow(datasetId, 'datasetId', 'String');
        checkParamOrThrow(localStorageDir, 'localStorageDir', 'String');

        this.localStoragePath = path.resolve(path.join(localStorageDir, LOCAL_STORAGE_SUBDIR, datasetId));
        this.counter = null;
        this.datasetId = datasetId;

        this.createdAt = null;
        this.modifiedAt = null;
        this.accessedAt = null;

        this.initializationPromise = this._initialize();
    }

    _initialize() {
        return ensureDirExists(this.localStoragePath)
            .then(() => readdirPromised(this.localStoragePath))
            .then((files) => {
                if (files.length) {
                    const lastFileNum = files.pop().split('.')[0];
                    this.counter = parseInt(lastFileNum, 10);
                } else {
                    this.counter = 0;
                }
                return statPromised(this.localStoragePath);
            })
            .then((stats) => {
                this.createdAt = stats.birthtime;
                this.modifiedAt = stats.mtime;
                this.accessedAt = stats.atime;
            });
    }

    pushData(data) {
        checkParamOrThrow(data, 'data', 'Array | Object');

        if (!_.isArray(data)) data = [data];

        return this.initializationPromise
            .then(() => {
                const promises = data.map((item) => {
                    this.counter++;

                    // Format JSON to simplify debugging, the overheads is negligible
                    const itemStr = JSON.stringify(item, null, 2);
                    const filePath = path.join(this.localStoragePath, getLocaleFilename(this.counter));

                    return writeFilePromised(filePath, itemStr);
                });
                this._updateMetadata(true);
                return Promise.all(promises);
            });
    }

    async getData(opts = {}) {
        checkParamOrThrow(opts, 'opts', 'Object');
        checkParamOrThrow(opts.limit, 'opts.limit', 'Maybe Number');
        checkParamOrThrow(opts.offset, 'opts.offset', 'Maybe Number');
        checkParamOrThrow(opts.desc, 'opts.desc', 'Maybe Boolean');

        if (opts.format && opts.format !== 'json') {
            throw new Error(`Datasets with local disk storage only support the "json" format (was "${opts.format}")`);
        }
        if (opts.unwind || opts.disableBodyParser || opts.attachment || opts.bom || opts.simplified) {
            // eslint-disable-next-line max-len
            throw new Error('Datasets with local disk storage do not support the following options: unwind, disableBodyParser, attachment, bom, simplified');
        }

        if (!opts.limit) opts.limit = LOCAL_GET_ITEMS_DEFAULT_LIMIT;
        if (!opts.offset) opts.offset = 0;

        await this.initializationPromise;
        const indexes = this._getItemIndexes(opts.offset, opts.limit);
        const items = [];
        for (const idx of indexes) {
            const item = await this._readAndParseFile(idx);
            items.push(item);
        }

        this._updateMetadata();
        return {
            items: opts.desc ? items.reverse() : items,
            total: this.counter,
            offset: opts.offset,
            count: items.length,
            limit: opts.limit,
        };
    }

    async getInfo() {
        await this.initializationPromise;

        const id = this.datasetId;
        const name = id === ENV_VARS.DEFAULT_DATASET_ID ? null : id;
        const result = {
            id,
            name,
            userId: process.env[ENV_VARS.USER_ID] || null,
            createdAt: this.createdAt,
            modifiedAt: this.modifiedAt,
            accessedAt: this.accessedAt,
            itemCount: this.counter,
            // TODO: This number is not counted correctly!
            cleanItemCount: this.counter,
        };

        this._updateMetadata();
        return result;
    }

    async forEach(iteratee) {
        await this.initializationPromise;
        const indexes = this._getItemIndexes();
        for (const idx of indexes) {
            const item = await this._readAndParseFile(idx);
            await iteratee(item, idx - 1);
        }
    }

    async map(iteratee) {
        await this.initializationPromise;
        const indexes = this._getItemIndexes();
        const results = [];
        for (const idx of indexes) {
            const item = await this._readAndParseFile(idx);
            const result = await iteratee(item, idx - 1);
            results.push(result);
        }
        return results;
    }

    async reduce(iteratee, memo) {
        await this.initializationPromise;
        const indexes = this._getItemIndexes();
        if (memo === undefined) memo = indexes.shift();
        for (const idx of indexes) {
            const item = await this._readAndParseFile(idx);
            memo = await iteratee(memo, item, idx - 1);
        }
        return memo;
    }

    async drop() {
        await this.initializationPromise;
        await emptyDirPromised(this.localStoragePath);
        this._updateMetadata(true);
        datasetsCache.remove(this.datasetId);
    }

    async delete() {
        log.deprecated('dataset.delete() is deprecated. Please use dataset.drop() instead. '
            + 'This is to make it more obvious to users that the function deletes the dataset and not individual records in the dataset.');
        await this.drop();
    }

    /**
     * Returns an array of item indexes for given offset and limit.
     */
    _getItemIndexes(offset = 0, limit = this.counter) {
        if (limit === null) throw new Error('DatasetLocal must be initialized before calling this._getItemIndexes()!');
        const start = offset + 1;
        const end = Math.min(offset + limit, this.counter) + 1;
        if (start > end) return [];
        return _.range(start, end);
    }

    /**
     * Reads and parses file for given index.
     */
    _readAndParseFile(index) {
        const filePath = path.join(this.localStoragePath, getLocaleFilename(index));

        return readFilePromised(filePath)
            .then((json) => {
                this._updateMetadata();
                return JSON.parse(json);
            });
    }

    _updateMetadata(isModified) {
        const date = new Date();
        this.accessedAt = date;
        if (isModified) this.modifiedAt = date;
    }
}

/**
 * Helper function that first requests dataset by ID and if dataset doesn't exist then gets it by name.
 *
 * @ignore
 */
const getOrCreateDataset = (datasetIdOrName) => {
    return datasets
        .getDataset({ datasetId: datasetIdOrName })
        .then((existingDataset) => {
            if (existingDataset) return existingDataset;

            return datasets.getOrCreateDataset({ datasetName: datasetIdOrName });
        });
};


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
 * @param {object} [options]
 * @param {boolean} [options.forceCloud=false]
 *   If set to `true` then the function uses cloud storage usage even if the `APIFY_LOCAL_STORAGE_DIR`
 *   environment variable is set. This way it is possible to combine local and cloud storage.
 * @returns {Promise<Dataset>}
 * @memberof module:Apify
 * @name openDataset
 * @function
 */
export const openDataset = (datasetIdOrName, options = {}) => {
    checkParamOrThrow(datasetIdOrName, 'datasetIdOrName', 'Maybe String');
    checkParamOrThrow(options, 'options', 'Object');
    ensureTokenOrLocalStorageEnvExists('dataset');

    const { forceCloud = false } = options;
    checkParamOrThrow(forceCloud, 'options.forceCloud', 'Boolean');

    return process.env[ENV_VARS.LOCAL_STORAGE_DIR] && !forceCloud
        ? openLocalStorage(datasetIdOrName, ENV_VARS.DEFAULT_DATASET_ID, DatasetLocal, datasetsCache)
        : openRemoteStorage(datasetIdOrName, ENV_VARS.DEFAULT_DATASET_ID, Dataset, datasetsCache, getOrCreateDataset);
};

/**
 * Stores an object or an array of objects to the default {@link Dataset} of the current actor run.
 *
 * This is just a convenient shortcut for [`dataset.pushData()`](dataset#Dataset+pushData).
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
 * For more information, see [`Apify.openDataset()`](apify#module_Apify.openDataset) and [`dataset.pushData()`](dataset#Dataset+pushData)
 *
 * **IMPORTANT**: Make sure to use the `await` keyword when calling `pushData()`,
 * otherwise the actor process might finish before the data are stored!
 *
 * @param {Object|Array} item Object or array of objects containing data to be stored in the default dataset.
 * The objects must be serializable to JSON and the JSON representation of each object must be smaller than 9MB.
 * @returns {Promise}
 *
 * @memberof module:Apify
 * @name pushData
 * @function
 */
export const pushData = item => openDataset().then(dataset => dataset.pushData(item));

/**
 * @typedef DatasetContent
 * @property {Object[]|String[]|Buffer[]} items Dataset entries based on chosen format parameter.
 * @property {Number} total Total count of entries in the dataset.
 * @property {Number} offset Position of the first returned entry in the dataset.
 * @property {Number} count Count of dataset entries returned in this set.
 * @property {Number} limit Maximum number of dataset entries requested.
 */

// TODO yin: Typescript candoes not understand `@callback` with generic `@template T`. Change after this is fixed
/**
 * User-function used in the `Dataset.forEach()` API.
 * @callback DatasetConsumer
 * @param {Object} item Current {@link Dataset} entry being processed.
 * @param {Number} index Position of current {Dataset} entry.
 * @returns T
 */

// TODO yin: Typescript candoes not understand `@callback` with generic `@template T`. Change after this is fixed
/**
 * User-function used in the `Dataset.map()` API.
 * @callback DatasetMapper
 * @param {Object} item Currect {@link Dataset} entry being processed.
 * @param {Number} index Position of current {Dataset} entry.
 * @returns T
 */

// TODO yin: Typescript candoes not understand `@callback` with generic `@template T`. Change after this is fixed
/**
 * User-function used in the `Dataset.reduce()` API.
 * @callback DatasetReducer
 * @param {T} memo Previous state of the reduction.
 * @param {Object} item Currect {@link Dataset} entry being processed.
 * @param {Number} index Position of current {Dataset} entry.
 * @returns T
 */
