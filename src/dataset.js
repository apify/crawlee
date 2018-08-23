import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import _ from 'underscore';
import Promise from 'bluebird';
import { leftpad } from 'apify-shared/utilities';
import LruCache from 'apify-shared/lru_cache';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { ENV_VARS, LOCAL_EMULATION_SUBDIRS, MAX_PAYLOAD_SIZE_BYTES } from './constants';
import { apifyClient, ensureDirExists } from './utils';

export const LOCAL_EMULATION_SUBDIR = LOCAL_EMULATION_SUBDIRS.datasets;
export const LOCAL_FILENAME_DIGITS = 9;
export const LOCAL_GET_ITEMS_DEFAULT_LIMIT = 250000;
const MAX_OPENED_STORES = 1000;
const SAFETY_BUFFER_PERCENT = 0.01 / 100; // 0.01%

const writeFilePromised = Promise.promisify(fs.writeFile);
const readFilePromised = Promise.promisify(fs.readFile);
const readdirPromised = Promise.promisify(fs.readdir);
const statPromised = Promise.promisify(fs.stat);
const emptyDirPromised = Promise.promisify(fsExtra.emptyDir);

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
 * @typedef {Object} PaginationList
 * @property {Array} items - List of returned objects
 * @property {Number} total - Total number of object
 * @property {Number} offset - Number of Request objects that was skipped at the start.
 * @property {Number} count - Number of returned objects
 * @property {Number} limit - Requested limit
 */

/**
 * The `Dataset` class provides a simple interface to the [Apify Dataset](https://www.apify.com/docs/storage#dataset) storage.
 * You should not instantiate this class directly, use the [Apify.openDataset()](#module-Apify-openDataset) function.
 *
 * Example usage:
 *
 * ```javascript
 * const dataset = await Apify.openDataset('my-dataset-id');
 * await dataset.pushData({ foo: 'bar' });
 * ```
 *
 * @param {String} datasetId - ID of the dataset.
 */
export class Dataset {
    constructor(datasetId) {
        checkParamOrThrow(datasetId, 'datasetId', 'String');

        this.datasetId = datasetId;
    }

    /**
     * Stores object or an array of objects in the dataset.
     * The function has no result, but rejects on invalid args or other errors.
     *
     * The size of data is limited by the receiving API and therefore pushData will only
     * allow an {Object} smaller than 9MB. When an {Array} is passed, none of the included objects
     * may be larger than 9MB, but the Array itself may be of any size. pushData will internally
     * chunk the array into separate items for the client to dispatch them as separate requests.
     *
     * The chunking process is stable (keeps order of data), but it does not provide a transaction
     * safety mechanism. Therefore, in case of an uploading error (after several automatic retries),
     * the function's promise will reject and the dataset will be left in a state, where some of
     * the items have already been saved to the dataset while other items from the source array were not.
     * To overcome this limitation, the developer may for example read the last item saved in the dataset
     * and re-attempt the save of the data from this item onwards to prevent duplicates.
     *
     * @return {Promise} That resolves when data gets saved into the dataset.
     */
    pushData(data) {
        checkParamOrThrow(data, 'data', 'Array | Object');
        const dispatch = payload => datasets.putItems({ datasetId: this.datasetId, data: payload });
        const limit = MAX_PAYLOAD_SIZE_BYTES - Math.ceil(MAX_PAYLOAD_SIZE_BYTES * SAFETY_BUFFER_PERCENT);

        // Handle singular Objects
        if (!Array.isArray(data)) {
            try {
                const payload = checkAndSerialize(data, limit);
                return dispatch(payload);
            } catch (err) {
                return Promise.reject(err);
            }
        }

        // Handle Arrays
        let payloads;
        try {
            payloads = data.map((item, index) => checkAndSerialize(item, limit, index));
        } catch (err) {
            return Promise.reject(err);
        }
        const chunks = chunkBySize(payloads, limit);

        // Invoke client in series to preserve order of data
        return Promise.mapSeries(chunks, chunk => dispatch(chunk));
    }

