import JSON5 from 'json5';
import { KEY_VALUE_STORE_KEY_REGEX } from '@apify/consts';
import { jsonStringifyExtended } from '@apify/utilities';
import ow, { ArgumentError } from 'ow';
import type { Dictionary, KeyValueStoreClient, StorageClient } from '@crawlee/types';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { Configuration } from '../configuration';
import type { Awaitable } from '../typedefs';
import type { StorageManagerOptions } from './storage_manager';
import { StorageManager } from './storage_manager';
import { purgeDefaultStorages } from './utils';

/**
 * Helper function to possibly stringify value if options.contentType is not set.
 *
 * @ignore
 */
export const maybeStringify = <T>(value: T, options: { contentType?: string }) => {
    // If contentType is missing, value will be stringified to JSON
    if (options.contentType === null || options.contentType === undefined) {
        options.contentType = 'application/json; charset=utf-8';

        try {
            // Format JSON to simplify debugging, the overheads with compression is negligible
            value = jsonStringifyExtended(value as Dictionary, null, 2) as unknown as T;
        } catch (e) {
            const error = e as Error;
            // Give more meaningful error message
            if (error.message?.indexOf('Invalid string length') >= 0) {
                error.message = 'Object is too large';
            }
            throw new Error(`The "value" parameter cannot be stringified to JSON: ${error.message}`);
        }

        if (value === undefined) {
            throw new Error('The "value" parameter was stringified to JSON and returned undefined. '
                + 'Make sure you\'re not trying to stringify an undefined value.');
        }
    }

    return value;
};

/**
 * The `KeyValueStore` class represents a key-value store, a simple data storage that is used
 * for saving and reading data records or files. Each data record is
 * represented by a unique key and associated with a MIME content type. Key-value stores are ideal
 * for saving screenshots, crawler inputs and outputs, web pages, PDFs or to persist the state of crawlers.
 *
 * Do not instantiate this class directly, use the
 * {@apilink KeyValueStore.open} function instead.
 *
 * Each crawler run is associated with a default key-value store, which is created exclusively
 * for the run. By convention, the crawler input and output are stored into the
 * default key-value store under the `INPUT` and `OUTPUT` key, respectively.
 * Typically, input and output are JSON files, although it can be any other format.
 * To access the default key-value store directly, you can use the
 * {@apilink KeyValueStore.getValue} and {@apilink KeyValueStore.setValue} convenience functions.
 *
 * To access the input, you can also use the {@apilink KeyValueStore.getInput} convenience function.
 *
 * `KeyValueStore` stores its data on a local disk.
 *
 * If the `CRAWLEE_STORAGE_DIR` environment variable is set, the data is stored in
 * the local directory in the following files:
 * ```
 * {CRAWLEE_STORAGE_DIR}/key_value_stores/{STORE_ID}/{INDEX}.{EXT}
 * ```
 * Note that `{STORE_ID}` is the name or ID of the key-value store. The default key-value store has ID: `default`,
 * unless you override it by setting the `CRAWLEE_DEFAULT_KEY_VALUE_STORE_ID` environment variable.
 * The `{KEY}` is the key of the record and `{EXT}` corresponds to the MIME content type of the data value.
 *
 * **Example usage:**
 *
 * ```javascript
 * // Get crawler input from the default key-value store.
 * const input = await KeyValueStore.getInput();
 * // Get some value from the default key-value store.
 * const otherValue = await KeyValueStore.getValue('my-key');
 *
 * // Write crawler output to the default key-value store.
 * await KeyValueStore.setValue('OUTPUT', { myResult: 123 });
 *
 * // Open a named key-value store
 * const store = await KeyValueStore.open('some-name');
 *
 * // Write a record. JavaScript object is automatically converted to JSON,
 * // strings and binary buffers are stored as they are
 * await store.setValue('some-key', { foo: 'bar' });
 *
 * // Read a record. Note that JSON is automatically parsed to a JavaScript object,
 * // text data returned as a string and other data is returned as binary buffer
 * const value = await store.getValue('some-key');
 *
 *  // Drop (delete) the store
 * await store.drop();
 * ```
 * @category Result Stores
 */
export class KeyValueStore {
    readonly id: string;
    readonly name?: string;
    private readonly client: KeyValueStoreClient;
    private persistStateEventStarted = false;

    /** Cache for persistent (auto-saved) values. When we try to set such value, the cache will be updated automatically. */
    private readonly cache = new Map<string, Dictionary>();

