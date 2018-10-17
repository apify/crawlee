import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import Promise from 'bluebird';
import contentTypeParser from 'content-type';
import LruCache from 'apify-shared/lru_cache';
import mime from 'mime';
import { KEY_VALUE_STORE_KEY_REGEX } from 'apify-shared/regexs';
import { ENV_VARS, LOCAL_STORAGE_SUBDIRS } from 'apify-shared/consts';
import { checkParamOrThrow, parseBody } from 'apify-client/build/utils';
import {
    addCharsetToContentType, apifyClient, ensureDirExists, openRemoteStorage, openLocalStorage, ensureTokenOrLocalStorageEnvExists,
} from './utils';

export const LOCAL_STORAGE_SUBDIR = LOCAL_STORAGE_SUBDIRS.keyValueStores;
const MAX_OPENED_STORES = 1000;
const DEFAULT_LOCAL_FILE_EXTENSION = 'bin';
const COMMON_LOCAL_FILE_EXTENSIONS = ['bin', 'txt', 'json', 'html', 'xml', 'jpeg', 'png', 'pdf', 'mp3', 'js', 'css', 'csv'];

const readFilePromised = Promise.promisify(fs.readFile);
const readdirPromised = Promise.promisify(fs.readdir);
const writeFilePromised = Promise.promisify(fs.writeFile);
const unlinkPromised = Promise.promisify(fs.unlink);
const emptyDirPromised = Promise.promisify(fsExtra.emptyDir);

const { keyValueStores } = apifyClient;
const storesCache = new LruCache({ maxLength: MAX_OPENED_STORES }); // Open key-value stores are stored here.

/**
 * Helper function to validate params of *.getValue().
 *
 * @ignore
 */
const validateGetValueParams = (key) => {
    checkParamOrThrow(key, 'key', 'String');
    if (!key) throw new Error('The "key" parameter cannot be empty');
};

/**
 * Helper function to validate params of *.setValue().
 *
 * @ignore
 */
const validateSetValueParams = (key, value, options) => {
    checkParamOrThrow(key, 'key', 'String');
    checkParamOrThrow(options, 'options', 'Object');
    checkParamOrThrow(options.contentType, 'options.contentType', 'String | Null | Undefined');

    if (value === null && options.contentType !== null && options.contentType !== undefined) {
        throw new Error('The "options.contentType" parameter must not be used when removing the record.');
    }

    if (options.contentType) {
        checkParamOrThrow(value, 'value', 'Buffer | String', 'The "value" parameter must be a String or Buffer when "options.contentType" is specified.'); // eslint-disable-line max-len
    }

    if (options.contentType === '') throw new Error('Parameter options.contentType cannot be empty string.');
    if (!key) throw new Error('The "key" parameter cannot be empty');

    if (!KEY_VALUE_STORE_KEY_REGEX.test(key)) {
        throw new Error('The "key" parameter may contain only the following characters: '
            + "[a-zA-Z0-9!-_.'()");
    }
};

/**
 * Helper function to possibly stringify value if options.contentType is not set.
 *
 * @ignore
 */
