export const DATASET_ITERATORS_DEFAULT_LIMIT: 10000;
export const LOCAL_STORAGE_SUBDIR: string;
export const LOCAL_FILENAME_DIGITS: 9;
export const LOCAL_GET_ITEMS_DEFAULT_LIMIT: 250000;
export function checkAndSerialize(item: Object, limitBytes: number, index?: number | undefined): string;
export function chunkBySize(items: any[], limitBytes: number): any[];
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
     * @param {string} datasetId
     * @param {string} datasetName
     */
    constructor(datasetId: string, datasetName: string);
    datasetId: string;
    datasetName: string;
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
    pushData(data: any): Promise<void>;
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
     * @param {string} [options.format='json']
     *   Format of the `items` property, possible values are: `json`, `csv`, `xlsx`, `html`, `xml` and `rss`.
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
     * @param {boolean} [options.disableBodyParser=false]
     *   If `true` then response from API will not be parsed.
     * @param {boolean} [options.attachment=false]
     *   If `true` then the response will define the `Content-Disposition: attachment` HTTP header, forcing a web
     *   browser to download the file rather than to display it. By default, this header is not present.
     * @param {string} [options.delimiter=',']
     *   A delimiter character for CSV files, only used if `format` is `csv`.
     * @param {boolean} [options.bom]
     *   All responses are encoded in UTF-8 encoding. By default, the CSV files are prefixed with the UTF-8 Byte
     *   Order Mark (BOM), while JSON, JSONL, XML, HTML and RSS files are not. If you want to override this default
     *   behavior, set `bom` option to `true` to include the BOM, or set `bom` to `false` to skip it.
     * @param {string} [options.xmlRoot='results']
     *   Overrides the default root element name of the XML output. By default, the root element is `results`.
     * @param {string} [options.xmlRow='page']
     *   Overrides the default element name that wraps each page or page function result object in XML output.
     *   By default, the element name is `page` or `result`, depending on the value of the `simplified` option.
     * @param {boolean} [options.skipHeaderRow=false]
     *   If set to `true` then header row in CSV format is skipped.
     * @param {boolean} [options.clean=false]
     *   If `true` then the function returns only non-empty items and skips hidden fields (i.e. fields starting with `#` character).
     *   Note that the `clean` parameter is a shortcut for `skipHidden: true` and `skipEmpty: true` options.
     * @param {boolean} [options.skipHidden=false]
     *   If `true` then the function doesn't return hidden fields (fields starting with "#" character).
     * @param {boolean} [options.skipEmpty=false]
     *   If `true` then the function doesn't return empty items.
     *   Note that in this case the returned number of items might be lower than limit parameter and pagination must be done using the `limit` value.
     * @param {boolean} [options.simplified]
     *   If `true` then function applies the `fields: ['url','pageFunctionResult','errorInfo']` and `unwind: 'pageFunctionResult'` options.
     *   This feature is used to emulate simplified results provided by Apify API version 1 used for
     *   the legacy Apify Crawler and it's not recommended to use it in new integrations.
     * @param {boolean} [options.skipFailedPages]
     *   If `true` then, the all the items with errorInfo property will be skipped from the output.
     *   This feature is here to emulate functionality of Apify API version 1 used for
     *   the legacy Apify Crawler product and it's not recommended to use it in new integrations.
     * @return {Promise<DatasetContent>}
     */
    getData(options?: {
        format?: string;
        offset?: number;
        limit?: number;
        desc?: boolean;
        fields?: string[];
        unwind?: string;
        disableBodyParser?: boolean;
        attachment?: boolean;
        delimiter?: string;
        bom?: boolean;
        xmlRoot?: string;
        xmlRow?: string;
        skipHeaderRow?: boolean;
        clean?: boolean;
        skipHidden?: boolean;
        skipEmpty?: boolean;
        simplified?: boolean;
        skipFailedPages?: boolean;
    } | undefined): Promise<DatasetContent>;
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
    getInfo(): Promise<any>;
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
    forEach(iteratee: DatasetConsumer, options?: {
        desc?: boolean;
        fields?: string[];
        unwind?: string;
    } | undefined, index?: number | undefined): Promise<void>;
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
    map(iteratee: DatasetMapper, options?: {
        desc?: boolean;
        fields?: string[];
        unwind?: string;
    } | undefined): Promise<any[]>;
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
    reduce(iteratee: DatasetReducer, memo: any, options?: {
        desc?: boolean;
        fields?: string[];
        unwind?: string;
    } | undefined): Promise<any>;
    /**
     * Removes the dataset either from the Apify cloud storage or from the local directory,
     * depending on the mode of operation.
     *
     * @return {Promise<void>}
     */
    drop(): Promise<void>;
    /** @ignore */
    delete(): Promise<void>;
}
/**
 * This is a local emulation of a dataset.
 *
 * @ignore
 */
export class DatasetLocal {
    constructor(datasetId: any, localStorageDir: any);
    localStoragePath: string;
    counter: number | null;
    datasetId: any;
    createdAt: any;
    modifiedAt: any;
    accessedAt: any;
    initializationPromise: any;
    _initialize(): any;
    pushData(data: any): any;
    getData(opts?: {}): Promise<{
        items: any[];
        total: number | null;
        offset: any;
        count: number;
        limit: any;
    }>;
    getInfo(): Promise<{
        id: any;
        name: any;
        userId: string | null;
        createdAt: any;
        modifiedAt: any;
        accessedAt: any;
        itemCount: number | null;
        cleanItemCount: number | null;
    }>;
    forEach(iteratee: any): Promise<void>;
    map(iteratee: any): Promise<any[]>;
    reduce(iteratee: any, memo: any): Promise<any>;
    drop(): Promise<void>;
    delete(): Promise<void>;
    /**
     * Returns an array of item indexes for given offset and limit.
     */
    _getItemIndexes(offset?: number, limit?: number | null): number[];
    /**
     * Reads and parses file for given index.
     */
    _readAndParseFile(index: any): Promise<any>;
    _updateMetadata(isModified: any): void;
}
export function openDataset(datasetIdOrName?: string | undefined, options?: {
    forceCloud?: boolean;
} | undefined): Promise<Dataset>;
export function pushData(item: any): Promise<void>;
export type DatasetContent = {
    /**
     * Dataset entries based on chosen format parameter.
     */
    items: any[];
    /**
     * Total count of entries in the dataset.
     */
    total: number;
    /**
     * Position of the first returned entry in the dataset.
     */
    offset: number;
    /**
     * Count of dataset entries returned in this set.
     */
    count: number;
    /**
     * Maximum number of dataset entries requested.
     */
    limit: number;
};
/**
 * User-function used in the `Dataset.forEach()` API.
 */
export type DatasetConsumer = (item: any, index: number) => any;
/**
 * User-function used in the `Dataset.map()` API.
 */
export type DatasetMapper = (item: any, index: number) => any;
/**
 * User-function used in the `Dataset.reduce()` API.
 */
export type DatasetReducer = (memo: any, item: any, index: number) => any;
