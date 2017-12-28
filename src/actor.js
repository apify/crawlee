import fs from 'fs';
import path from 'path';
import _ from 'underscore';
import os from 'os';
import contentTypeParser from 'content-type';
import Promise from 'bluebird';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { ENV_VARS, EXIT_CODES, ACT_TASK_TERMINAL_STATUSES } from './constants';
import { getPromisePrototype, newPromise, nodeifyPromise, newClient, addCharsetToContentType, isDocker } from './utils';


/* global process, Buffer */

/**
 * @memberof module:Apify
 * @name client
 * @instance
 * @description <p>A default instance of the `ApifyClient` class provided
 * by the {@link https://www.apify.com/docs/sdk/apify-client-js/latest|apify-client} NPM package.
 * The instance is created when the `apify` package is first imported
 * and it is configured using the `APIFY_API_BASE_URL`, `APIFY_USER_ID` and `APIFY_TOKEN`
 * environment variables.
 * After that, the instance is used for all underlying calls to the Apify API
 * in functions such as <a href="#module-Apify-getValue">Apify.getValue()</a>
 * or <a href="#module-Apify-call">Apify.call()</a>.
 * The settings of the client can be globally altered by calling the
 * <a href="https://www.apify.com/docs/js/apify-client-js/latest#ApifyClient-setOptions"><code>Apify.client.setOptions()</code></a> function.
 * Just be careful, it might have undesired effects on other functions provided by this package.
 * </p>
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

const getDefaultSequentialStoreIdOrThrow = () => {
    const storeId = process.env[ENV_VARS.DEFAULT_SEQUENTIAL_STORE_ID];
    if (!storeId) throw new Error(`The '${ENV_VARS.DEFAULT_SEQUENTIAL_STORE_ID}' environment variable is not defined.`);
    return storeId;
};


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
 * @param {Function} callback Optional callback.
 * @returns {Promise} Returns a promise if no callback was provided.
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
 * @param {Function} [callback] Optional callback. Function returns a promise if not provided.
 * @returns {Promise} Returns a promise if `callback` was not provided.
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
 * @ignore
 * @memberof module:Apify
 * @function
 * @description <p>Stores a record (object) in a sequential store using the Apify API.
 * If this is first write then a new store is created and associated with this act and then this and all further call
 * are stored in it. Default id of the store is in the `APIFY_DEFAULT_SEQUENTIAL_STORE_ID` environment variable;
 * The function has no result, but throws on invalid args or other errors.</p>
 * <pre><code class="language-javascript">await Apify.pushRecord(record);</code></pre>
 * <p>
 * By default, the record is stored as is in default sequential store associated with this act.
 * </p>
 * <pre><code class="language-javascript">await Apify.pushRecord(record, 'my-custom-store');</code></pre>
 * <p>
 * If second argument is provided then the record is stored in this named store (it's created if it does not exist).
 * </p>
 * <p>
 * **IMPORTANT: Do not forget to use the `await` keyword when calling `Apify.pushRecord()`,
 * otherwise the act process might finish before the record is stored!**
 * </p>
 * @param {Object} record Object containing date to by stored in the store
 * @param {Function} [callback] Optional callback. Function returns a promise if not provided.
 * @returns {Promise} Returns a promise if `callback` was not provided.
 */
export const pushRecord = (record, callback = null) => {
    if (!record || !_.isObject(record) || _.isArray(record)) throw new Error('The "record" parameter must be an object');
    if (callback && !_.isFunction(callback)) throw new Error('If provided then the "callback" parameter must be a function');

    const promisePrototype = getPromisePrototype();

    let stringifiedRecord;
    try {
        // Format JSON to simplify debugging, the overheads with compression is negligible
        stringifiedRecord = JSON.stringify(record, null, 2);
    } catch (e) {
        throw new Error(`The "record" parameter cannot be stringified to JSON: ${e.message}`);
    }
    if (stringifiedRecord === undefined) {
        throw new Error('The "record" parameter cannot be stringified to JSON.');
    }

    const storeId = getDefaultSequentialStoreIdOrThrow();

    const innerPromise = apifyClient.sequentialStores.putRecord({
        storeId,
        promise: promisePrototype,
        data: record,
    });


    // TODO: Emulation of sequential store for local development
    const promise = newPromise().then(() => innerPromise);
    return nodeifyPromise(promise, callback);
};