    /**
     * @internal
     */
    constructor(options: KeyValueStoreOptions, readonly config = Configuration.getGlobalConfig()) {
        this.id = options.id;
        this.name = options.name;
        this.client = options.client.keyValueStore(this.id);
    }

    /**
     * Gets a value from the key-value store.
     *
     * The function returns a `Promise` that resolves to the record value,
     * whose JavaScript type depends on the MIME content type of the record.
     * Records with the `application/json`
     * content type are automatically parsed and returned as a JavaScript object.
     * Similarly, records with `text/plain` content types are returned as a string.
     * For all other content types, the value is returned as a raw
     * [`Buffer`](https://nodejs.org/api/buffer.html) instance.
     *
     * If the record does not exist, the function resolves to `null`.
     *
     * To save or delete a value in the key-value store, use the
     * {@apilink KeyValueStore.setValue} function.
     *
     * **Example usage:**
     *
     * ```javascript
     * const store = await KeyValueStore.open();
     * const buffer = await store.getValue('screenshot1.png');
     * ```
     * @param key
     *   Unique key of the record. It can be at most 256 characters long and only consist
     *   of the following characters: `a`-`z`, `A`-`Z`, `0`-`9` and `!-_.'()`
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record.
     */
    async getValue<T = unknown>(key: string): Promise<T | null>
    /**
     * Gets a value from the key-value store.
     *
     * The function returns a `Promise` that resolves to the record value,
     * whose JavaScript type depends on the MIME content type of the record.
     * Records with the `application/json`
     * content type are automatically parsed and returned as a JavaScript object.
     * Similarly, records with `text/plain` content types are returned as a string.
     * For all other content types, the value is returned as a raw
     * [`Buffer`](https://nodejs.org/api/buffer.html) instance.
     *
     * If the record does not exist, the function resolves to `null`.
     *
     * To save or delete a value in the key-value store, use the
     * {@apilink KeyValueStore.setValue} function.
     *
     * **Example usage:**
     *
     * ```javascript
     * const store = await KeyValueStore.open();
     * const buffer = await store.getValue('screenshot1.png');
     * ```
     * @param key
     *   Unique key of the record. It can be at most 256 characters long and only consist
     *   of the following characters: `a`-`z`, `A`-`Z`, `0`-`9` and `!-_.'()`
     * @param defaultValue
     *   Fallback that will be returned if no value if present in the storage.
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or the default value if the key is missing from the store.
     */
    async getValue<T = unknown>(key: string, defaultValue: T): Promise<T>
    /**
     * Gets a value from the key-value store.
     *
     * The function returns a `Promise` that resolves to the record value,
     * whose JavaScript type depends on the MIME content type of the record.
     * Records with the `application/json`
     * content type are automatically parsed and returned as a JavaScript object.
     * Similarly, records with `text/plain` content types are returned as a string.
     * For all other content types, the value is returned as a raw
     * [`Buffer`](https://nodejs.org/api/buffer.html) instance.
     *
     * If the record does not exist, the function resolves to `null`.
     *
     * To save or delete a value in the key-value store, use the
     * {@apilink KeyValueStore.setValue} function.
     *
     * **Example usage:**
     *
     * ```javascript
     * const store = await KeyValueStore.open();
     * const buffer = await store.getValue('screenshot1.png');
     * ```
     * @param key
     *   Unique key of the record. It can be at most 256 characters long and only consist
     *   of the following characters: `a`-`z`, `A`-`Z`, `0`-`9` and `!-_.'()`
     * @param defaultValue
     *   Fallback that will be returned if no value if present in the storage.
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or `null` if the key is missing from the store.
     */
    async getValue<T = unknown>(key: string, defaultValue?: T): Promise<T | null> {
        ow(key, ow.string.nonEmpty);
        const record = await this.client.getRecord(key);

        return record?.value as T ?? defaultValue ?? null;
    }

    async getAutoSavedValue<T extends Dictionary = Dictionary>(key: string, defaultValue = {} as T): Promise<T> {
        if (this.cache.has(key)) {
            return this.cache.get(key) as T;
        }

        const value = await this.getValue<T>(key, defaultValue);
        this.cache.set(key, value!);
        this.ensurePersistStateEvent();

        return value!;
    }

    private ensurePersistStateEvent(): void {
        if (this.persistStateEventStarted) {
            return;
        }

        this.config.getEventManager().on('persistState', async () => {
            for (const [key, value] of this.cache) {
                await this.setValue(key, value);
            }
        });

        this.persistStateEventStarted = true;
    }