    /**
     * Returns items in the dataset based on the provided parameters.
     *
     * If format is `json` then doesn't return an array of records but <a href="#PaginationList">PaginationList</a> instead.
     *
     * @param {Object} options
     * @param {String} [options.format='json'] - Format of the items, possible values are: json, csv, xlsx, html, xml and rss.
     * @param {Number} [options.offset=0] - Number of array elements that should be skipped at the start.
     * @param {Number} [options.limit=250000] - Maximum number of array elements to return.
     * @param {Number} [options.desc] - If 1 then the objects are sorted by createdAt in descending order.
     * @param {Array} [options.fields] - If provided then returned objects will only contain specified keys
     * @param {String} [options.unwind] - If provided then objects will be unwound based on provided field.
     * @param {Boolean} [options.disableBodyParser] - If true then response from API will not be parsed
     * @param {Number} [options.attachment] - If 1 then the response will define the Content-Disposition: attachment header, forcing a web
     *                                        browser to download the file rather than to display it. By default this header is not present.
     * @param {String} [options.delimiter=','] - A delimiter character for CSV files, only used if format=csv. You might need to URL-encode
     *                                           the character (e.g. use %09 for tab or %3B for semicolon).
     * @param {Number} [options.bom] - All responses are encoded in UTF-8 encoding. By default, the csv files are prefixed with the UTF-8 Byte
     *                                 Order Mark (BOM), while json, jsonl, xml, html and rss files are not. If you want to override this default
     *                                 behavior, specify bom=1 query parameter to include the BOM or bom=0 to skip it.
     * @param {String} [options.xmlRoot] - Overrides default root element name of xml output. By default the root element is results.
     * @param {String} [options.xmlRow] - Overrides default element name that wraps each page or page function result object in xml output.
     *                                    By default the element name is page or result based on value of simplified parameter.
     * @param {Number} [options.skipHeaderRow] - If set to `1` then header row in csv format is skipped.
     * @return {Promise}
     */
    getData(opts = {}) {
        const { datasetId } = this;
        const params = Object.assign({ datasetId }, opts);

        return datasets.getItems(params);
    }

    /**
     * Returns an object containing general information about the dataset.
     *
     * @example
     * {
     *   "id": "WkzbQMuFYuamGv3YF",
     *   "name": "d7b9MDYsbtX5L7XAj",
     *   "userId": "wRsJZtadYvn4mBZmm",
     *   "createdAt": "2015-12-12T07:34:14.202Z",
     *   "modifiedAt": "2015-12-13T08:36:13.202Z",
     *   "accessedAt": "2015-12-14T08:36:13.202Z",
     *   "itemsCount": 0
     * }
     *
     * @param opts
     * @returns {Promise}
     */
    getInfo(opts = {}) {
        const { datasetId } = this;
        const params = Object.assign({ datasetId }, opts);

        return datasets.getDataset(params);
    }

    /**
     * Iterates over the all dataset items, yielding each in turn to an iteratee function.
     * Each invocation of iteratee is called with three arguments: (element, index).
     *
     * If iteratee returns a Promise then it's awaited before a next call.
     *
     * @param {Function} iteratee
     * @param {Opts} opts
     * @param {Number} [options.offset=0] - Number of array elements that should be skipped at the start.
     * @param {Number} [options.desc] - If 1 then the objects are sorted by createdAt in descending order.
     * @param {Array} [options.fields] - If provided then returned objects will only contain specified keys
     * @param {String} [options.unwind] - If provided then objects will be unwound based on provided field.
     * @param {Number} [options.limit=250000] - How many items to load in one request.
     * @param {Number} index [description]
     * @return {Promise<undefined>}
     */
    forEach(iteratee, opts = {}, index = 0) {
        if (!opts.offset) opts.offset = 0;
        if (opts.format && opts.format !== 'json') throw new Error('Dataset.forEach/map/reduce() support only a "json" format.');

        return this
            .getData(opts)
            .then(({ items, total, limit, offset }) => {
                return Promise
                    .mapSeries(items, item => iteratee(item, index++))
                    .then(() => {
                        const newOffset = offset + limit;

                        if (newOffset >= total) return undefined;

                        const newOpts = Object.assign({}, opts, {
                            offset: newOffset,
                        });

                        return this.forEach(iteratee, newOpts, index);
                    });
            });
    }

    /**
     * Produces a new array of values by mapping each value in list through a transformation function (iteratee).
     * Each invocation of iteratee is called with three arguments: (element, index).
     *
     * If iteratee returns a Promise then it's awaited before a next call.
     *
     * @param {Function} iteratee
     * @param {Opts} opts
     * @param {Number} [options.offset=0] - Number of array elements that should be skipped at the start.
     * @param {Number} [options.desc] - If 1 then the objects are sorted by createdAt in descending order.
     * @param {Array} [options.fields] - If provided then returned objects will only contain specified keys
     * @param {String} [options.unwind] - If provided then objects will be unwound based on provided field.
     * @param {Number} [options.limit=250000] - How many items to load in one request.
     * @param {Number} index [description]
     * @return {Promise<Array>}
     */
    map(iteratee, opts) {
        const result = [];

        const wrappedFunc = (item, index) => {
            return Promise
                .resolve()
                .then(() => iteratee(item, index))
                .then(res => result.push(res));
        };

        return this
            .forEach(wrappedFunc, opts)
            .then(() => result);
    }

