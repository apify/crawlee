import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import Promise from 'bluebird';
import contentTypeParser from 'content-type';
import LruCache from 'apify-shared/lru_cache';
import mime from 'mime';
import { KEY_VALUE_STORE_KEY_REGEX } from 'apify-shared/regexs';
import { checkParamOrThrow, parseBody } from 'apify-client/build/utils';
import { ENV_VARS, LOCAL_EMULATION_SUBDIRS } from './constants';
import { addCharsetToContentType, apifyClient, ensureDirExists } from './utils';

export const LOCAL_EMULATION_SUBDIR = LOCAL_EMULATION_SUBDIRS.keyValueStores;
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
        throw new Error('The "key" parameter may contain only the following characters: ' +
            "[a-zA-Z0-9!-_.'()");
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
 * The `KeyValueStore` class provides a simple interface to the [Apify Key-value stores](https://www.apify.com/docs/storage#kv-store).
 * You should not instantiate this class directly, use the
 * [Apify.openKeyValueStore()](#module-Apify-openKeyValueStore) function.
 *
 * Example usage:
 *
 * ```javascript
 * // Opens default key-value store of the run.
 * const store = await Apify.openKeyValueStore();
 *
 * // Opens key-value store called 'some-name', belonging to the current Apify user account.
 * const storeWithName = await Apify.openKeyValueStore('some-name');
 *
 * // Write and read data record
 * await store.setValue('some-key', { foo: 'bar' });
 * const value = store.getValue('some-key');
 * ```
 *
 * @param {String} storeId - ID of the key-value store.
 */
export class KeyValueStore {
    constructor(storeId) {
        checkParamOrThrow(storeId, 'storeId', 'String');

        this.storeId = storeId;
    }

    // TODO: Move here the Apify.getValue()/setValue() documentation, and link it from there.
    // This place should be the main source of information.

    /**
     * Gets a record from the current key-value store using its key.
     * For more details, see [Apify.getValue](#module-Apify-getValue).
     *
     * @param  {String}  key Record key.
     * @return {Promise}
     */
    getValue(key) {
        validateGetValueParams(key);

        return keyValueStores
            .getRecord({ storeId: this.storeId, key })
            .then(output => (output ? output.body : null));
    }

    /**
     * Stores a record to the key-value stores.
     * The function has no result, but throws on invalid arguments or other errors.
     *
     * @param  {String} key Record key.
     * @param  {Object|String|Buffer} value Record value. If content type is not provided then the value is stringified to JSON.
     * @param  {Object} [Options]
     * @param  {Object} [Options.contentType] Content type of the record.
     * @return {Promise}
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
     * Deletes the store.
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
            });
    }
}

/**
 * Helper to create a file-matching RegExp from a KeyValueStore key.
 * @param key
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
    constructor(storeId, localEmulationDir) {
        checkParamOrThrow(storeId, 'storeId', 'String');
        checkParamOrThrow(localEmulationDir, 'localEmulationDir', 'String');

        this.localEmulationPath = path.resolve(path.join(localEmulationDir, LOCAL_EMULATION_SUBDIR, storeId));
        this.storeId = storeId;
        this.initializationPromise = ensureDirExists(this.localEmulationPath);
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
                throw new Error(`Error reading file '${key}' in directory '${this.localEmulationPath}' referred by ${ENV_VARS.APIFY_LOCAL_EMULATION_DIR} environment variable: ${err.message}`); // eslint-disable-line max-len
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
                throw new Error(`Error writing file '${key}' in directory '${this.localEmulationPath}' referred by ${ENV_VARS.APIFY_LOCAL_EMULATION_DIR} environment variable: ${err.message}`); // eslint-disable-line max-len
            });
    }

    delete() {
        return emptyDirPromised(this.localEmulationPath)
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
        return readdirPromised(this.localEmulationPath)
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
        return path.resolve(this.localEmulationPath, fileName);
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
 * Opens a key-value store and returns a promise resolving to an instance
 * of the [KeyValueStore](#KeyValueStore) class.
 *
 * Key-value store is a simple storage for records, where each record has a unique key.
 * For more information, see [Key-value store documentation](https://www.apify.com/docs/storage#dataset).
 *
 * Example usage:
 *
 * ```javascript
 * const store = await Apify.openKeyValueStore('my-store-id');
 * await store.setValue('some-key', { foo: 'bar' });
 * ```
 *
 * If the `APIFY_LOCAL_EMULATION_DIR` environment variable is set, the result of this function
 * is an instance of the `KeyValueStoreLocal` class which stores the records in a local directory
 * rather than Apify cloud. This is useful for local development and debugging of your actors.
 *
 * @param {string} storeIdOrName ID or name of the key-value store to be opened. If no value is
 *                               provided then the function opens the default key-value store associated with the actor run.
 * @returns {Promise<KeyValueStore>} Returns a promise that resolves to a KeyValueStore object.
 *
 * @memberof module:Apify
 * @name openKeyValueStore
 * @instance
 * @function
 */
export const openKeyValueStore = (storeIdOrName) => {
    checkParamOrThrow(storeIdOrName, 'storeIdOrName', 'Maybe String');

    const localEmulationDir = process.env[ENV_VARS.LOCAL_EMULATION_DIR];

    let isDefault = false;
    let storePromise;

    if (!storeIdOrName) {
        const envVar = ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID;

        // Env var doesn't exist.
        if (!process.env[envVar]) return Promise.reject(new Error(`The '${envVar}' environment variable is not defined.`));

        isDefault = true;
        storeIdOrName = process.env[envVar];
    }

    storePromise = storesCache.get(storeIdOrName);

    // Found in cache.
    if (storePromise) return storePromise;

    // Use local emulation?
    if (localEmulationDir) {
        storePromise = Promise.resolve(new KeyValueStoreLocal(storeIdOrName, localEmulationDir));
    } else {
        storePromise = isDefault // If true then we know that this is an ID of existing store.
            ? Promise.resolve(new KeyValueStore(storeIdOrName))
            : getOrCreateKeyValueStore(storeIdOrName).then(store => (new KeyValueStore(store.id)));
    }

    storesCache.add(storeIdOrName, storePromise);

    return storePromise;
};

/**
 * Gets a value from the default key-value store for the current actor run using the Apify API.
 * The key-value store is created automatically for each actor run
 * and its ID is passed by the Actor platform in the `APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable.
 * It is used to store input and output of the actor under keys named `INPUT` and `OUTPUT`, respectively.
 * However, the store can be used for storage of any other values under arbitrary keys.
 *
 * Example usage:
 *
 * ```javascript
 * const input = await Apify.getValue('INPUT');
 *
 * console.log('My input:');
 * console.dir(input);
 * ```
 *
 * The result of the function is the body of the record. Bodies with the `application/json`
 * content type are automatically parsed to an object.
 * Similarly, for `text/plain` content types the body is parsed as `String`.
 * For all other content types, the body is a raw `Buffer`.
 * If the record cannot be found, the result is null.
 *
 * If the `APIFY_LOCAL_EMULATION_DIR` environment variable is defined,
 * the value is read from a that directory rather than the key-value store,
 * specifically from a file that has the key as a name.
 * file does not exists, the returned value is `null`. The file will get extension based on it's content type.
 * This feature is useful for local development and debugging of your actors.
 *
 *
 * @param {String} key Key of the record.
 * @returns {Promise} Returns a promise.
 *
 * @memberof module:Apify
 * @name getValue
 * @instance
 * @function
 */
export const getValue = key => openKeyValueStore().then(store => store.getValue(key));

/**
 * Stores a value in the default key-value store for the current actor run using the Apify API.
 * The data is stored in the key-value store created specifically for the actor run,
 * whose ID is defined in the `APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable.
 * The function has no result, but throws on invalid args or other errors.
 *
 * ```javascript
 * await Apify.setValue('OUTPUT', { someValue: 123 });
 * ```
 *
 * By default, `value` is converted to JSON and stored with the `application/json; charset=utf-8` content type.
 * To store a value with another content type, pass it in the options as follows:
 * ```javascript
 * await Apify.setValue('OUTPUT', 'my text data', { contentType: 'text/plain' });
 * ```
 * In this case, the value must be a string or Buffer.
 *
 * If the `APIFY_LOCAL_EMULATION_DIR` environment variable is defined,
 * the value is written to that local directory rather than the key-value store on Apify cloud,
 * to a file named as the key. This is useful for local development and debugging of your actors.
 *
 * **IMPORTANT:** Do not forget to use the `await` keyword when calling `Apify.setValue()`,
 * otherwise the actor process might finish before the value is stored!
 *
 * @param key Key of the record
 * @param value Value of the record:
 *        <ul>
 *         <li>If `null`, the record in the key-value store is deleted.</li>
 *         <li>If no `options.contentType` is specified, `value` can be any object and it will be stringified to JSON.</li>
 *         <li>If `options.contentType` is specified, `value` is considered raw data and it must be a String or Buffer.</li>
 *        </ul>
 *        For any other value an error will be thrown.
 *
 * @param {Object} [options]
 * @param {String} [options.contentType] - Sets the MIME content type of the value.
 * @returns {Promise} Returns a promise that resolves to the value.
 *
 * @memberof module:Apify
 * @name setValue
 * @instance
 * @function
 */
export const setValue = (key, value, options) => openKeyValueStore().then(store => store.setValue(key, value, options));