    /**
     * Saves or deletes a record in the key-value store.
     * The function returns a promise that resolves once the record has been saved or deleted.
     *
     * **Example usage:**
     *
     * ```javascript
     * const store = await KeyValueStore.open();
     * await store.setValue('OUTPUT', { foo: 'bar' });
     * ```
     *
     * Beware that the key can be at most 256 characters long and only contain the following characters: `a-zA-Z0-9!-_.'()`
     *
     * By default, `value` is converted to JSON and stored with the
     * `application/json; charset=utf-8` MIME content type.
     * To store the value with another content type, pass it in the options as follows:
     * ```javascript
     * const store = await KeyValueStore.open('my-text-store');
     * await store.setValue('RESULTS', 'my text data', { contentType: 'text/plain' });
     * ```
     * If you set custom content type, `value` must be either a string or
     * [`Buffer`](https://nodejs.org/api/buffer.html), otherwise an error will be thrown.
     *
     * If `value` is `null`, the record is deleted instead. Note that the `setValue()` function succeeds
     * regardless whether the record existed or not.
     *
     * To retrieve a value from the key-value store, use the
     * {@apilink KeyValueStore.getValue} function.
     *
     * **IMPORTANT:** Always make sure to use the `await` keyword when calling `setValue()`,
     * otherwise the crawler process might finish before the value is stored!
     *
     * @param key
     *   Unique key of the record. It can be at most 256 characters long and only consist
     *   of the following characters: `a`-`z`, `A`-`Z`, `0`-`9` and `!-_.'()`
     * @param value
     *   Record data, which can be one of the following values:
     *    - If `null`, the record in the key-value store is deleted.
     *    - If no `options.contentType` is specified, `value` can be any JavaScript object and it will be stringified to JSON.
     *    - If `options.contentType` is set, `value` is taken as is and it must be a `String` or [`Buffer`](https://nodejs.org/api/buffer.html).
     *   For any other value an error will be thrown.
     * @param [options] Record options.
     */
    async setValue<T>(key: string, value: T | null, options: RecordOptions = {}): Promise<void> {
        ow(key, 'key', ow.string.nonEmpty);
        ow(key, ow.string.validate((k) => ({
            validator: ow.isValid(k, ow.string.matches(KEY_VALUE_STORE_KEY_REGEX)),
            message: 'The "key" argument must be at most 256 characters long and only contain the following characters: a-zA-Z0-9!-_.\'()',
        })));
        if (options.contentType
           && !(ow.isValid(value, ow.any(ow.string, ow.buffer)) || (ow.isValid(value, ow.object) && typeof (value as Dictionary).pipe === 'function'))) {
            throw new ArgumentError('The "value" parameter must be a String, Buffer or Stream when "options.contentType" is specified.', this.setValue);
        }
        ow(options, ow.object.exactShape({
            contentType: ow.optional.string.nonEmpty,
        }));

        // Make copy of options, don't update what user passed.
        const optionsCopy = { ...options };

        // If we try to set the value of a cached state to a different reference, we need to update the cache accordingly.
        const cachedValue = this.cache.get(key);

        if (cachedValue && cachedValue !== value) {
            if (value === null) {
                // Cached state can be only object, so a propagation of `null` means removing all its properties.
                Object.keys(cachedValue).forEach((k) => this.cache.delete(k));
            } else if (typeof value === 'object') {
                // We need to remove the keys that are no longer present in the new value.
                Object.keys(cachedValue)
                    .filter((k) => !(k in (value as Dictionary)))
                    .forEach((k) => this.cache.delete(k));
                // And update the existing ones + add new ones.
                Object.assign(cachedValue, value);
            }
        }

        // In this case delete the record.
        if (value === null) return this.client.deleteRecord(key);

        value = maybeStringify(value, optionsCopy);

        return this.client.setRecord({
            key,
            value,
            contentType: optionsCopy.contentType,
        });
    }

    /**
     * Removes the key-value store either from the Apify cloud storage or from the local directory,
     * depending on the mode of operation.
     */
    async drop(): Promise<void> {
        await this.client.delete();
        const manager = StorageManager.getManager(KeyValueStore, this.config);
        manager.closeStorage(this);
    }

