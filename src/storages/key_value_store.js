import { KEY_VALUE_STORE_KEY_REGEX } from 'apify-shared/regexs';
import { ENV_VARS, KEY_VALUE_STORE_KEYS } from 'apify-shared/consts';
import { jsonStringifyExtended } from 'apify-shared/utilities';
import ow, { ArgumentError } from 'ow';
import { APIFY_API_BASE_URL } from '../constants';
import StorageManager from './storage_manager';
import log from '../utils_log';

/* eslint-disable no-unused-vars,import/named,import/no-duplicates,import/order */
// @ts-ignore
import * as ApifyClient from 'apify-client';
// @ts-ignore
import * as ApifyStorageLocal from '@apify/storage-local';
/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order */

/**
 * @typedef {(Object<string, *>|null|Buffer|string)} KeyValueStoreValueTypes
 */

/**
 * Helper function to possibly stringify value if options.contentType is not set.
 *
 * @ignore
 */
export const maybeStringify = (value, options) => {
    // If contentType is missing, value will be stringified to JSON
    if (options.contentType === null || options.contentType === undefined) {
        options.contentType = 'application/json; charset=utf-8';

        try {
            // Format JSON to simplify debugging, the overheads with compression is negligible
            value = jsonStringifyExtended(value, null, 2);
        } catch (e) {
            // Give more meaningful error message
            if (e.message && e.message.indexOf('Invalid string length') >= 0) {
                e.message = 'Object is too large';
            }
            throw new Error(`The "value" parameter cannot be stringified to JSON: ${e.message}`);
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
 * for saving screenshots, actor inputs and outputs, web pages, PDFs or to persist the state of crawlers.
 *
 * Do not instantiate this class directly, use the
 * {@link Apify#openKeyValueStore} function instead.
 *
 * Each actor run is associated with a default key-value store, which is created exclusively
 * for the run. By convention, the actor input and output are stored into the
 * default key-value store under the `INPUT` and `OUTPUT` key, respectively.
 * Typically, input and output are JSON files, although it can be any other format.
 * To access the default key-value store directly, you can use the
 * {@link Apify#getValue} and {@link Apify#setValue} convenience functions.
 *
 * To access the input, you can also use the {@link Apify#getInput} convenience function.
 *
 * `KeyValueStore` stores its data either on local disk or in the Apify cloud,
 * depending on whether the [`APIFY_LOCAL_STORAGE_DIR`](../guides/environment-variables#apify_local_storage_dir)
 * or [`APIFY_TOKEN`](../guides/environment-variables#apify_token) environment variables are set.
 *
 * If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the data is stored in
 * the local directory in the following files:
 * ```
 * {APIFY_LOCAL_STORAGE_DIR}/key_value_stores/{STORE_ID}/{INDEX}.{EXT}
 * ```
 * Note that `{STORE_ID}` is the name or ID of the key-value store. The default key-value store has ID: `default`,
 * unless you override it by setting the `APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable.
 * The `{KEY}` is the key of the record and `{EXT}` corresponds to the MIME content type of the data value.
 *
 * If the [`APIFY_TOKEN`](../guides/environment-variables#apify_token) environment variable is set but
 * [`APIFY_LOCAL_STORAGE_DIR`](../guides/environment-variables#apify_local_storage_dir) not,
 * the data is stored in the [Apify Key-value store](https://docs.apify.com/storage/key-value-store)
 * cloud storage. Note that you can force usage of the cloud storage also by passing the `forceCloud`
 * option to {@link Apify#openKeyValueStore} function, even if the
 * [`APIFY_LOCAL_STORAGE_DIR`](../guides/environment-variables#apify_local_storage_dir) variable is set.
 *
 * **Example usage:**
 *
 * ```javascript
 * // Get actor input from the default key-value store.
 * const input = await Apify.getInput();
 * // Get some value from the default key-value store.
 * const otherValue = await Apify.getValue('my-key');
 *
 * // Write actor output to the default key-value store.
 * await Apify.setValue('OUTPUT', { myResult: 123 });
 *
 * // Open a named key-value store
 * const store = await Apify.openKeyValueStore('some-name');
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
 * @hideconstructor
 */
export class KeyValueStore {
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
        this.client = options.client.keyValueStore(this.id);
        this.log = log.child({ prefix: 'KeyValueStore' });
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
     * {@link KeyValueStore#setValue} function.
     *
     * **Example usage:**
     *
     * ```javascript
     * const store = await Apify.openKeyValueStore();
     * const buffer = await store.getValue('screenshot1.png');
     * ```
     * @param {string} key
     *   Unique key of the record. It can be at most 256 characters long and only consist
     *   of the following characters: `a`-`z`, `A`-`Z`, `0`-`9` and `!-_.'()`
     * @returns {Promise<KeyValueStoreValueTypes>}
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record.
     */
    async getValue(key) {
        ow(key, ow.string.nonEmpty);

        // TODO: Perhaps we should add options.contentType or options.asBuffer/asString
        // to enforce the representation of value
        const record = await this.client.getRecord(key);

        return record ? record.value : null;
    }

    /**
     * Saves or deletes a record in the key-value store.
     * The function returns a promise that resolves once the record has been saved or deleted.
     *
     * **Example usage:**
     *
     * ```javascript
     * const store = await Apify.openKeyValueStore();
     * await store.setValue('OUTPUT', { foo: 'bar' });
     * ```
     *
     * Beware that the key can be at most 256 characters long and only contain the following characters: `a-zA-Z0-9!-_.'()`
     *
     * By default, `value` is converted to JSON and stored with the
     * `application/json; charset=utf-8` MIME content type.
     * To store the value with another content type, pass it in the options as follows:
     * ```javascript
     * const store = await Apify.openKeyValueStore('my-text-store');
     * await store.setValue('RESULTS', 'my text data', { contentType: 'text/plain' });
     * ```
     * If you set custom content type, `value` must be either a string or
     * [`Buffer`](https://nodejs.org/api/buffer.html), otherwise an error will be thrown.
     *
     * If `value` is `null`, the record is deleted instead. Note that the `setValue()` function succeeds
     * regardless whether the record existed or not.
     *
     * To retrieve a value from the key-value store, use the
     * {@link KeyValueStore#getValue} function.
     *
     * **IMPORTANT:** Always make sure to use the `await` keyword when calling `setValue()`,
     * otherwise the actor process might finish before the value is stored!
     *
     * @param {string} key
     *   Unique key of the record. It can be at most 256 characters long and only consist
     *   of the following characters: `a`-`z`, `A`-`Z`, `0`-`9` and `!-_.'()`
     * @param {KeyValueStoreValueTypes} value
     *   Record data, which can be one of the following values:
     *    - If `null`, the record in the key-value store is deleted.
     *    - If no `options.contentType` is specified, `value` can be any JavaScript object and it will be stringified to JSON.
     *    - If `options.contentType` is set, `value` is taken as is and it must be a `String` or [`Buffer`](https://nodejs.org/api/buffer.html).
     *   For any other value an error will be thrown.
     * @param {object} [options]
     * @param {string} [options.contentType]
     *   Specifies a custom MIME content type of the record.
     * @returns {Promise<void>}
     *
     */
    setValue(key, value, options = {}) {
        ow(key, ow.string.nonEmpty);
        ow(key, ow.string.validate((k) => ({
            validator: ow.isValid(k, ow.string.matches(KEY_VALUE_STORE_KEY_REGEX)),
            message: 'The "key" argument must be at most 256 characters long and only contain the following characters: a-zA-Z0-9!-_.\'()',
        })));
        if (options.contentType && !ow.isValid(value, ow.any(ow.string, ow.buffer))) {
            throw new ArgumentError('The "value" parameter must be a String or Buffer when "options.contentType" is specified.', this.setValue);
        }
        ow(options, ow.object.exactShape({
            contentType: ow.optional.string.nonEmpty,
        }));

        // Make copy of options, don't update what user passed.
        const optionsCopy = { ...options };

        // In this case delete the record.
        if (value === null) return this.client.deleteRecord(key);

        // TODO the function mutates optionsCopy, but is also used in actor.js
        // Remove the mutation when actor.js usages are removed.
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
     *
     * @return {Promise<void>}
     */
    async drop() {
        await this.client.delete();
        const manager = new StorageManager(KeyValueStore);
        manager.closeStorage(this);
    }

    /**
     * Returns a URL for the given key that may be used to publicly
     * access the value in the remote key-value store.
     *
     * @param {string} key
     * @return {string}
     */
    getPublicUrl(key) {
        return `${APIFY_API_BASE_URL}/key-value-stores/${this.id}/records/${key}`;
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
     * const keyValueStore = await Apify.openKeyValueStore();
     * await keyValueStore.forEachKey(async (key, index, info) => {
     *   console.log(`Key at ${index}: ${key} has size ${info.size}`);
     * });
     * ```
     *
     * @param {KeyConsumer} iteratee A function that is called for every key in the key-value store.
     * @param {object} [options] All `forEachKey()` parameters are passed
     *   via an options object with the following keys:
     * @param {string} [options.exclusiveStartKey] All keys up to this one (including) are skipped from the result.
     * @return {Promise<void>}
     */
    async forEachKey(iteratee, options = {}, index = 0) {
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
            ? this.forEachKey(iteratee, { exclusiveStartKey: nextExclusiveStartKey }, index)
            : undefined; // [].forEach() returns undefined.
    }
}

/**
 * Opens a key-value store and returns a promise resolving to an instance of the {@link KeyValueStore} class.
 *
 * Key-value stores are used to store records or files, along with their MIME content type.
 * The records are stored and retrieved using a unique key.
 * The actual data is stored either on a local filesystem or in the Apify cloud.
 *
 * For more details and code examples, see the {@link KeyValueStore} class.
 *
 * @param {string} [storeIdOrName]
 *   ID or name of the key-value store to be opened. If `null` or `undefined`,
 *   the function returns the default key-value store associated with the actor run.
 * @param {object} [options]
 * @param {boolean} [options.forceCloud=false]
 *   If set to `true` then the function uses cloud storage usage even if the `APIFY_LOCAL_STORAGE_DIR`
 *   environment variable is set. This way it is possible to combine local and cloud storage.
 * @returns {Promise<KeyValueStore>}
 * @memberof module:Apify
 * @name openKeyValueStore
 * @function
 */
export const openKeyValueStore = async (storeIdOrName, options = {}) => {
    ow(storeIdOrName, ow.optional.string);
    ow(options, ow.object.exactShape({
        forceCloud: ow.optional.boolean,
    }));

    const manager = new StorageManager(KeyValueStore);
    return manager.openStorage(storeIdOrName, options);
};

/**
 * Gets a value from the default {@link KeyValueStore} associated with the current actor run.
 *
 * This is just a convenient shortcut for {@link KeyValueStore#getValue}.
 * For example, calling the following code:
 * ```javascript
 * const value = await Apify.getValue('my-key');
 * ```
 *
 * is equivalent to:
 * ```javascript
 * const store = await Apify.openKeyValueStore();
 * const value = await store.getValue('my-key');
 * ```
 *
 * To store the value to the default key-value store, you can use the {@link Apify#setValue} function.
 *
 * For more information, see  {@link Apify#openKeyValueStore}
 * and  {@link KeyValueStore#getValue}.
 *
 * @param {string} key
 *   Unique record key.
 * @returns {Promise<Object<string, *>|string|Buffer|null>}
 *   Returns a promise that resolves to an object, string
 *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
 *   on the MIME content type of the record, or `null`
 *   if the record is missing.
 * @memberof module:Apify
 * @name getValue
 * @function
 */
export const getValue = async (key) => {
    const store = await openKeyValueStore();

    return store.getValue(key);
};

/**
 * Stores or deletes a value in the default {@link KeyValueStore} associated with the current actor run.
 *
 * This is just a convenient shortcut for  {@link KeyValueStore#setValue}.
 * For example, calling the following code:
 * ```javascript
 * await Apify.setValue('OUTPUT', { foo: "bar" });
 * ```
 *
 * is equivalent to:
 * ```javascript
 * const store = await Apify.openKeyValueStore();
 * await store.setValue('OUTPUT', { foo: "bar" });
 * ```
 *
 * To get a value from the default key-value store, you can use the  {@link Apify#getValue} function.
 *
 * For more information, see  {@link Apify#openKeyValueStore}
 * and  {@link KeyValueStore#getValue}.
 *
 * @param {string} key
 *   Unique record key.
 * @param {*} value
 *   Record data, which can be one of the following values:
 *    - If `null`, the record in the key-value store is deleted.
 *    - If no `options.contentType` is specified, `value` can be any JavaScript object and it will be stringified to JSON.
 *    - If `options.contentType` is set, `value` is taken as is and it must be a `String` or [`Buffer`](https://nodejs.org/api/buffer.html).
 *   For any other value an error will be thrown.
 * @param {object} [options]
 * @param {string} [options.contentType]
 *   Specifies a custom MIME content type of the record.
 * @return {Promise<void>}
 * @memberof module:Apify
 * @name setValue
 * @function
 */
export const setValue = async (key, value, options) => {
    const store = await openKeyValueStore();

    return store.setValue(key, value, options);
};

/**
 * Gets the actor input value from the default {@link KeyValueStore} associated with the current actor run.
 *
 * This is just a convenient shortcut for [`keyValueStore.getValue('INPUT')`](key-value-store#getvalue).
 * For example, calling the following code:
 * ```javascript
 * const input = await Apify.getInput();
 * ```
 *
 * is equivalent to:
 * ```javascript
 * const store = await Apify.openKeyValueStore();
 * await store.getValue('INPUT');
 * ```
 *
 * Note that the `getInput()` function does not cache the value read from the key-value store.
 * If you need to use the input multiple times in your actor,
 * it is far more efficient to read it once and store it locally.
 *
 * For more information, see  {@link Apify#openKeyValueStore}
 * and {@link KeyValueStore#getValue}.
 *
 * @returns {Promise<Object<string, *>|string|Buffer|null>}
 *   Returns a promise that resolves to an object, string
 *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
 *   on the MIME content type of the record, or `null`
 *   if the record is missing.
 * @memberof module:Apify
 * @name getInput
 * @function
 */
export const getInput = async () => getValue(process.env[ENV_VARS.INPUT_KEY] || KEY_VALUE_STORE_KEYS.INPUT);

/**
 * User-function used in the  {@link KeyValueStore#forEachKey} method.
 * @callback KeyConsumer
 * @param {string} key
 *   Current {KeyValue} key being processed.
 * @param {number} index
 *   Position of the current key in {@link KeyValueStore}.
 * @param {*} info
 *   Information about the current {@link KeyValueStore} entry.
 * @param {number} info.size
 *   Size of the value associated with the current key in bytes.
 */
