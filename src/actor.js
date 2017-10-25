import fs from 'fs';
import path from 'path';
import _ from 'underscore';
import contentTypeParser from 'content-type';
import Promise from 'bluebird';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { ENV_VARS, EXIT_CODES, ACT_TASK_TERMINAL_STATUSES } from './constants';
import { getPromisePrototype, newPromise, nodeifyPromise, newClient, addCharsetToContentType } from './utils';


/* global process, Buffer */

/**
 * @memberof module:Apify
 * @name client
 * @instance
 * @description A default instance of the `ApifyClient` class provided
 * by the {@link https://www.apify.com/docs/js/apify-client-js/latest|apify-client} NPM package.
 * This instance is used to access the Apify API
 * and its settings can be altered by calling the `Apify.client.setOptions()` function.
 * Be careful, by changing the settings you might alter behavior of functions such as
 * [Apify.getValue]{@linkcode getValue} or [Apify.setValue]{@linkcode setValue}.
 */
export const apifyClient = newClient();

const readFilePromised = Promise.promisify(fs.readFile);
const writeFilePromised = Promise.promisify(fs.writeFile);
const unlinkPromised = Promise.promisify(fs.unlink);
const statPromised = Promise.promisify(fs.stat);

/**
 * Tries to parse a string with date.
 * @param str Date string
 * @returns Returns either a Date object or undefined
 * @ignore
 */
const tryParseDate = (str) => {
    const unix = Date.parse(str);
    return unix > 0 ? new Date(unix) : undefined;
};

const getDefaultStoreIdOrThrow = () => {
    const storeId = process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID];
    if (!storeId) throw new Error(`The '${ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID}' environment variable is not defined.`);
    return storeId;
};


/**
 * @memberof module:Apify
 * @function
 * @description Gets a value from the default key-value store for the current act run.
 * This store is created automatically for this run
 * and its ID is passed by the Apify platform as the `APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable.
 * The result of the function is the body of the record. For records with the 'application/json'
 * content type, the body is the already parsed object
 * and for 'text/plain' content types it is parsed as String.
 * For other content types, the body is raw Buffer.
 * If the record cannot be found, the result is null.
 *
 * If the `APIFY_DEV_KEY_VALUE_STORE_DIR` environment variable is defined,
 * the value is read from a that directory rather than the key-value store,
 * from a file that has the key as a name.
 * The directory must exist or an error is thrown. The file might not exist, in which case the value is `null`.
 * The file is assumed to have a content type specified in the `APIFY_DEV_KEY_VALUE_STORE_CONTENT_TYPE`
 * environment variable, or `application/json` if not set.
 * This is useful for local development of the act.
 *
 * @param callback Optional callback.
 * @returns Returns a promise if no callback was provided, otherwise the return value is not defined.
 */
