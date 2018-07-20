import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import contentTypeParser from 'content-type';
import LruCache from 'apify-shared/lru_cache';
import { KEY_VALUE_STORE_KEY_REGEX } from 'apify-shared/regexs';
import { IKeyValueStore as IKeyValueStoreResponse } from 'apify-client';
import { checkParamOrThrow, parseBody } from 'apify-client/build/utils';
import { ENV_VARS, LOCAL_EMULATION_SUBDIRS } from './constants';
import { addCharsetToContentType, apifyClient, ensureDirExists } from './utils';

export const LOCAL_EMULATION_SUBDIR = LOCAL_EMULATION_SUBDIRS.keyValueStores;
const MAX_OPENED_STORES = 1000;

const LOCAL_FILE_TYPES = [
    { contentType: 'application/octet-stream', extension: 'buffer' },
    { contentType: 'application/json', extension: 'json' },
    { contentType: 'text/plain', extension: 'txt' },
    { contentType: 'image/jpeg', extension: 'jpg' },
    { contentType: 'image/png', extension: 'png' },
];
const DEFAULT_LOCAL_FILE_TYPE = LOCAL_FILE_TYPES[0];

const readFilePromised = promisify(fs.readFile);
const writeFilePromised = promisify(fs.writeFile);
const unlinkPromised = promisify(fs.unlink);
const emptyDirPromised = promisify(fsExtra.emptyDir);

const { keyValueStores } = apifyClient;
const storesCache = new LruCache({ maxLength: MAX_OPENED_STORES }); // Open key-value stores are stored here.

interface ISetValueOptions {
    contentType?: string
}

interface IKeyValueStore {
    setValue(key: string, value: any, options: ISetValueOptions): Promise<void>;
    getValue(key: string): Promise<any>;
    delete(key: string): Promise<void>;
}

/**
 * Helper function to validate params of *.getValue().
 *
 * @ignore
 */
const validateGetValueParams = (key: string): void => {
    checkParamOrThrow(key, 'key', 'String');
    if (!key) throw new Error('The "key" parameter cannot be empty');
};

/**
 * Helper function to validate params of *.setValue().
 *
 * @ignore
 */