/**
 * @memberof module:Apify
 * @function
 * @description <p>Returns a new object which contains information parsed from the `APIFY_XXX` environment variables.
 * It has the following properties:</p>
 * <pre><code class="language-javascript">{
 *     // ID of the act (APIFY_ACT_ID)
 *     actId: String,
 * &nbsp;
 *     // ID of the act run (APIFY_ACT_RUN_ID)
 *     actRunId: String,
 * &nbsp;
 *     // ID of the user who started the act - note that it might be
 *     // different than the owner of the act (APIFY_USER_ID)
 *     userId: String,
 * &nbsp;
 *     // Authentication token representing privileges given to the act run,
 *     // it can be passed to various Apify APIs (APIFY_TOKEN).
 *     token: String,
 * &nbsp;
 *     // Date when the act was started (APIFY_STARTED_AT)
 *     startedAt: Date,
 * &nbsp;
 *     // Date when the act will time out (APIFY_TIMEOUT_AT)
 *     timeoutAt: Date,
 * &nbsp;
 *     // ID of the key-value store where input and output data of this
 *     // act is stored (APIFY_DEFAULT_KEY_VALUE_STORE_ID)
 *     defaultKeyValueStoreId: String,
 * &nbsp;
 *    // ID of the sequential store where input and output data of this
 *     // act is stored (APIFY_DEFAULT_SEQUENTIAL_STORE_ID)
 *     defaultSequentialStoreId: String,
 * &nbsp;
 *     // Amount of memory allocated for the act run,
 *     // in megabytes (APIFY_MEMORY_MBYTES)
 *     memoryMbytes: Number,
 * }
 * </code></pre>
 * For the list of the `APIFY_XXX` environment variables, see
 * {@link http://localhost/docs/actor.php#run-env-vars|Actor documentation}.
 * If some of the variables is not defined or is invalid, the corresponding value in the resulting object will be null.
 * @returns {Object}
 */
export const getEnv = () => {
    // NOTE: Don't throw if env vars are invalid to simplify local development and debugging of acts
    const env = process.env || {};
    return {
        actId: env[ENV_VARS.ACT_ID] || null,
        actRunId: env[ENV_VARS.ACT_RUN_ID] || null,
        userId: env[ENV_VARS.USER_ID] || null,
        token: env[ENV_VARS.TOKEN] || null,
        startedAt: tryParseDate(env[ENV_VARS.STARTED_AT]) || null,
        timeoutAt: tryParseDate(env[ENV_VARS.TIMEOUT_AT]) || null,
        defaultKeyValueStoreId: env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID] || null,
        defaultSequentialStoreId: env[ENV_VARS.DEFAULT_SEQUENTIAL_STORE_ID] || null,
        // internalPort: parseInt(env[ENV_VARS.INTERNAL_PORT], 10) || null,
        memoryMbytes: parseInt(env[ENV_VARS.MEMORY_MBYTES], 10) || null,
    };
};

