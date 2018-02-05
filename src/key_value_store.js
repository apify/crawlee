import fs from 'fs';
import path from 'path';
import Promise from 'bluebird';
import contentTypeParser from 'content-type';
import { checkParamOrThrow, parseBody } from 'apify-client/build/utils';
import { ENV_VARS } from './constants';
import { addCharsetToContentType, apifyClient } from './utils';

const readFilePromised = Promise.promisify(fs.readFile);
const writeFilePromised = Promise.promisify(fs.writeFile);
const unlinkPromised = Promise.promisify(fs.unlink);
const statPromised = Promise.promisify(fs.stat);
// @TODO: We should use LruCache for this
const storesCache = {}; // Cache of opened store instances.
const { keyValueStores } = apifyClient;

const LOCAL_FILE_TYPES = [
    { contentType: 'application/octet-stream', extension: 'buffer' },
    { contentType: 'application/json', extension: 'json' },
    { contentType: 'text/plain', extension: 'txt' },
    { contentType: 'image/jpeg', extension: 'jpg' },
    { contentType: 'image/png', extension: 'png' },
];

const DEFAULT_LOCAL_FILE_TYPE = LOCAL_FILE_TYPES[0];

const validateGetValueParams = (key) => {
    checkParamOrThrow(key, 'key', 'String');
    if (!key) throw new Error('The "key" parameter cannot be empty');
};

const validateSetValueParams = (key, value, options) => {
    checkParamOrThrow(key, 'key', 'String');
    checkParamOrThrow(options, 'options', 'Object');
    checkParamOrThrow(options.contentType, 'options.contentType', 'String | Null | Undefined');

    // @TODO: when value is undefined, the function will throw "The "value" parameter cannot be stringified to JSON",
    // we could test for it here instead and throw better error

    if (value === null && options.contentType !== null && options.contentType !== undefined) {
        throw new Error('The "options.contentType" parameter must not be used when removing the record.');
    }

    if (options.contentType) {
        checkParamOrThrow(value, 'value', 'Buffer | String', 'The "value" parameter must be a String or Buffer when "options.contentType" is specified.'); // eslint-disable-line max-len
    }

    if (options.contentType === '') throw new Error('Parameter options.contentType cannot be empty string.');
    if (!key) throw new Error('The "key" parameter cannot be empty');
};

const maybeStringify = (value, options) => {
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

export class KeyValueStoreRemote {
    constructor(storeId) {
        checkParamOrThrow(storeId, 'storeId', 'String');

        this.storeId = storeId;
    }

    getValue(key) {
        validateGetValueParams(key);

        return keyValueStores
            .getRecord({ storeId: this.storeId, key })
            .then(output => (output ? output.body : null));
    }

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
}

export class KeyValueStoreLocal {
    constructor(storeId, localEmulationDir) {
        checkParamOrThrow(storeId, 'storeId', 'String');
        checkParamOrThrow(localEmulationDir, 'localEmulationDir', 'String');

        this.localEmulationPath = path.resolve(path.join(localEmulationDir, storeId));
        this.storeId = storeId;

        // @TODO: Sync is no good, we should put this init into getValue() / setValue(),
        //        it will also work even if the directory is removed during the run, which is better design anyway
        //        BTW it will be fast enough, because OS will cache filesystem's inodes.
        if (!fs.existsSync(this.localEmulationPath)) fs.mkdirSync(this.localEmulationPath);
    }

    getValue(key) {
        validateGetValueParams(key);

        return statPromised(this.localEmulationPath)
            .then((stats) => {
                if (!stats.isDirectory()) throw new Error('The directory is not a directory');
            })
            .catch((err) => {
                if (err.code === 'ENOENT') throw new Error('The directory does not exist');

                throw err;
            })
            .then(() => {
                const filePath = path.resolve(this.localEmulationPath, key);
                const promises = LOCAL_FILE_TYPES.map(({ extension }) => {
                    return readFilePromised(`${filePath}.${extension}`).catch(() => null);
                });

                return Promise.all(promises);
            })
            .then((files) => {
                let body = null;

                LOCAL_FILE_TYPES.some(({ contentType }, index) => {
                    if (files[index] !== null) {
                        body = parseBody(files[index], contentType);

                        return true;
                    }
                });

                return body;
            })
            .catch((err) => {
                throw new Error(`Error reading file '${key}' in directory '${this.localEmulationPath}' referred by ${ENV_VARS.APIFY_LOCAL_EMULATION_DIR} environment variable: ${err.message}`); // eslint-disable-line max-len
            });
    }

    setValue(key, value, options = {}) {
        validateSetValueParams(key, value, options);

        // Make copy of options, don't update what user passed.
        const optionsCopy = Object.assign({}, options);

        // In this case delete the record.
        if (value === null) {
            const promises = LOCAL_FILE_TYPES.map(({ extension }) => {
                const filePath = path.resolve(this.localEmulationPath, `${key}.${extension}`);

                return unlinkPromised(filePath);
            });

            return Promise.all(promises).catch(() => {});
        }

        value = maybeStringify(value, optionsCopy);

        const contentType = contentTypeParser.parse(optionsCopy.contentType).type;
        const { extension } = LOCAL_FILE_TYPES.filter(type => type.contentType === contentType).pop() || DEFAULT_LOCAL_FILE_TYPE;
        const filePath = path.resolve(this.localEmulationPath, `${key}.${extension}`);

        return writeFilePromised(filePath, value)
            .catch((err) => {
                throw new Error(`Error writing file '${key}' in directory '${this.localEmulationPath}' referred by ${ENV_VARS.APIFY_LOCAL_EMULATION_DIR} environment variable: ${err.message}`); // eslint-disable-line max-len
            });
    }
}

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
 * @memberof module:Apify
 * @function
 *
 * @TODO
 */
export const openKeyValueStore = (storeIdOrName) => {
    const localEmulationDir = process.env[ENV_VARS.LOCAL_EMULATION_DIR];

    checkParamOrThrow(storeIdOrName, 'storeIdOrName', 'Maybe String');

    // Use default key-value store.
    if (!storeIdOrName) {
        storeIdOrName = process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID];

        // Env vars doesn't exist.
        if (!storeIdOrName) {
            const error = new Error(`The '${ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID}' environment variable is not defined.`);

            return Promise.reject(error);
        }

        // It's not initialized yet.
        if (!storesCache[storeIdOrName]) {
            storesCache[storeIdOrName] = localEmulationDir
                ? Promise.resolve(new KeyValueStoreLocal(storeIdOrName, localEmulationDir))
                : Promise.resolve(new KeyValueStoreRemote(storeIdOrName));
        }
    }

    // Need to be initialized.
    if (!storesCache[storeIdOrName]) {
        storesCache[storeIdOrName] = localEmulationDir
            ? Promise.resolve(new KeyValueStoreLocal(storeIdOrName, localEmulationDir))
            : getOrCreateKeyValueStore(storeIdOrName).then(store => (new KeyValueStoreRemote(store.id)));
    }

    return storesCache[storeIdOrName];
};

