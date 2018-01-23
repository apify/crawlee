import _ from 'underscore';
import { ENV_VARS } from './constants';
import {
    getPromisePrototype, newPromise, nodeifyPromise, addCharsetToContentType,
} from './utils';

export default class KeyValueStore {
    constructor(apifyClient, { id }) {
        this.storeId = id;
        this.apifyClient = apifyClient;
    }

    getValue(key, callback = null) {
        if (!key || !_.isString(key)) {
            throw new Error('Parameter "key" of type String must be provided');
        }
        const devDir = process.env[ENV_VARS.DEV_KEY_VALUE_STORE_DIR];
        const { storeId } = this;
        const { keyValueStores } = this.apifyClient;

        let promise;
        if (devDir) {
            const devContentType =
                process.env[ENV_VARS.DEV_KEY_VALUE_STORE_CONTENT_TYPE] ||
                'application/json; charset=utf-8';
            const contentType = contentTypeParser.parse(devContentType).type;
            const dirPath = path.resolve(devDir);
            let filePath;

            promise = newPromise()
                .then(() => {
                    return statPromised(dirPath)
                        .then((stats) => {
                            if (!stats.isDirectory()) {
                                throw new Error('The directory is not a directory');
                            }
                        })
                        .catch((err) => {
                            if (err.code === 'ENOENT') {
                                throw new Error('The directory does not exist');
                            }
                            throw err;
                        });
                })
                .then(() => {
                    filePath = path.resolve(dirPath, key);
                    return readFilePromised(filePath).catch((err) => {
                        if (err.code === 'ENOENT') return null;
                        throw err;
                    });
                })
                .then((data) => {
                    if (data !== null) {
                        if (contentType === 'application/json') {
                            try {
                                data = JSON.parse(data.toString('utf8'));
                            } catch (e) {
                                throw new Error(`File cannot be parsed as JSON: ${e.message}`);
                            }
                        } else if (contentType === 'text/plain') {
                            data = data.toString();
                        }
                    }
                    return data;
                })
                .catch(({ message }) => {
                    throw new Error(`Error reading file '${key}' in directory '${dirPath}' referred by ${ENV_VARS.DEV_KEY_VALUE_STORE_DIR} environment variable: ${message}`); // eslint-disable-line max-len
                });
        } else {
            const promisePrototype = getPromisePrototype();

            promise = newPromise().then(() => {
                return keyValueStores
                    .getRecord({
                        storeId,
                        promise: promisePrototype,
                        key,
                    })
                    .then(output => (output ? output.body : null));
            });
        }

        return nodeifyPromise(promise, callback);
    }

    setValue(key, value, options, callback = null) {
        if (!key || !_.isString(key)) {
            throw new Error('Parameter "key" of type String must be provided');
        }
        if (_.isFunction(options)) {
            callback = options;
            options = null;
        }

        if (typeof options !== 'object' && options !== undefined) {
            throw new Error('The "options" parameter must be an object, null or undefined.');
        }
        options = Object.assign({}, options);

        const promisePrototype = getPromisePrototype();

        const devDir = process.env[ENV_VARS.DEV_KEY_VALUE_STORE_DIR];
        let devDirPath;
        let devFilePath;
        if (devDir) {
            devDirPath = path.resolve(devDir);
            devFilePath = path.resolve(devDirPath, key);
        }

        const devErrorHandler = (err) => {
            throw new Error(`Error writing file '${key}' in directory '${devDirPath}' referred by ${ENV_VARS.DEV_KEY_VALUE_STORE_DIR} environment variable: ${err.message}`); // eslint-disable-line max-len
        };

        const { storeId } = this;
        const { keyValueStores } = this.apifyClient;

        let innerPromise;
        if (value !== null) {
            if (options.contentType === null || options.contentType === undefined) {
                options.contentType = 'application/json';
                try {
                    value = JSON.stringify(value, null, 2);
                } catch ({ message }) {
                    throw new Error(`The "value" parameter cannot be stringified to JSON: ${message}`);
                }
                if (value === undefined) {
                    throw new Error('The "value" parameter cannot be stringified to JSON.');
                }
            }

            if (!options.contentType || !_.isString(options.contentType)) {
                throw new Error('The "options.contentType" parameter must be a non-empty string, null or undefined.');
            }
            if (!_.isString(value) && !Buffer.isBuffer(value)) {
                throw new Error('The "value" parameter must be a String or Buffer when "contentType" is specified.');
            }

            if (devFilePath) {
                innerPromise = writeFilePromised(devFilePath, value).catch(devErrorHandler);
            } else {
                innerPromise = keyValueStores.putRecord({
                    storeId,
                    promise: promisePrototype,
                    key,
                    body: value,
                    contentType: addCharsetToContentType(options.contentType),
                });
            }
        } else {
            if (options.contentType !== null && options.contentType !== undefined) {
                throw new Error('The "options.contentType" parameter must not be used when removing the record.');
            }
            if (devFilePath) {
                innerPromise = unlinkPromised(devFilePath).catch(devErrorHandler);
            } else {
                innerPromise = keyValueStores.deleteRecord({
                    storeId,
                    promise: promisePrototype,
                    key,
                });
            }
        }

        const promise = newPromise().then(() => innerPromise);
        return nodeifyPromise(promise, callback);
    }
}
