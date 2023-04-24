import type { DatasetClient, DatasetInfo, Dictionary, StorageClient } from '@crawlee/types';
import { Configuration } from '../configuration';
import type { Awaitable } from '../typedefs';
import type { StorageManagerOptions } from './storage_manager';
/** @internal */
export declare const DATASET_ITERATORS_DEFAULT_LIMIT = 10000;
/**
 * Accepts a JSON serializable object as an input, validates its serializability,
 * and validates its serialized size against limitBytes. Optionally accepts its index
 * in an array to provide better error messages. Returns serialized object.
 * @ignore
 */
export declare function checkAndSerialize<T>(item: T, limitBytes: number, index?: number): string;
/**
 * Takes an array of JSONs (payloads) as input and produces an array of JSON strings
 * where each string is a JSON array of payloads with a maximum size of limitBytes per one
 * JSON array. Fits as many payloads as possible into a single JSON array and then moves
 * on to the next, preserving item order.
 *
 * The function assumes that none of the items is larger than limitBytes and does not validate.
 * @ignore
 */
export declare function chunkBySize(items: string[], limitBytes: number): string[];
export interface DatasetDataOptions {
    /**
     * Number of array elements that should be skipped at the start.
     * @default 0
     */
    offset?: number;
    /**
     * Maximum number of array elements to return.
     * @default 250000
     */
    limit?: number;
    /**
     * If `true` then the objects are sorted by `createdAt` in descending order.
     * Otherwise they are sorted in ascending order.
     * @default false
     */
    desc?: boolean;
    /**
     * An array of field names that will be included in the result. If omitted, all fields are included in the results.
     */
    fields?: string[];
    /**
     * Specifies a name of the field in the result objects that will be used to unwind the resulting objects.
     * By default, the results are returned as they are.
     */
    unwind?: string;
    /**
     * If `true` then the function returns only non-empty items and skips hidden fields (i.e. fields starting with `#` character).
     * Note that the `clean` parameter is a shortcut for `skipHidden: true` and `skipEmpty: true` options.
     * @default false
     */
    clean?: boolean;
    /**
     * If `true` then the function doesn't return hidden fields (fields starting with "#" character).
     * @default false
     */
    skipHidden?: boolean;
    /**
     * If `true` then the function doesn't return empty items.
     * Note that in this case the returned number of items might be lower than limit parameter and pagination must be done using the `limit` value.
     * @default false
     */
    skipEmpty?: boolean;
}
export interface DatasetIteratorOptions extends Omit<DatasetDataOptions, 'offset' | 'limit' | 'clean' | 'skipHidden' | 'skipEmpty'> {
    /** @internal */
    offset?: number;
    /**
     * @default 10000
     * @internal
     */
    limit?: number;
    /** @internal */
    clean?: boolean;
    /** @internal */
    skipHidden?: boolean;
    /** @internal */
    skipEmpty?: boolean;
    /** @internal */
    format?: string;
}
export interface ExportOptions {
    fromDataset?: string;
    toKVS?: string;
}
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
export declare class Dataset<Data extends Dictionary = Dictionary> {
    readonly config: Configuration;
    id: string;
    name?: string;
    client: DatasetClient<Data>;
    log: import("@apify/log/log").Log;
    /**
     * @internal
     */
    constructor(options: DatasetOptions, config?: Configuration);
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
    pushData(data: Data | Data[]): Promise<void>;
    /**
     * Returns {@apilink DatasetContent} object holding the items in the dataset based on the provided parameters.
     */
    getData(options?: DatasetDataOptions): Promise<DatasetContent<Data>>;
    /**
     * Save the entirety of the dataset's contents into one file within a key-value store.
     *
     * @param key The name of the value to save the data in.
     * @param [options] An optional options object where you can provide the dataset and target KVS name.
     * @param [contentType] Only JSON and CSV are supported currently, defaults to JSON.
     */
    exportTo(key: string, options?: ExportOptions, contentType?: string): Promise<void>;
    /**
     * Save entire default dataset's contents into one JSON file within a key-value store.
     *
     * @param key The name of the value to save the data in.
     * @param [options] An optional options object where you can provide the target KVS name.
     */
    exportToJSON(key: string, options?: Omit<ExportOptions, 'fromDataset'>): Promise<void>;
    /**
     * Save entire default dataset's contents into one CSV file within a key-value store.
     *
     * @param key The name of the value to save the data in.
     * @param [options] An optional options object where you can provide the target KVS name.
     */
    exportToCSV(key: string, options?: Omit<ExportOptions, 'fromDataset'>): Promise<void>;
    /**
     * Save entire default dataset's contents into one JSON file within a key-value store.
     *
     * @param key The name of the value to save the data in.
     * @param [options] An optional options object where you can provide the dataset and target KVS name.
     */
    static exportToJSON(key: string, options?: ExportOptions): Promise<void>;
    /**
     * Save entire default dataset's contents into one CSV file within a key-value store.
     *
     * @param key The name of the value to save the data in.
     * @param [options] An optional options object where you can provide the dataset and target KVS name.
     */
    static exportToCSV(key: string, options?: ExportOptions): Promise<void>;
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
    getInfo(): Promise<DatasetInfo | undefined>;
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
    forEach(iteratee: DatasetConsumer<Data>, options?: DatasetIteratorOptions, index?: number): Promise<void>;
    /**
     * Produces a new array of values by mapping each value in list through a transformation function `iteratee()`.
     * Each invocation of `iteratee()` is called with two arguments: `(element, index)`.
     *
     * If `iteratee` returns a `Promise` then it's awaited before a next call.
     *
     * @param iteratee
     * @param [options] All `map()` parameters.
     */
    map<R>(iteratee: DatasetMapper<Data, R>, options?: DatasetIteratorOptions): Promise<R[]>;
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
    reduce<T>(iteratee: DatasetReducer<T, Data>, memo: T, options?: DatasetIteratorOptions): Promise<T>;
    /**
     * Removes the dataset either from the Apify cloud storage or from the local directory,
     * depending on the mode of operation.
     */
    drop(): Promise<void>;
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
    static open<Data extends Dictionary = Dictionary>(datasetIdOrName?: string | null, options?: StorageManagerOptions): Promise<Dataset<Data>>;
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
    static pushData<Data extends Dictionary = Dictionary>(item: Data | Data[]): Promise<void>;
    /**
     * Returns {@apilink DatasetContent} object holding the items in the dataset based on the provided parameters.
     */
    static getData<Data extends Dictionary = Dictionary>(options?: DatasetDataOptions): Promise<DatasetContent<Data>>;
}
/**
 * User-function used in the `Dataset.forEach()` API.
 */