    /**
     * Memo is the initial state of the reduction, and each successive step of it should be returned by iteratee.
     * The iteratee is passed three arguments: the memo, then the value and index of the iteration.
     *
     * If no memo is passed to the initial invocation of reduce, the iteratee is not invoked on the first element of the list.
     * The first element is instead passed as the memo in the invocation of the iteratee on the next element in the list.
     *
     * If iteratee returns a Promise then it's awaited before a next call.
     *
     * @param {Function} iteratee
     * @param {*} memo
     * @param {Opts} opts
     * @param {Number} [options.offset=0] - Number of array elements that should be skipped at the start.
     * @param {Number} [options.desc] - If 1 then the objects are sorted by createdAt in descending order.
     * @param {Array} [options.fields] - If provided then returned objects will only contain specified keys
     * @param {String} [options.unwind] - If provided then objects will be unwound based on provided field.
     * @param {Number} [options.limit=250000] - How many items to load in one request.
     * @param {Number} index [description]
     * @return {Promise<*>}
     */
    reduce(iteratee, memo, opts) {
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
            .forEach(wrappedFunc, opts)
            .then(() => currentMemo);
    }

    /**
     * Deletes the dataset.
     *
     * @return {Promise}
     */
    delete() {
        return datasets
            .deleteDataset({
                datasetId: this.datasetId,
            })
            .then(() => {
                datasetsCache.remove(this.datasetId);
            });
    }
}

/**
 * This is a local emulation of a dataset.
 *
 * @ignore
 */
export class DatasetLocal {
    constructor(datasetId, localEmulationDir) {
        checkParamOrThrow(datasetId, 'datasetId', 'String');
        checkParamOrThrow(localEmulationDir, 'localEmulationDir', 'String');

        this.localEmulationPath = path.resolve(path.join(localEmulationDir, LOCAL_EMULATION_SUBDIR, datasetId));
        this.counter = null;
        this.datasetId = datasetId;
        this.initializationPromise = this._initialize();
    }