    /** @internal */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Iterates over key-value store keys, yielding each in turn to an `iteratee` function.
     * Each invocation of `iteratee` is called with three arguments: `(key, index, info)`, where `key`
     * is the record key, `index` is a zero-based index of the key in the current iteration
     * (regardless of `options.exclusiveStartKey`) and `info` is an object that contains a single property `size`
     * indicating size of the record in bytes.
     *
     * If the `iteratee` function returns a Promise then it is awaited before the next call.
     * If it throws an error, the iteration is aborted and the `forEachKey` function throws the error.
     *
     * **Example usage**
     * ```javascript
     * const keyValueStore = await KeyValueStore.open();
     * await keyValueStore.forEachKey(async (key, index, info) => {
     *   console.log(`Key at ${index}: ${key} has size ${info.size}`);
     * });
     * ```
     *
     * @param iteratee A function that is called for every key in the key-value store.
     * @param [options] All `forEachKey()` parameters.
     */
    async forEachKey(iteratee: KeyConsumer, options: KeyValueStoreIteratorOptions = {}): Promise<void> {
        return this._forEachKey(iteratee, options);
    }

    private async _forEachKey(iteratee: KeyConsumer, options: KeyValueStoreIteratorOptions = {}, index = 0): Promise<void> {
        const { exclusiveStartKey } = options;
        ow(iteratee, ow.function);
        ow(options, ow.object.exactShape({
            exclusiveStartKey: ow.optional.string,
        }));

        const response = await this.client.listKeys({ exclusiveStartKey });
        const { nextExclusiveStartKey, isTruncated, items } = response;
        for (const item of items) {
            await iteratee(item.key, index++, { size: item.size });
        }
        return isTruncated
            ? this._forEachKey(iteratee, { exclusiveStartKey: nextExclusiveStartKey }, index)
            : undefined; // [].forEach() returns undefined.
    }

    /**
     * Opens a key-value store and returns a promise resolving to an instance of the {@apilink KeyValueStore} class.
     *
     * Key-value stores are used to store records or files, along with their MIME content type.
     * The records are stored and retrieved using a unique key.
     * The actual data is stored either on a local filesystem or in the Apify cloud.
     *
     * For more details and code examples, see the {@apilink KeyValueStore} class.
     *
     * @param [storeIdOrName]
     *   ID or name of the key-value store to be opened. If `null` or `undefined`,
     *   the function returns the default key-value store associated with the crawler run.
     * @param [options] Storage manager options.
     */
    static async open(storeIdOrName?: string | null, options: StorageManagerOptions = {}): Promise<KeyValueStore> {
        ow(storeIdOrName, ow.optional.any(ow.string, ow.null));
        ow(options, ow.object.exactShape({
            config: ow.optional.object.instanceOf(Configuration),
        }));
        await purgeDefaultStorages();
        const manager = StorageManager.getManager(this, options.config);

        return manager.openStorage(storeIdOrName);
    }

    /**
     * Gets a value from the default {@apilink KeyValueStore} associated with the current crawler run.
     *
     * This is just a convenient shortcut for {@apilink KeyValueStore.getValue}.
     * For example, calling the following code:
     * ```javascript
     * const value = await KeyValueStore.getValue('my-key');
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const store = await KeyValueStore.open();
     * const value = await store.getValue('my-key');
     * ```
     *
     * To store the value to the default key-value store, you can use the {@apilink KeyValueStore.setValue} function.
     *
     * For more information, see  {@apilink KeyValueStore.open}
     * and  {@apilink KeyValueStore.getValue}.
     *
     * @param key Unique record key.
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or `null`
     *   if the record is missing.
     * @ignore
     */
    static async getValue<T = unknown>(key: string): Promise<T | null>
    /**
     * Gets a value from the default {@apilink KeyValueStore} associated with the current crawler run.
     *
     * This is just a convenient shortcut for {@apilink KeyValueStore.getValue}.
     * For example, calling the following code:
     * ```javascript
     * const value = await KeyValueStore.getValue('my-key');
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const store = await KeyValueStore.open();
     * const value = await store.getValue('my-key');
     * ```
     *
     * To store the value to the default key-value store, you can use the {@apilink KeyValueStore.setValue} function.
     *
     * For more information, see  {@apilink KeyValueStore.open}
     * and  {@apilink KeyValueStore.getValue}.
     *
     * @param key Unique record key.
     * @param defaultValue Fallback that will be returned if no value if present in the storage.
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or the provided default value.
     * @ignore
     */
    static async getValue<T = unknown>(key: string, defaultValue: T): Promise<T>
    /**
     * Gets a value from the default {@apilink KeyValueStore} associated with the current crawler run.
     *
     * This is just a convenient shortcut for {@apilink KeyValueStore.getValue}.
     * For example, calling the following code:
     * ```javascript
     * const value = await KeyValueStore.getValue('my-key');
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const store = await KeyValueStore.open();
     * const value = await store.getValue('my-key');
     * ```
     *
     * To store the value to the default key-value store, you can use the {@apilink KeyValueStore.setValue} function.
     *
     * For more information, see  {@apilink KeyValueStore.open}
     * and  {@apilink KeyValueStore.getValue}.
     *
     * @param key Unique record key.
     * @param defaultValue Fallback that will be returned if no value if present in the storage.
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or `null`
     *   if the record is missing.
     * @ignore
     */
    static async getValue<T = unknown>(key: string, defaultValue?: T): Promise<T | null> {
        const store = await this.open();
        return store.getValue<T>(key, defaultValue as T);
    }