export interface DatasetConsumer<Data> {
    /**
     * @param item Current {@apilink Dataset} entry being processed.
     * @param index Position of current {@apilink Dataset} entry.
     */
    (item: Data, index: number): Awaitable<void>;
}
/**
 * User-function used in the `Dataset.map()` API.
 */
export interface DatasetMapper<Data, R> {
    /**
     * User-function used in the `Dataset.map()` API.
     * @param item Current {@apilink Dataset} entry being processed.
     * @param index Position of current {@apilink Dataset} entry.
     */
    (item: Data, index: number): Awaitable<R>;
}
/**
 * User-function used in the `Dataset.reduce()` API.
 */
export interface DatasetReducer<T, Data> {
    /**
     * @param memo Previous state of the reduction.
     * @param item Current {@apilink Dataset} entry being processed.
     * @param index Position of current {@apilink Dataset} entry.
     */
    (memo: T, item: Data, index: number): Awaitable<T>;
}
export interface DatasetOptions {
    id: string;
    name?: string;
    client: StorageClient;
}
export interface DatasetContent<Data> {
    /** Total count of entries in the dataset. */
    total: number;
    /** Count of dataset entries returned in this set. */
    count: number;
    /** Position of the first returned entry in the dataset. */
    offset: number;
    /** Maximum number of dataset entries requested. */
    limit: number;
    /** Dataset entries based on chosen format parameter. */
    items: Data[];
    /** Should the results be in descending order. */
    desc?: boolean;
}
//# sourceMappingURL=dataset.d.ts.map