const validateSetValueParams = (key: string, value: any, options?: ISetValueOptions): void => {
    checkParamOrThrow(key, 'key', 'String');
    checkParamOrThrow(options, 'options', 'Object');
    checkParamOrThrow(options.contentType, 'options.contentType', 'String | Null | Undefined');

    if (value === null && options.contentType != null) {
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
export const maybeStringify = (value: any, options: ISetValueOptions): any => {
    // If contentType is missing, value will be stringified to JSON
    if (options.contentType == null) {
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
export class KeyValueStore implements IKeyValueStore {

    constructor(public storeId: string) {}

    // TODO: Move here the Apify.getValue()/setValue() documentation, and link it from there.
    // This place should be the main source of information.

    /**
     * Gets a record from the current key-value store using its key.
     * For more details, see [Apify.getValue](#module-Apify-getValue).
     *
     * @param  {String}  key Record key.
     * @return {Promise}
     */
    async getValue(key: string): Promise<any> {
        validateGetValueParams(key);
        const output = await keyValueStores.getRecord({ storeId: this.storeId, key });
        return output ? output.body : null;
    }

    /**
     * Stores a record to the key-value stores.
     * The function has no result, but throws on invalid arguments or other errors.
     *
     * @param  {String} key Record key.
     * @param  {Object|String|Buffer} value Record value. If content type is not provided then the value is stringified to JSON.
     * @param  {Object} [options]
     * @param  {String} [options.contentType] Content type of the record.
     * @return {Promise}
     */
    async setValue(key: string, value: any, options: ISetValueOptions = {}): Promise<any> {
        validateSetValueParams(key, value, options);

        // Make copy of options, don't update what user passed.
        const optionsCopy = Object.assign({}, options);

        // In this case delete the record.
        if (value === null) return keyValueStores.deleteRecord({ storeId: this.storeId, key });

        value = maybeStringify(value, optionsCopy);

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
    async delete(): Promise<void> {
        await keyValueStores.deleteStore({ storeId: this.storeId });
        storesCache.remove(this.storeId);
    }
}

/**
 * This is a local representation of a key-value store.
 *
 * @ignore
 */
export class KeyValueStoreLocal implements IKeyValueStore {

    localEmulationPath: string;
    initializationPromise: Promise<void>;

    constructor(public storeId: string, localEmulationDir: string) {
        checkParamOrThrow(storeId, 'storeId', 'String');
        checkParamOrThrow(localEmulationDir, 'localEmulationDir', 'String');

        this.localEmulationPath = path.resolve(path.join(localEmulationDir, LOCAL_EMULATION_SUBDIR, storeId));
        this.initializationPromise = ensureDirExists(this.localEmulationPath);
    }

    async getValue(key: string): Promise<any> {
        validateGetValueParams(key);

        try {
            await this.initializationPromise;
            const filePath = path.resolve(this.localEmulationPath, key);

            // attempt to read the file using all available extensions
            const fileTypePromises = LOCAL_FILE_TYPES.map(async ({ extension }) => {
                try {
                    return await readFilePromised(`${filePath}.${extension}`)
                } catch (err) {
                    return null;
                }
            });

            const readFileAttempts = await Promise.all(fileTypePromises);

            let body = null;
            LOCAL_FILE_TYPES.some(({ contentType }, index) => {
                // find the valid extension and parse its body
                if (readFileAttempts[index] !== null) {
                    body = parseBody(readFileAttempts[index], contentType);
                    return true;
                }
            });

            return body;

        } catch (err) {
            throw new Error(`Error reading file '${key}' in directory '${this.localEmulationPath}' referred by ${ENV_VARS.APIFY_LOCAL_EMULATION_DIR} environment variable: ${err.message}`); // eslint-disable-line max-len
        }
    }

    async setValue(key: string, value: any, options: ISetValueOptions = {}): Promise<void> {
        validateSetValueParams(key, value, options);

        // Make copy of options, don't update what user passed.
        const optionsCopy = Object.assign({}, options);

        const deletePromisesArr = LOCAL_FILE_TYPES.map(async ({ extension }) => {
            const filePath = path.resolve(this.localEmulationPath, `${key}.${extension}`);
            try {
                await unlinkPromised(filePath)
            } catch (err) {
                if (err.code !== 'ENOENT') throw err;
            }
        });

        await Promise.all(deletePromisesArr);

        // In this case delete the record.
        if (value === null) return;

        value = maybeStringify(value, optionsCopy);

        const contentType = contentTypeParser.parse(optionsCopy.contentType).type;
        const { extension } = LOCAL_FILE_TYPES.filter(type => type.contentType === contentType).pop() || DEFAULT_LOCAL_FILE_TYPE;
        const filePath = path.resolve(this.localEmulationPath, `${key}.${extension}`);

        try {
            return await writeFilePromised(filePath, value)
        } catch (err) {
            throw new Error(`Error writing file '${key}' in directory '${this.localEmulationPath}' referred by ${ENV_VARS.APIFY_LOCAL_EMULATION_DIR} environment variable: ${err.message}`); // eslint-disable-line max-len
        }
    }

    async delete(): Promise<void> {
        await emptyDirPromised(this.localEmulationPath);
        storesCache.remove(this.storeId);
    }
}

/**
 * Helper function that first requests key-value store by ID and if store doesn't exist then gets it by name.
 *
 * @ignore
 */
const getOrCreateKeyValueStore = async (storeIdOrName: string): Promise<IKeyValueStoreResponse>  => {
    const existingStore = await apifyClient.keyValueStores.getStore({ storeId: storeIdOrName});
    if (existingStore) return existingStore;
    return apifyClient.keyValueStores.getOrCreateStore({ storeName: storeIdOrName });
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
 * rather than Apify cloud. This is useful for local development and debugging of your acts.
 *
 * @param {string} storeIdOrName ID or name of the key-value store to be opened. If no value is
 *                               provided then the function opens the default key-value store associated with the act run.
 * @returns {Promise<KeyValueStore>} Returns a promise that resolves to a KeyValueStore object.
 *
 * @memberof module:Apify
 * @name openKeyValueStore
 * @instance
 * @function
 */
export const openKeyValueStore = async (storeIdOrName?: string): Promise<IKeyValueStore> => {
    checkParamOrThrow(storeIdOrName, 'storeIdOrName', 'Maybe String');

    const localEmulationDir = process.env[ENV_VARS.LOCAL_EMULATION_DIR];

    let isDefault = false;
    let store: IKeyValueStore;

    if (!storeIdOrName) {
        const envVar = ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID;

        // Env var doesn't exist.
        if (!process.env[envVar]) throw new Error(`The '${envVar}' environment variable is not defined.`);

        isDefault = true;
        storeIdOrName = process.env[envVar];
    }

    store = await storesCache.get(storeIdOrName);

    // Found in cache.
    if (store) return store;

    // Use local emulation?
    if (localEmulationDir) {
        store = new KeyValueStoreLocal(storeIdOrName, localEmulationDir);
    } else {
        store = isDefault // If true then we know that this is an ID of existing store.
            ? new KeyValueStore(storeIdOrName)
            : new KeyValueStore((await getOrCreateKeyValueStore(storeIdOrName)).id);
    }

    storesCache.add(storeIdOrName, store);

    return store;
};

/**
 * Gets a value from the default key-value store for the current act run using the Apify API.
 * The key-value store is created automatically for each act run
 * and its ID is passed by the Actor platform in the `APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable.
 * It is used to store input and output of the act under keys named `INPUT` and `OUTPUT`, respectively.
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
 * This feature is useful for local development and debugging of your acts.
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
export const getValue = async (key: string): Promise<any> => (await openKeyValueStore()).getValue(key);

/**
 * Stores a value in the default key-value store for the current act run using the Apify API.
 * The data is stored in the key-value store created specifically for the act run,
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
 * to a file named as the key. This is useful for local development and debugging of your acts.
 *
 * **IMPORTANT:** Do not forget to use the `await` keyword when calling `Apify.setValue()`,
 * otherwise the act process might finish before the value is stored!
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
 * @returns {Promise} Returns a promise.
 *
 * @memberof module:Apify
 * @name setValue
 * @instance
 * @function
 */
export const setValue = async (key: string, value: any, options?: ISetValueOptions): Promise<void> => {
    const store = await openKeyValueStore();
    return store.setValue(key, value, options);
};