export const getValue = (key, callback = null) => {
    if (!key || !_.isString(key)) throw new Error('The "key" parameter must be a non-empty string');

    const devDir = process.env[ENV_VARS.DEV_KEY_VALUE_STORE_DIR];
    let promise;

    if (devDir) {
        // We're emulating KV store locally in a directory to simplify development
        const devContentType = process.env[ENV_VARS.DEV_KEY_VALUE_STORE_CONTENT_TYPE] || 'application/json; charset=utf-8';
        const contentType = contentTypeParser.parse(devContentType).type;
        const dirPath = path.resolve(devDir);
        let filePath;

        promise = newPromise()
            .then(() => {
                // Check that the directory is really a directory
                return statPromised(dirPath)
                    .then((stats) => {
                        if (!stats.isDirectory()) throw new Error('The directory is not a directory');
                    })
                    .catch((err) => {
                        if (err.code === 'ENOENT') throw new Error('The directory does not exist');
                        throw err;
                    });
            })
            .then(() => {
                // Read file
                filePath = path.resolve(dirPath, key);
                return readFilePromised(filePath)
                    .catch((err) => {
                        if (err.code === 'ENOENT') return null;
                        throw err;
                    });
            })
            .then((data) => {
                // Parse file according to the content type
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
            .catch((err) => {
                throw new Error(`Error reading file '${key}' in directory '${dirPath}' referred by ${ENV_VARS.DEV_KEY_VALUE_STORE_DIR} environment variable: ${err.message}`); // eslint-disable-line max-len
            });
    } else {
        const storeId = getDefaultStoreIdOrThrow();
        const promisePrototype = getPromisePrototype();

        promise = newPromise()
            .then(() => {
                return apifyClient
                    .keyValueStores
                    .getRecord({
                        storeId,
                        promise: promisePrototype,
                        key,
                    })
                    .then(output => (output ? output.body : null));
            });
    }

    return nodeifyPromise(promise, callback);
};

/**
 * @memberof module:Apify
 * @function
 * @description Stores a value in the default key-value store for the current act run.
 * This data is stored in the key-value store created specifically for this run,
 * whose ID is defined in the `APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable.
 * The function has no result, but throws on invalid args or other errors.
 *
 * If the `APIFY_DEV_KEY_VALUE_STORE_DIR` environment variable is defined,
 * the value is written to that directory rather than the key-value store,
 * to a file named as the key. This is useful for local development of the act.
 * @param value
 * If null, the record in the key-value store is deleted.
 * If no contentType is specified, the value can be any object and it will be stringified to JSON.
 * If contentType is specified, value is considered raw data and it must be a String or Buffer.
 * For any other value an error will be thrown.
 * @param options Optional settings, currently only \{ contentType: String \} is supported to set MIME content type of the value.
 * @param callback Optional callback.
 * @returns Returns a promise if no callback was provided, otherwise the return value is not defined.
 */
export const setValue = (key, value, options, callback = null) => {
    if (!key || !_.isString(key)) throw new Error('The "key" parameter must be a non-empty string');

    // contentType is optional
    if (_.isFunction(options)) {
        callback = options;
        options = null;
    }

    if (typeof (options) !== 'object' && options !== undefined) throw new Error('The "options" parameter must be an object, null or undefined.');
    // Make copy of options, don't update what user passed
    options = Object.assign({}, options);

    const promisePrototype = getPromisePrototype();

    let storeId = null;

    // Handle emulation of KV store locally in a directory to simplify development
    const devDir = process.env[ENV_VARS.DEV_KEY_VALUE_STORE_DIR];
    let devDirPath;
    let devFilePath;
    if (devDir) {
        // Get absolute paths
        devDirPath = path.resolve(devDir);
        devFilePath = path.resolve(devDirPath, key);
    } else {
        // This would throw if APIFY_DEFAULT_KEY_VALUE_STORE_ID env var was not set
        storeId = getDefaultStoreIdOrThrow();
    }
    const devErrorHandler = (err) => {
        throw new Error(`Error writing file '${key}' in directory '${devDirPath}' referred by ${ENV_VARS.DEV_KEY_VALUE_STORE_DIR} environment variable: ${err.message}`); // eslint-disable-line max-len
    };

    let innerPromise;

    if (value !== null) {
        // Normal case: put record to store
        // If contentType is missing, value will be stringified to JSON
        if (options.contentType === null || options.contentType === undefined) {
            options.contentType = 'application/json';
            try {
                // Format JSON to simplify debugging, the overheads with compression is negligible
                value = JSON.stringify(value, null, 2);
            } catch (e) {
                throw new Error(`The "value" parameter cannot be stringified to JSON: ${e.message}`);
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
            innerPromise = writeFilePromised(devFilePath, value)
                .catch(devErrorHandler);
        } else {
            // Keep this code in main scope so that simple errors are thrown rather than rejected promise.
            innerPromise = apifyClient.keyValueStores.putRecord({
                storeId,
                promise: promisePrototype,
                key,
                body: value,
                contentType: addCharsetToContentType(options.contentType),
            });
        }
    } else {
        // Special case: remove the record from the store
        if (options.contentType !== null && options.contentType !== undefined) {
            throw new Error('The "options.contentType" parameter must not be used when removing the record.');
        }
        if (devFilePath) {
            innerPromise = unlinkPromised(devFilePath)
                .catch(devErrorHandler);
        } else {
            innerPromise = apifyClient.keyValueStores.deleteRecord({
                storeId,
                promise: promisePrototype,
                key,
            });
        }
    }

    const promise = newPromise().then(() => innerPromise);
    return nodeifyPromise(promise, callback);
};


/**
 * @memberof module:Apify
 * @function
 * @description Returns a new object which contains information parsed from the `APIFY_XXX` environment variables.
 * It has the following properties:
 * ```javascript
 * {
 *   // ID of the act.
 *   // Environment variable: APIFY_ACT_ID
 *   actId: String,
 *
 *   // ID of the act run
 *   // Environment variable: APIFY_ACT_RUN_ID
 *   actRunId: String,
 *
 *   // ID of the user who started the act (might be different than the owner of the act)
 *   // Environment variable: APIFY_USER_ID
 *   userId: String,
 *
 *   // Authentication token representing privileges given to the act run,
 *   // it can be passed to various Apify APIs.
 *   // Environment variable: APIFY_TOKEN
 *   token: String,
 *
 *   // Date when the act was started
 *   // Environment variable: APIFY_STARTED_AT
 *   startedAt: Date,
 *
 *   // Date when the act will time out
 *   // Environment variable: APIFY_TIMEOUT_AT
 *   timeoutAt: Date,
 *
 *   // ID of the key-value store where input and output data of this act is stored
 *   // Environment variable: APIFY_DEFAULT_KEY_VALUE_STORE_ID
 *   defaultKeyValueStoreId: String,
 *
 *   // The amount of memory allocated for the act run, in megabytes.
 *   // It can be used by acts to optimize their memory usage.
 *   // Environment variable: APIFY_MEMORY_MBYTES
 *   memoryMbytes: Number,
 * }
 * ```
 * For the list of the `APIFY_XXX` environment variables, see
 * {@link http://localhost/docs/actor.php#run-env-vars|Actor documentation}.
 * If some of the variables is not defined or is invalid, the corresponding value in the resulting object will be null.
 * @returns {Object}
 */
export const getEnv = () => {
    // NOTE: don't throw if env vars are invalid to simplify local development and debugging of acts
    const env = process.env || {};
    return {
        actId: env[ENV_VARS.ACT_ID] || null,
        actRunId: env[ENV_VARS.ACT_RUN_ID] || null,
        userId: env[ENV_VARS.USER_ID] || null,
        token: env[ENV_VARS.TOKEN] || null,
        startedAt: tryParseDate(env[ENV_VARS.STARTED_AT]) || null,
        timeoutAt: tryParseDate(env[ENV_VARS.TIMEOUT_AT]) || null,
        defaultKeyValueStoreId: env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID] || null,
        // internalPort: parseInt(env[ENV_VARS.INTERNAL_PORT], 10) || null,
        memoryMbytes: parseInt(env[ENV_VARS.MEMORY_MBYTES], 10) || null,
    };
};

/**
 * @memberof module:Apify
 * @function
 * @description <p>Runs a user function that executes the logic of the act.
 * It performs the following actions:</p>
 * <ol>
 *   <li>Invokes the user function passed as the `userFunc` parameter</li>
 *   <li>If the user function returned a promise, waits for it to resolve</li>
 *   <li>If the user function throws an exception or some other error is encountered,
 *       prints the error details to console so that they are stored to the log file</li>
 *   <li>Exits the process</li>
 * </ol>
 * <p>
 * In the simplest case, the user function is synchronous:
 * </p>
 * ```javascript
 * Apify.main(() => {
 *     // my synchronous function that returns immediately
 * });
 * ```
 * <p>If the user function returns a promise, it is considered as asynchronous:</p>
 * ```javascript
 * const request = require('request-promise');
 * Apify.main(() => {
 *     // my asynchronous function that returns a promise
 *     return Promise.resolve()
 *     .then(() => {
 *         return request('http://www.example.com');
 *     })
 *     .then((html) => {
 *         console.log(html);
 *     });
 * });
 * ```
 * <p>To simplify your code, you can take advantage of the `async`/`await` keywords:</p>
 * ```javascript
 * const request = require('request-promise');
 * Apify.main(async () => {
 *      const html = await request('http://www.example.com');
 *      console.log(html);
 * });
 * ```
 * Note that the use of `Apify.main()` in acts is optional,
 * the function is provided merely for user convenience and acts don't need to use it.
 * @param userFunc {Function} User function to be executed
 */
export const main = (userFunc) => {
    if (!userFunc || typeof (userFunc) !== 'function') {
        throw new Error('Handler function must be provided as a parameter');
    }

    // This is to enable unit tests where process.exit() is mocked and doesn't really exit the process
    // Note that mocked process.exit() might throw, so set exited flag before calling it to avoid confusion.
    let exited = false;
    const exitWithError = (err, exitCode, message) => {
        console.error(message);
        console.error(err.stack || err);
        exited = true;
        // console.log(`Exiting with code: ${exitCode}`);
        process.exit(exitCode);
    };

    // Set dummy interval to ensure the process will not be killed while awaiting empty promise:
    // await new Promise(() => {})
    // Such a construct is used to for testing of act timeouts and aborts.
    const intervalId = setInterval(_.noop, 9999999);

    try {
        newPromise()
            .then(() => {
                return userFunc();
            })
            .catch((err) => {
                clearInterval(intervalId);
                if (!exited) {
                    exitWithError(err, EXIT_CODES.ERROR_USER_FUNCTION_THREW, 'User function threw an exception:');
                }
            })
            .then(() => {
                clearInterval(intervalId);
                if (!exited) {
                    process.exit(EXIT_CODES.SUCCESS);
                }
            });
    } catch (err) {
        // This can happen e.g. if there's no Promise dependency
        exitWithError(err, EXIT_CODES.ERROR_UNKNOWN, 'Unknown error occurred');
    }
};

// TODO: this should rather be called Apify.listeningOnPort() or something like that

/**
 * @ignore
 * @memberof module:Apify
 * @function
 * @description Notifies Apify runtime that act is listening on port specified by the APIFY_INTERNAL_PORT environment
 * variable and is ready to receive a HTTP request with act input.
 */
export const readyFreddy = () => {
    const watchFileName = process.env[ENV_VARS.WATCH_FILE];
    if (watchFileName) {
        fs.writeFile(watchFileName, '', (err) => {
            if (err) console.log(`WARNING: Cannot write to watch file ${watchFileName}: ${err}`);
        });
    } else {
        console.log(`WARNING: ${ENV_VARS.WATCH_FILE} environment variable not specified, readyFreddy() has no effect.`);
    }
};

/**
 * @memberof module:Apify
 * @function
 * @description Executes another act, waits for it to finish and fetches its output.
 * @param {String} actId - Either `username/act-name` or act ID.
 * @param {Object|String|Buffer} [input] - Act input body. If it is an object, it is stringified to
 * JSON and its content type set to ``.
 * @param {Object} [opts]
 * @param {String} [opts.token] - User API token.
 * @param {String} [opts.build] - Build tag or number to be executed.
 * @param {String} [opts.contentType] - Content type of the act input.
 * @param {String} [opts.timeoutSecs] - Time limit for act to finish. If limit is reached then run in RUNNING status is returned.
                                        Default is unlimited.
 * @param {String} [opts.fetchOutput] - If false then doesn't fetch the OUTPUT from key-value store. Default is true.
 * @param {String} [opts.disableBodyParser] - If true then doesn't parse the body - ie. JSON to object. Default is false.
 * @returns {Promise} Returns a promise unless `callback` was supplied.
 */
export const call = (actId, input, opts = {}, callback) => {
    const { acts, keyValueStores } = apifyClient;

    checkParamOrThrow(actId, 'actId', 'String');
    checkParamOrThrow(opts, 'opts', 'Object');

    // Common options.
    const { token } = opts;
    checkParamOrThrow(token, 'token', 'Maybe String');
    const defaultOpts = { actId };
    if (token) defaultOpts.token = token;

    // RunAct() options.
    const { build } = opts;
    const runActOpts = {};
    checkParamOrThrow(build, 'build', 'Maybe String');
    if (build) runActOpts.build = build;

    let { contentType } = opts;
    if (input) {
        // TODO: this is duplicate with setValue()'s code
        if (contentType === null || contentType === undefined) {
            contentType = 'application/json';
            try {
                // Format JSON to simplify debugging, the overheads with compression is negligible
                input = JSON.stringify(input, null, 2);
            } catch (err) {
                throw new Error(`The "input" parameter cannot be stringified to JSON: ${err.message}`);
            }
            if (input === undefined) {
                throw new Error('The "input" parameter cannot be stringified to JSON.');
            }
        }

        checkParamOrThrow(input, 'input', 'Buffer|String');
        checkParamOrThrow(contentType, 'contentType', 'String');

        if (contentType) runActOpts.contentType = addCharsetToContentType(contentType);
        runActOpts.body = input;
    }

    // GetAct() options.
    const { timeoutSecs, fetchOutput = true } = opts;
    checkParamOrThrow(timeoutSecs, 'timeoutSecs', 'Maybe Number');
    checkParamOrThrow(fetchOutput, 'fetchOutput', 'Boolean');
    const timeoutAt = timeoutSecs ? Date.now() + (timeoutSecs * 1000) : null;

    // GetRecord() options.
    const { disableBodyParser } = opts;
    checkParamOrThrow(disableBodyParser, 'disableBodyParser', 'Maybe Boolean');

    // Adds run.output field to given run and returns it.
    const addOutputToRun = (run) => {
        const getRecordOpts = { key: 'OUTPUT', storeId: run.defaultKeyValueStoreId };
        if (disableBodyParser) getRecordOpts.disableBodyParser = disableBodyParser;

        return keyValueStores
            .getRecord(getRecordOpts)
            .then(output => Object.assign({}, run, { output }));
    };

    // Keeps requesting given run until it gets finished or timeout is reached.
    const waitForRunToFinish = (run) => {
        const waitForFinish = timeoutAt !== null ? Math.round((timeoutAt - Date.now()) / 1000) : 999999;

        // We are timing out ...
        if (waitForFinish <= 0) return Promise.resolve(run);

        return acts
            .getRun(Object.assign({}, defaultOpts, { waitForFinish, runId: run.id }))
            .then((updatedRun) => {
                if (!_.contains(ACT_TASK_TERMINAL_STATUSES, updatedRun.status)) return waitForRunToFinish(updatedRun);
                if (!fetchOutput) return updatedRun;

                return addOutputToRun(updatedRun);
            });
    };

    const promise = acts
        .runAct(Object.assign({}, defaultOpts, runActOpts))
        .then(run => waitForRunToFinish(run));

    return nodeifyPromise(promise, callback);
};