// @TODO: Fix the docs - APIFY_DEV_KEY_VALUE_STORE_DIR is gone

/**
 * @memberof module:Apify
 * @function
 * @description <p>Gets a value from the default key-value store for the current act run using the Apify API.
 * The key-value store is created automatically for each act run
 * and its ID is passed by the Actor platform in the `APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable.
 * It is used to store input and output of the act under keys named `INPUT` and `OUTPUT`, respectively.
 * However, the store can be used for storage of any other values under arbitrary keys.
 * </p>
 * <p>Example usage</p>
 * <pre><code class="language-javascript">const input = await Apify.getValue('INPUT');
 *
 * console.log('My input:');
 * console.dir(input);
 * </code></pre>
 * <p>
 * The result of the function is the body of the record. Bodies with the `application/json`
 * content type are automatically parsed to an object.
 * Similarly, for `text/plain` content types the body is parsed as `String`.
 * For all other content types, the body is a raw `Buffer`.
 * If the record cannot be found, the result is null.
 * </p>
 * <p>
 * If the `APIFY_DEV_KEY_VALUE_STORE_DIR` environment variable is defined,
 * the value is read from a that directory rather than the key-value store,
 * specifically from a file that has the key as a name.
 * The directory must exist or an error is thrown. If the file does not exists, the returned value is `null`.
 * The file is assumed to have a content type specified in the `APIFY_DEV_KEY_VALUE_STORE_CONTENT_TYPE`
 * environment variable, or `application/json` if not set.
 * This feature is useful for local development and debugging of your acts.
 * </p>
 * @param {String} key Key of the record.
 * @returns {Promise} Returns a promise.
 */
export const getValue = key => openKeyValueStore().then(store => store.getValue(key));

/**
 * @memberof module:Apify
 * @function
 * @description <p>Stores a value in the default key-value store for the current act run using the Apify API.
 * The data is stored in the key-value store created specifically for the act run,
 * whose ID is defined in the `APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable.
 * The function has no result, but throws on invalid args or other errors.</p>
 * <pre><code class="language-javascript">await Apify.setValue('OUTPUT', { someValue: 123 });</code></pre>
 * <p>
 * By default, `value` is converted to JSON and stored with the `application/json; charset=utf-8` content type.
 * To store a value with another content type, pass it in the options as follows:
 * </p>
 * <pre><code class="language-javascript">await Apify.setValue('OUTPUT', 'my text data', { contentType: 'text/plain' });</code></pre>
 * <p>
 * In this case, the value must be a string or Buffer.
 * </p>
 * <p>
 * If the `APIFY_DEV_KEY_VALUE_STORE_DIR` environment variable is defined,
 * the value is written to that local directory rather than the key-value store on Apify cloud,
 * to a file named as the key. This is useful for local development and debugging of your acts.
 * </p>
 * <p>
 * **IMPORTANT: Do not forget to use the `await` keyword when calling `Apify.setValue()`,
 * otherwise the act process might finish before the value is stored!**
 * </p>
 * @param key Key of the record
 * @param value Value of the record:
 * <ul>
 *  <li>If `null`, the record in the key-value store is deleted.</li>
 *  <li>If no `options.contentType` is specified, `value` can be any object and it will be stringified to JSON.</li>
 *  <li>If `options.contentType` is specified, `value` is considered raw data and it must be a String or Buffer.</li>
 * </ul>
 * For any other value an error will be thrown.
 * @param {Object} [options]
 * @param {String} [options.contentType] - Sets the MIME content type of the value.
 * @returns {Promise} Returns a promise.
 */
export const setValue = (key, value, options) => openKeyValueStore().then(store => store.setValue(key, value, options));