/**
 * @memberof module:Apify
 * @function
 * @description <p>Runs a user function that performs the logic of the act.
 * The `Apify.main(userFunct)` function does the following actions:</p>
 * <ol>
 *   <li>Invokes the user function passed as the `userFunc` parameter</li>
 *   <li>If the user function returned a promise, waits for it to resolve</li>
 *   <li>If the user function throws an exception or some other error is encountered,
 *       prints error details to console so that they are stored to the log file</li>
 *   <li>Exits the process</li>
 * </ol>
 * <p>
 * In the simplest case, the user function is synchronous:
 * </p>
 * ```javascript
 * Apify.main(() => {
 *     // My synchronous function that returns immediately
 * });
 * ```
 * <p>If the user function returns a promise, it is considered as asynchronous:</p>
 * ```javascript
 * const request = require('request-promise');
 * Apify.main(() => {
 *     // My asynchronous function that returns a promise
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
 * Note that the use of `Apify.main()` in acts is optional;
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
 * @description <p>Executes another act under the current user account, waits for the act finish and fetches its output.</p>
 * <p>The result of the function is an object describing the act run, which looks something like this:</p>
 * ```json
 * {
 *   "id": "ErYkuTTsmKiXccNGT",
 *   "actId": "E2jjCZBezvAZnX8Rb",
 *   "userId": "mb7q2dycFBHDhae6A",
 *   "startedAt": "2017-10-25T14:23:44.376Z",
 *   "finishedAt": "2017-10-25T14:23:46.723Z",
 *   "status": "SUCCEEDED",
 *   "meta": { "origin": "API", "clientIp": "1.2.3.4", "userAgent": null },
 *   "stats": {
 *       "netRxBytes": 180,
 *       "netTxBytes": 0,
 *       ...
 *   },
 *   "options": {
 *      "build": "latest",
 *      "timeoutSecs": 0,
 *      "memoryMbytes": 512,
 *      "diskMbytes": 1024
 *   },
 *   "buildId": "Bwkqk59MCkdexDP34",
 *   "exitCode": 0,
 *   "defaultKeyValueStoreId": "ccFfRptZru2uqdQHP",
 *   "buildNumber": "0.1.2",
 *   "output": {
 *       "contentType": "application/json; charset=utf-8",
 *       "body": { "message": "Hello world!" }
 *   }
 * }
 * ```
 * <p>Internally, the function calls the {@link https://www.apify.com/docs/api/v2#/reference/acts/runs-collection/run-act|Run act} API endpoint
 * and few others.</p>
 * <p>Example usage:</p>
 * ```javascript
 * const run = await Apify.call('apify/hello-world', { myInput: 123 });
 * console.log(`Received message: ${run.output.body.message}`);
 * ```
 *
 * @param {String} actId - Either `username/act-name` or act ID.
 * @param {Object|String|Buffer} [input] - Act input body. If it is an object, it is stringified to
 * JSON and the content type set to `application/json; charset=utf-8`.
 * @param {Object} [opts]
 * @param {String} [opts.token] - User API token. By default, it is taken from the `APIFY_TOKEN` environment variable.
 * @param {String} [opts.build] - Tag or number of act build to be run (e.g. `beta` or `1.2.345`).
 * If not provided, the default build tag or number from act configuration is used (typically `latest`).
 * @param {String} [opts.contentType] - Content type for the `input`. If not specified,
 * `input` is expected to be an object that will be stringified to JSON and content type set to
 * `application/json; charset=utf-8`. If `opts.contentType` is specified, then `input` must be a `String` or `Buffer`.
 * @param {String} [opts.timeoutSecs] - Time limit for act to finish, in seconds.
 * If the limit is reached the resulting run will have the `RUNNING` status.
 * By default, there is no timeout.
 * @param {String} [opts.fetchOutput] - If `false` then the function does not fetch output of the act. Default is `true`.
 * @param {String} [opts.disableBodyParser] - If `true` then the function will not attempt to parse the
 * act's output and will return it in a raw `Buffer`. Default is `false`.
 * @param {Function} [callback] - Optional callback. Function returns a promise if not provided.
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


/**
 * @memberof module:Apify
 * @function
 * @description Returns memory statistics of the container.
 *
 * @returns {Promise} Returns a promise unless `callback` was supplied.
 */
export const getMemoryInfo = (callback) => {
    // This must be promisified here so that we can Mock it.
    const readPromised = Promise.promisify(fs.readFile);
    const promise = isDocker()
        .then((isDockerVar) => {
            if (!isDockerVar) {
                const freeBytes = os.freemem();
                const totalBytes = os.totalmem();

                return Promise.resolve({ totalBytes, freeBytes, usedBytes: totalBytes - freeBytes });
            }

            return Promise
                .all([
                    readPromised('/sys/fs/cgroup/memory/memory.limit_in_bytes'),
                    readPromised('/sys/fs/cgroup/memory/memory.usage_in_bytes'),
                ])
                .then(([totalBytesStr, usedBytesStr]) => {
                    const totalBytes = parseInt(totalBytesStr, 10);
                    const usedBytes = parseInt(usedBytesStr, 10);

                    return { totalBytes, freeBytes: totalBytes - usedBytes, usedBytes };
                });
        });

    return nodeifyPromise(promise, callback);
};
