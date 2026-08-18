import type { Awaitable, DatasetBackend, DatasetInfo, Dictionary } from '@crawlee/types';
import { Configuration } from '../configuration.js';
import type { CrawleeLogger } from '../log.js';
import type { JournalEntry } from './transaction.js';
import type { DatasetStats } from './storage_stats.js';
import type { StorageOpenOptions } from './utils.js';
import type { StorageIdentifier } from './storage_instance_manager.js';
/** @internal */
export declare const DATASET_ITERATORS_DEFAULT_LIMIT = 10000;
/**
 * Validates that the given value is a plain JSON-serializable object
 * (not an array, not a primitive, not circular).
 *
 * @param item The value to validate.
 * @param index Optional index for error messages when validating inside an array.
 * @ignore
 */
export declare function assertJsonSerializable<T>(item: T, index?: number): void;
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
export interface DatasetExportOptions extends Omit<DatasetDataOptions, 'offset' | 'limit'> {
    /**
     * If true, includes all unique keys from all dataset items in the CSV export header.
     * If omitted or false, only keys from the first item are used.
     */
    collectAllKeys?: boolean;
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
export interface DatasetExportToOptions extends DatasetExportOptions {
    fromDataset?: string | StorageIdentifier;
    toKVS?: string | StorageIdentifier;
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
    #private;
    readonly configuration: Configuration;
    id: string;
    name?: string;
    backend: DatasetBackend<Data>;
    log: CrawleeLogger;
    /**
     * @internal
     */
    constructor(options: DatasetOptions, configuration?: Configuration);
    /**
     * Backend-independent usage counters tracked for this dataset (read / write operations issued to
     * the underlying storage backend). Counted per backend call.
     */
    get stats(): DatasetStats;
    /**
     * Stores an object or an array of objects to the dataset.
     * The function returns a promise that resolves when the operation finishes.
     * It has no result, but throws on invalid args or other errors.
     *
     * **IMPORTANT**: Make sure to use the `await` keyword when calling `pushData()`,
     * otherwise the crawler process might finish before the data is stored!
     *
     * @param data Object or array of objects containing data to be stored in the default dataset.
     *   The objects must be serializable to JSON.
     */
    pushData(data: Data | Data[]): Promise<void>;
    /**
     * Returns {@apilink DatasetContent} object holding the items in the dataset based on the provided parameters.
     */
    getData(options?: DatasetDataOptions): Promise<DatasetContent<Data>>;
    /**
     * The single transaction-aware page read all dataset read paths go through — both `getData()` and
     * the private `fetchPages()`. Returns the real page concatenated with the current transaction's
     * buffered items, with `offset` / `limit` / `desc` windowing applied across the concatenation.
     */
    private readPage;
    /** The active transaction's buffered writes to this dataset, derived from its journal. */
    private bufferedJournalEntries;
    /** @internal */
    commitJournalEntries(entries: JournalEntry[]): Promise<void>;
    /**
     * Returns all the data from the dataset. This will iterate through the whole dataset
     * via the `listItems()` client method, which gives you only paginated results.
     */
    export(options?: DatasetExportOptions): Promise<Data[]>;
    /**
     * Save the entirety of the dataset's contents into one file within a key-value store.
     *
     * @param key The name of the value to save the data in.
     * @param [options] An optional options object where you can provide the dataset and target KVS name.
     * @param [contentType] Only JSON and CSV are supported currently, defaults to JSON.
     */
    exportTo(key: string, options?: DatasetExportToOptions, contentType?: string): Promise<Data[]>;
    /**
     * Save entire default dataset's contents into one JSON file within a key-value store.
     *
     * @param key The name of the value to save the data in.
     * @param [options] An optional options object where you can provide the target KVS name.
     */
    exportToJSON(key: string, options?: Omit<DatasetExportToOptions, 'fromDataset'>): Promise<void>;
    /**
     * Save entire default dataset's contents into one CSV file within a key-value store.
     *
     * @param key The name of the value to save the data in.
     * @param [options] An optional options object where you can provide the target KVS name.
     */
    exportToCSV(key: string, options?: Omit<DatasetExportToOptions, 'fromDataset'>): Promise<void>;
    /**
     * Save entire default dataset's contents into one JSON file within a key-value store.
     *
     * @param key The name of the value to save the data in.
     * @param [options] An optional options object where you can provide the dataset and target KVS name.
     */
    static exportToJSON(key: string, options?: DatasetExportToOptions): Promise<void>;
    /**
     * Save entire default dataset's contents into one CSV file within a key-value store.
     *
     * @param key The name of the value to save the data in.
     * @param [options] An optional options object where you can provide the dataset and target KVS name.
     */
    static exportToCSV(key: string, options?: DatasetExportToOptions): Promise<void>;
    /**
     * Returns an object containing general information about the dataset.
     *
     * **Example:**
     * ```
     * {
     *   id: "WkzbQMuFYuamGv3YF",
     *   name: "my-dataset",
     *   createdAt: new Date("2015-12-12T07:34:14.202Z"),
     *   modifiedAt: new Date("2015-12-13T08:36:13.202Z"),
     *   accessedAt: new Date("2015-12-14T08:36:13.202Z"),
     *   itemCount: 14,
     * }
     * ```
     *
     * @throws If the underlying storage no longer exists (e.g. it was deleted externally).
     */
    getInfo(): Promise<DatasetInfo>;
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
     * The first element of the dataset is the initial value, with each successive reductions should
     * be returned by `iteratee()`. The `iteratee()` is passed three arguments: the `memo`, `value`
     * and `index` of the current element being folded into the reduction.
     *
     * The `iteratee` is first invoked on the second element of the list (`index = 1`), with the
     * first element given as the memo parameter. After that, the rest of the elements in the
     * dataset is passed to `iteratee`, with the result of the previous invocation as the memo.
     *
     * If `iteratee()` returns a `Promise` it's awaited before a next call.
     *
     * If the dataset is empty, reduce will return undefined.
     *
     * @param iteratee
     */
    reduce(iteratee: DatasetReducer<Data, Data>): Promise<Data | undefined>;
    /**
     * Reduces a list of values down to a single value.
     *
     * The first element of the dataset is the initial value, with each successive reductions should
     * be returned by `iteratee()`. The `iteratee()` is passed three arguments: the `memo`, `value`
     * and `index` of the current element being folded into the reduction.
     *
     * The `iteratee` is first invoked on the second element of the list (`index = 1`), with the
     * first element given as the memo parameter. After that, the rest of the elements in the
     * dataset is passed to `iteratee`, with the result of the previous invocation as the memo.
     *
     * If `iteratee()` returns a `Promise` it's awaited before a next call.
     *
     * If the dataset is empty, reduce will return undefined.
     *
     * @param iteratee
     * @param memo Unset parameter, necessary to be able to pass options
     * @param [options] An object containing extra options for `reduce()`
     */
    reduce(iteratee: DatasetReducer<Data, Data>, memo: undefined, options: DatasetIteratorOptions): Promise<Data | undefined>;
    /**
     * Reduces a list of values down to a single value.
     *
     * Memo is the initial state of the reduction, and each successive step of it should be returned
     * by `iteratee()`. The `iteratee()` is passed three arguments: the `memo`, then the `value` and
     * `index` of the iteration.
     *
     * If `iteratee()` returns a `Promise` then it's awaited before a next call.
     *
     * @param iteratee
     * @param memo Initial state of the reduction.
     * @param [options] An object containing extra options for `reduce()`
     */
    reduce<T>(iteratee: DatasetReducer<T, Data>, memo: T, options?: DatasetIteratorOptions): Promise<T>;
    private fetchEntryPages;
    private fetchPages;
    /**
     * Returns dataset items.
     *
     * When awaited (`await dataset.values()`), returns all items as a flat `Data[]` array.
     * When used as an async iterable (`for await...of`), iterates over all items across pages
     * without loading everything into memory at once.
     *
     * **Example usage:**
     * ```javascript
     * const dataset = await Dataset.open('my-results');
     *
     * // Iterate over all items (memory-efficient for large datasets)
     * for await (const item of dataset.values()) {
     *   console.log(item);
     * }
     *
     * // Or fetch all items at once
     * const items = await dataset.values();
     * console.log(items);
     * ```
     *
     * @param options Options for the iteration.
     */
    values(options?: DatasetIteratorOptions): AsyncIterable<Data> & Promise<Data[]>;
    /**
     * Returns dataset entries (index-value pairs).
     *
     * When awaited (`await dataset.entries()`), returns all entries as a flat `[index, item][]` array.
     * When used as an async iterable (`for await...of`), iterates over all entries across pages
     * without loading everything into memory at once.
     *
     * **Example usage:**
     * ```javascript
     * const dataset = await Dataset.open('my-results');
     *
     * // Iterate over all entries
     * for await (const [index, item] of dataset.entries()) {
     *   console.log(`Item at ${index}: ${JSON.stringify(item)}`);
     * }
     *
     * // Or fetch all at once
     * const entries = await dataset.entries();
     * console.log(entries);
     * ```
     *
     * @param options Options for the iteration.
     */
    entries(options?: DatasetIteratorOptions): AsyncIterable<[number, Data]> & Promise<[number, Data][]>;
    /**
     * Default async iterator for the dataset, iterating over items.
     * Allows using the dataset directly in a `for await...of` loop.
     *
     * **Example usage:**
     * ```javascript
     * const dataset = await Dataset.open('my-results');
     * for await (const item of dataset) {
     *   console.log(item);
     * }
     * ```
     */
    [Symbol.asyncIterator](): AsyncGenerator<Data, void, undefined>;
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
     * @param [identifier]
     *   ID or name of the dataset to be opened. If a string is provided, it will first be
     *   looked up as an ID; if no such storage exists, it will be treated as a name.
     *   If `null` or `undefined`, the function returns the default dataset associated with the crawler run.
     * @param [options] Storage manager options.
     */
    static open<Data extends Dictionary = Dictionary>(identifier?: string | StorageIdentifier | null, options?: StorageOpenOptions): Promise<Dataset<Data>>;
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
    /** Resolved metadata for the dataset, as returned by the backend's `getMetadata()`. */
    metadata: DatasetInfo;
    backend: DatasetBackend;
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