    _initialize() {
        return ensureDirExists(this.localEmulationPath)
            .then(() => readdirPromised(this.localEmulationPath))
            .then((files) => {
                if (files.length) {
                    const lastFileNum = files.pop().split('.')[0];
                    this.counter = parseInt(lastFileNum, 10);
                } else {
                    this.counter = 0;
                }
                return statPromised(this.localEmulationPath);
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
                    const filePath = path.join(this.localEmulationPath, getLocaleFilename(this.counter));

                    return writeFilePromised(filePath, itemStr);
                });
                this._updateMetadata(true);
                return Promise.all(promises);
            });
    }

    getData(opts = {}) {
        checkParamOrThrow(opts, 'opts', 'Object');
        checkParamOrThrow(opts.limit, 'opts.limit', 'Maybe Number');
        checkParamOrThrow(opts.offset, 'opts.offset', 'Maybe Number');

        if (!opts.limit) opts.limit = LOCAL_GET_ITEMS_DEFAULT_LIMIT;
        if (!opts.offset) opts.offset = 0;

        return this.initializationPromise
            .then(() => {
                const indexes = this._getItemIndexes(opts.offset, opts.limit);

                return Promise.mapSeries(indexes, index => this._readAndParseFile(index));
            })
            .then((items) => {
                this._updateMetadata();
                return {
                    items,
                    total: this.counter,
                    offset: opts.offset,
                    count: items.length,
                    limit: opts.limit,
                };
            });
    }

    getInfo() {
        return this.initializationPromise
            .then(() => {
                const id = this.datasetId;
                const name = id === ENV_VARS.DEFAULT_DATASET_ID ? null : id;
                return {
                    id,
                    name,
                    userId: process.env[ENV_VARS.USER_ID] || null,
                    createdAt: this.createdAt,
                    modifiedAt: this.modifiedAt,
                    accessedAt: this.accessedAt,
                    itemsCount: this.counter,
                };
            });
    }

    forEach(iteratee) {
        return this.initializationPromise
            .then(() => {
                const indexes = this._getItemIndexes();

                return Promise.each(indexes, (index) => {
                    return this
                        ._readAndParseFile(index)
                        .then(item => iteratee(item, index - 1));
                });
            })
            .then(() => undefined);
    }

    map(iteratee) {
        return this.initializationPromise
            .then(() => {
                const indexes = this._getItemIndexes();

                return Promise
                    .map(indexes, (index) => {
                        return this
                            ._readAndParseFile(index)
                            .then(item => iteratee(item, index - 1));
                    });
            });
    }

    reduce(iteratee, memo) {
        return this.initializationPromise
            .then(() => {
                const indexes = this._getItemIndexes();

                return Promise
                    .reduce(indexes, (currentMemo, index) => {
                        return this
                            ._readAndParseFile(index)
                            .then(item => iteratee(currentMemo, item, index - 1));
                    }, memo);
            });
    }

    delete() {
        return this.initializationPromise
            .then(() => emptyDirPromised(this.localEmulationPath))
            .then(() => {
                this._updateMetadata(true);
                datasetsCache.remove(this.datasetId);
            });
    }

    /**
     * Returns an array of item indexes for given offset and limit.
     */
    _getItemIndexes(offset = 0, limit = this.counter) {
        if (limit === null) throw new Error('DatasetLocal must be initialize before calling this._getItemIndexes()!');

        return _.range(
            offset + 1,
            Math.min(offset + limit, this.counter) + 1,
        );
    }

    /**
     * Reads and parses file for given index.
     */
    _readAndParseFile(index) {
        const filePath = path.join(this.localEmulationPath, getLocaleFilename(index));

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
 * Opens a dataset and returns a promise resolving to an instance of the [Dataset](#Dataset) object.
 *
 * Dataset is an append-only storage that is useful for storing sequential or tabular results.
 * For more information, see [Dataset documentation](https://www.apify.com/docs/storage#dataset).
 *
 * Example usage:
 *
 * ```javascript
 * // Opens dataset called 'some-name'.
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
 *
 * If the `APIFY_LOCAL_EMULATION_DIR` environment variable is set, the result of this function
 * is an instance of the `DatasetLocal` class which stores the data in a local directory
 * rather than Apify cloud. This is useful for local development and debugging of your actors.
 *
 * @param {string} datasetIdOrName ID or name of the dataset to be opened. If no value is provided
 *                                 then the function opens the default dataset associated with the actor run.
 * @returns {Promise<Dataset>} Returns a promise that resolves to a `Dataset` object.
 *
 * @memberof module:Apify
 * @name openDataset
 * @instance
 * @function
 */
export const openDataset = (datasetIdOrName) => {
    checkParamOrThrow(datasetIdOrName, 'datasetIdOrName', 'Maybe String');

    const localEmulationDir = process.env[ENV_VARS.LOCAL_EMULATION_DIR];

    let isDefault = false;
    let datasetPromise;

    if (!datasetIdOrName) {
        const envVar = ENV_VARS.DEFAULT_DATASET_ID;

        // Env var doesn't exist.
        if (!process.env[envVar]) return Promise.reject(new Error(`The '${envVar}' environment variable is not defined.`));

        isDefault = true;
        datasetIdOrName = process.env[envVar];
    }

    datasetPromise = datasetsCache.get(datasetIdOrName);

    // Found in cache.
    if (datasetPromise) return datasetPromise;

    // Use local emulation?
    if (localEmulationDir) {
        datasetPromise = Promise.resolve(new DatasetLocal(datasetIdOrName, localEmulationDir));
    } else {
        datasetPromise = isDefault // If true then we know that this is an ID of existing dataset.
            ? Promise.resolve(new Dataset(datasetIdOrName))
            : getOrCreateDataset(datasetIdOrName).then(dataset => (new Dataset(dataset.id)));
    }

    datasetsCache.add(datasetIdOrName, datasetPromise);

    return datasetPromise;
};

// TODO: This documentation duplicates docs for Dataset.pushData(). We should only
// have it there and add a link to it, rahter than to duplicate the content.

/**
 * Stores object or an array of objects in the default dataset for the current actor run using the Apify API
 * Default id of the dataset is in the `APIFY_DEFAULT_DATASET_ID` environment variable.
 * The function has no result, but throws on invalid args or other errors.
 *
 * ```javascript
 * await Apify.pushData({
 *   field1: 'value1',
 *   field2: 123,
 * });
 * ```
 *
 * The data is stored in the default dataset associated with this actor.
 *
 * If the `APIFY_LOCAL_EMULATION_DIR` environment variable is defined, the data gets pushed into local directory.
 * This feature is useful for local development and debugging of your actors.
 *
 * **IMPORTANT**: Do not forget to use the `await` keyword when calling `Apify.pushData()`,
 * otherwise the actor process might finish before the data is stored!
 *
 * @param {Object|Array} data Object or array of objects containing data to be stored in the dataset.
 * The objects must be serializable to JSON and the JSON representation of each object must be less than 9MB large.
 * @returns {Promise} Returns a promise that gets resolved once the data is saved.
 *
 * @memberof module:Apify
 * @name pushData
 * @instance
 * @function
 */
export const pushData = item => openDataset().then(dataset => dataset.pushData(item));