    static async getAutoSavedValue<T extends Dictionary = Dictionary>(key: string, defaultValue = {} as T): Promise<T> {
        const store = await this.open();
        return store.getAutoSavedValue(key, defaultValue);
    }

    /**
     * Stores or deletes a value in the default {@apilink KeyValueStore} associated with the current crawler run.
     *
     * This is just a convenient shortcut for  {@apilink KeyValueStore.setValue}.
     * For example, calling the following code:
     * ```javascript
     * await KeyValueStore.setValue('OUTPUT', { foo: "bar" });
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const store = await KeyValueStore.open();
     * await store.setValue('OUTPUT', { foo: "bar" });
     * ```
     *
     * To get a value from the default key-value store, you can use the  {@apilink KeyValueStore.getValue} function.
     *
     * For more information, see  {@apilink KeyValueStore.open}
     * and  {@apilink KeyValueStore.getValue}.
     *
     * @param key
     *   Unique record key.
     * @param value
     *   Record data, which can be one of the following values:
     *    - If `null`, the record in the key-value store is deleted.
     *    - If no `options.contentType` is specified, `value` can be any JavaScript object, and it will be stringified to JSON.
     *    - If `options.contentType` is set, `value` is taken as is, and it must be a `String` or [`Buffer`](https://nodejs.org/api/buffer.html).
     *   For any other value an error will be thrown.
     * @param [options]
     * @ignore
     */
    static async setValue<T>(key: string, value: T | null, options: RecordOptions = {}): Promise<void> {
        const store = await this.open();
        return store.setValue(key, value, options);
    }

    /**
     * Gets the crawler input value from the default {@apilink KeyValueStore} associated with the current crawler run.
     * By default, it will try to find root input files (either extension-less, `.json` or `.txt`),
     * or alternatively read the input from the default {@apilink KeyValueStore}.
     *
     * Note that the `getInput()` function does not cache the value read from the key-value store.
     * If you need to use the input multiple times in your crawler,
     * it is far more efficient to read it once and store it locally.
     *
     * For more information, see {@apilink KeyValueStore.open}
     * and {@apilink KeyValueStore.getValue}.
     *
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or `null`
     *   if the record is missing.
     * @ignore
     */
    static async getInput<T = Dictionary | string | Buffer>(): Promise<T | null> {
        const store = await this.open();
        const inputKey = store.config.get('inputKey')!;

        const cwd = process.cwd();
        const possibleExtensions = ['', '.json', '.txt'];

        // Attempt to read input from root file instead of key-value store
        for (const extension of possibleExtensions) {
            const inputFile = join(cwd, `${inputKey}${extension}`);
            let input: Buffer;

            // Try getting the file from the file system
            try {
                input = await readFile(inputFile);
            } catch {
                continue;
            }

            // Attempt to parse as JSON, or return the input as is otherwise
            try {
                return JSON5.parse(input.toString()) as T;
            } catch {
                return input as unknown as T;
            }
        }

        return store.getValue<T>(inputKey);
    }
}

/**
 * User-function used in the  {@apilink KeyValueStore.forEachKey} method.
 */
export interface KeyConsumer {
    /**
     * @param key Current {@apilink KeyValueStore} key being processed.
     * @param index Position of the current key in {@apilink KeyValueStore}.
     * @param info Information about the current {@apilink KeyValueStore} entry.
     * @param info.size Size of the value associated with the current key in bytes.
     */
    (key: string, index: number, info: { size: number }): Awaitable<void>;
}

export interface KeyValueStoreOptions {
    id: string;
    name?: string;
    client: StorageClient;
}

export interface RecordOptions {
    /**
     * Specifies a custom MIME content type of the record.
     */
    contentType?: string;
}

export interface KeyValueStoreIteratorOptions {
    /**
     * All keys up to this one (including) are skipped from the result.
     */
    exclusiveStartKey?: string;
}