export const maybeStringify = (value, options) => {
    // If contentType is missing, value will be stringified to JSON
    if (options.contentType === null || options.contentType === undefined) {
        options.contentType = 'application/json';

        try {
            // Format JSON to simplify debugging, the overheads with compression is negligible
            value = JSON.stringify(value, null, 2);
        } catch (e) {
            // Give more meaningful error message
            if (e.message && e.message.indexOf('Invalid string length') >= 0) {
                e.message = 'Object is too large';
            }
            throw new Error(`The "value" parameter cannot be stringified to JSON: ${e.message}`);
        }

        if (value === undefined) {
            throw new Error('The "value" parameter cannot be stringified to JSON.');
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
 * [`Apify.openKeyValueStore()`](apify#module_Apify.openKeyValueStore) function instead.
 *
 * Each actor run is associated with a default key-value store, which is created exclusively
 * for the run. By convention, the actor input and output are stored into the
 * default key-value store under the `INPUT` and `OUTPUT` key, respectively.
 * Typically, input and output are JSON files, although it can be any other format.
 * To access the default key-value store directly, you can use the
 * [`Apify.getValue()`](apify#module_Apify.getValue)
 * and [`Apify.setValue()`](apify#module_Apify.setValue) convenience functions.
 *
 * `KeyValueStore` stores its data either on local disk or in the Apify cloud,
 * depending on whether the `APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN` environment variables are set.
 *
 * If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the data is stored in
 * the local directory in the following files:
 * ```
 * {APIFY_LOCAL_STORAGE_DIR}/key_value_stores/{STORE_ID}/{INDEX}.{EXT}
 * ```
 * Note that `{STORE_ID}` is the name or ID of the key-value store. The default key value store has ID: `default`,
 * unless you override it by setting the `APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable.
 * The `{KEY}` is the key of the record and `{EXT}` corresponds to the MIME content type of the data value.
 *
 * If the `APIFY_TOKEN` environment variable is provided instead, the data is stored in the
 * <a href="https://www.apify.com/docs/storage#key-value-store" target="_blank">Apify Key-Value Store</a>
 * cloud storage.
 *
 * **Example usage:**
 *
 * ```javascript
 * // Get actor input from the default key-value store
 * const input = await Apify.getValue('INPUT');
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
 *  // Delete record
 * await store.delete('some-key');
 * ```
 * @hideconstructor
 */
export class KeyValueStore {
    constructor(storeId, storeName) {
        checkParamOrThrow(storeId, 'storeId', 'String');
        checkParamOrThrow(storeName, 'storeName', 'Maybe String');

        this.storeId = storeId;
        this.storeName = storeName;
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
     * <a href="https://nodejs.org/api/buffer.html" target="_blank"><code>Buffer</code></a> instance.
     *
     * If the record does not exist, the function resolves to `null`.
     *
     * To save or delete a value in the key-value store, use the
     * {@link KeyValueStore#setValue} function.
     *
     * **Example usage:**
     *
     * ```javascript
     * const store = await Apify.openKeyValueStore('my-screenshots');
     * const buffer = await store.getValue('screenshot1.png');
     * ```
     *
     * @param {String} key
     *   Unique key of the record.
     * @returns {Promise<Object|String|Buffer>}
     *   Returns a promise that resolves to an object, string
     *   or <a href="https://nodejs.org/api/buffer.html" target="_blank"><code>Buffer</code></a>, depending
     *   on the MIME content type of the record.
     */
    getValue(key) {
        validateGetValueParams(key);

        // TODO: Perhaps we should add options.contentType or options.asBuffer/asString
        // to enforce the representation of value

        return keyValueStores
            .getRecord({ storeId: this.storeId, key })
            .then(output => (output ? output.body : null));
    }

    /**
     * Saves or deletes a record in the key-value store.
     * The function returns a promise that resolves once the record has been saved or deleted.
     *
     * **Example usage:**
     *
     * ```javascript
     * const store = await Apify.openKeyValueStore('my-store');
     * await store.setValue('RESULTS', 'my text data', { contentType: 'text/plain' });
     * ```
     *
     * By default, `value` is converted to JSON and stored with the
     * `application/json; charset=utf-8` MIME content type.
     * To store the value with another content type, pass it in the options as follows:
     * ```javascript
     * const store = await Apify.openKeyValueStore('my-store');
     * await store.setValue('RESULTS', 'my text data', { contentType: 'text/plain' });
     * ```
     * If you set custom content type, `value` must be either a string or
     * <a href="https://nodejs.org/api/buffer.html" target="_blank"><code>Buffer</code></a>, otherwise an error will be thrown.
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
     * @param {String} key
     *   Unique key of the record.
     * @param {Object|String|Buffer} value
     *   Record data, which can be one of the following values:
     *   <ul>
     *     <li>If `null`, the record in the key-value store is deleted.</li>
     *     <li>If no `options.contentType` is specified, `value` can be any JavaScript object and it will be stringified to JSON.</li>
     *     <li>If `options.contentType` is specified, `value` is considered raw data and it must be either a `String`
     *     or <a href="https://nodejs.org/api/buffer.html" target="_blank"><code>Buffer</code></a>.</li>
     *   </ul>
     *   For any other value an error will be thrown.
     * @param {Object} [options]
     * @param {String} [options.contentType]
     *   Specifies a custom MIME content type of the record.
     * @returns {Promise}
     *
     */
    setValue(key, value, options = {}) {
        validateSetValueParams(key, value, options);

        // Make copy of options, don't update what user passed.
        const optionsCopy = Object.assign({}, options);

        // In this case delete the record.
        if (value === null) return keyValueStores.deleteRecord({ storeId: this.storeId, key });

        value = maybeStringify(value, optionsCopy);

        // Keep this code in main scope so that simple errors are thrown rather than rejected promise.
        return keyValueStores.putRecord({
            storeId: this.storeId,
            key,
            body: value,
            contentType: addCharsetToContentType(optionsCopy.contentType),
        });
    }

    /**
     * Removes the key-value store either from the Apify cloud storage or from the local directory,
     * depending on the mode of operation.
     *
     * @return {Promise}
     */
    delete() {
        return keyValueStores
            .deleteStore({
                storeId: this.storeId,
            })
            .then(() => {
                storesCache.remove(this.storeId);
                if (this.storeName) storesCache.remove(this.storeName);
            });
    }
}

/**
 * Helper to create a file-matching RegExp from a KeyValueStore key.
 * @param {String} key
 * @returns {RegExp}
 * @ignore
 */
export const getFileNameRegexp = (key) => {
    const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${safeKey}\\.[a-z0-9]+$`);
};

/**
 * This is a local representation of a key-value store.
 *
 * @ignore
 */
export class KeyValueStoreLocal {
    constructor(storeId, localStorageDir) {
        checkParamOrThrow(storeId, 'storeId', 'String');
        checkParamOrThrow(localStorageDir, 'localStorageDir', 'String');

        this.localStoragePath = path.resolve(path.join(localStorageDir, LOCAL_STORAGE_SUBDIR, storeId));
        this.storeId = storeId;
        this.initializationPromise = ensureDirExists(this.localStoragePath);
    }

    getValue(key) {
        validateGetValueParams(key);

        return this.initializationPromise
            .then(() => this._handleFile(key, readFilePromised))
            .then((result) => {
                return result
                    ? parseBody(result.returnValue, mime.getType(result.fileName))
                    : null;
            })
            .catch((err) => {
                throw new Error(`Error reading file '${key}' in directory '${this.localStoragePath}' referred by ${ENV_VARS.LOCAL_STORAGE_DIR} environment variable: ${err.message}`); // eslint-disable-line max-len
            });
    }

    setValue(key, value, options = {}) {
        validateSetValueParams(key, value, options);

        // Make copy of options, don't update what user passed.
        const optionsCopy = Object.assign({}, options);

        const deletePromise = this._handleFile(key, unlinkPromised);

        // In this case delete the record.
        if (value === null) return deletePromise;

        value = maybeStringify(value, optionsCopy);

        const contentType = contentTypeParser.parse(optionsCopy.contentType).type;
        const extension = mime.getExtension(contentType) || DEFAULT_LOCAL_FILE_EXTENSION;
        const filePath = this._getPath(`${key}.${extension}`);

        return deletePromise
            .then(() => writeFilePromised(filePath, value))
            .catch((err) => {
                throw new Error(`Error writing file '${key}' in directory '${this.localStoragePath}' referred by ${ENV_VARS.LOCAL_STORAGE_DIR} environment variable: ${err.message}`); // eslint-disable-line max-len
            });
    }

    delete() {
        return emptyDirPromised(this.localStoragePath)
            .then(() => {
                storesCache.remove(this.storeId);
            });
    }

    /**
     * Helper function to handle files. Accepts a promisified 'fs' function as a second parameter
     * which will be executed against the file saved under the key. Since the file's extension and thus
     * full path is not known, it first performs a check against common extensions. If no file is found,
     * it will read a full list of files in the directory and attempt to find the file again.
     *
     * Returns an object when a file is found and handler executes successfully, null otherwise.
     *
     * @param {String} key
     * @param {Function} handler
     * @returns {Promise} null or object in the following format:
     * {
     *     returnValue: return value of the handler function,
     *     fileName: name of the file including found extension
     * }
     * @ignore
     */
    _handleFile(key, handler) {
        return Promise.map(COMMON_LOCAL_FILE_EXTENSIONS, (extension) => {
            const fileName = `${key}.${extension}`;
            const filePath = this._getPath(fileName);
            return handler(filePath)
                .then(returnValue => ({ returnValue, fileName }))
                .catch((err) => {
                    if (err.code === 'ENOENT') return null;
                    throw err;
                });
        })
            .then((results) => {
                // Using filter here to distinguish between no result and undefined result. [] vs [undefined]
                const result = results.filter(r => r && r.returnValue !== null);
                return result.length
                    ? result[0]
                    : this._fullDirectoryLookup(key, handler);
            });
    }

    /**
     * Performs a lookup for a file in the local emulation directory's file list.
     * @param {String} key
     * @param {Function} handler
     * @returns {Promise}
     * @ignore
     */
    _fullDirectoryLookup(key, handler) {
        return readdirPromised(this.localStoragePath)
            .then((files) => {
                const regex = getFileNameRegexp(key);
                const fileName = files.find(file => regex.test(file));
                return fileName
                    ? handler(this._getPath(fileName)).then(returnValue => ({ returnValue, fileName }))
                    : null;
            });
    }

    /**
     * Helper function to resolve file paths.
     * @param {String} fileName
     * @returns {String}
     * @ignore
     */
    _getPath(fileName) {
        return path.resolve(this.localStoragePath, fileName);
    }
}

/**
 * Helper function that first requests key-value store by ID and if store doesn't exist then gets it by name.
 *
 * @ignore
 */
const getOrCreateKeyValueStore = (storeIdOrName) => {
    return apifyClient
        .keyValueStores
        .getStore({ storeId: storeIdOrName })
        .then((existingStore) => {
            if (existingStore) return existingStore;

            return apifyClient
                .keyValueStores
                .getOrCreateStore({ storeName: storeIdOrName });
        });
};


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
 * @returns {Promise<KeyValueStore>}
 * @memberof module:Apify
 * @name openKeyValueStore
 * @function
 */
export const openKeyValueStore = (storeIdOrName) => {
    checkParamOrThrow(storeIdOrName, 'storeIdOrName', 'Maybe String');
    ensureTokenOrLocalStorageEnvExists('key value store');

    return process.env[ENV_VARS.LOCAL_STORAGE_DIR]
        ? openLocalStorage(storeIdOrName, ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID, KeyValueStoreLocal, storesCache)
        : openRemoteStorage(storeIdOrName, ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID, KeyValueStore, storesCache, getOrCreateKeyValueStore);
};

//

/**
 * Gets a value from the default {@link KeyValueStore} associated with the current actor run.
 *
 * This is just a convenient shortcut for [`keyValueStore.getValue()`](keyvaluestore#KeyValueStore+getValue).
 * For example, calling the following code:
 * ```javascript
 * const input = await Apify.getValue('INPUT');
 * ```
 *
 * is equivalent to:
 * ```javascript
 * const store = await Apify.openKeyValueStore();
 * await store.getValue('INPUT');
 * ```
 *
 * To store the value to the default-key value store, you can use the [`Apify.setValue()`](#module_Apify.setValue) function.
 *
 * For more information, see [`Apify.openKeyValueStore()`](#module_Apify.openKeyValueStore)
 * and [`keyValueStore.getValue()`](keyvaluestore#KeyValueStore+getValue).
 *
 * @param {String} key
 *   Unique record key.
 * @returns {Promise<Object>}
 *   Returns a promise that resolves once the record is stored.
 *
 * @memberof module:Apify
 * @name getValue
 * @function
 */
export const getValue = key => openKeyValueStore().then(store => store.getValue(key));


/**
 * Stores or deletes a value in the default {@link KeyValueStore} associated with the current actor run.
 *
 * This is just a convenient shortcut for [`keyValueStore.setValue()`](keyvaluestore#KeyValueStore+setValue).
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
 * To get a value from the default-key value store, you can use the [`Apify.getValue()`](#module_Apify.getValue) function.
 *
 * For more information, see [`Apify.openKeyValueStore()`](#module_Apify.openKeyValueStore)
 * and [`keyValueStore.getValue()`](keyvaluestore#KeyValueStore+getValue).
 *
 * @param {String} key
 *   Unique record key.
 * @param {Object|String|Buffer} value
 *   Record data, which can be one of the following values:
 *   <ul>
 *     <li>If `null`, the record in the key-value store is deleted.</li>
 *     <li>If no `options.contentType` is specified, `value` can be any JavaScript object and it will be stringified to JSON.</li>
 *     <li>If `options.contentType` is specified, `value` is considered raw data and it must be a `String`
 *     or <a href="https://nodejs.org/api/buffer.html" target="_blank"><code>Buffer</code></a>.</li>
 *   </ul>
 *   For any other value an error will be thrown.
 * @param {Object} [options]
 * @param {String} [options.contentType]
 *   Specifies a custom MIME content type of the record.
 * @return {Promise}
 * @memberof module:Apify
 * @name setValue
 * @function
 */
export const setValue = (key, value, options) => openKeyValueStore().then(store => store.setValue(key, value, options));
