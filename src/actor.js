import fs from 'fs';
import _ from 'underscore';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { ENV_VARS, EXIT_CODES, ACT_TASK_TERMINAL_STATUSES } from './constants';
import { getPromisePrototype, newPromise, nodeifyPromise, newClient } from './utils';

/* global process, Buffer */


const JSON_CONTENT_TYPES = [
    'application/json',
    'application/json; charset=utf-8',
];


/**
 * A default instance of ApifyClient class.
 * It can be configured by calling setOptions() function.
 */
export const apifyClient = newClient();

/**
 * Tries to parse a string with date.
 * @param str Date string
 * @return Returns either a Date object or undefined
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
 * Gets a value from the default key-value store for the current act run.
 * This store is created automatically for this run,
 * whose ID is defined in the `APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable.
 * The result of the function is the body of the record. For records with 'application/json'
 * content type, the body is the already parsed object. For other content types,
 * the body is raw String or Buffer. If the record cannot be found, the result is null.
 * or `null` if record was not found.
 * @param callback Optional callback.
 * @return Returns a promise if no callback was provided, otherwise the return value is not defined.
 */
export const getValue = (key, callback = null) => {
    if (!key || !_.isString(key)) throw new Error('The "key" parameter must be a non-empty string');

    const storeId = getDefaultStoreIdOrThrow();
    const promisePrototype = getPromisePrototype();

    const promise = newPromise()
        .then(() => {
            return apifyClient.keyValueStores.getRecord({
                storeId,
                promise: promisePrototype,
                key,
            });
        })
        .then((record) => {
            // Check that the record is always either:
            // * null
            // * or { body: String|Buffer, contentType: String|null }
            // * or { body: Any, contentType: 'application/json' }
            const baseMsg = 'ApifyClient returned an unexpected value from keyValueStores.getRecord()';
            if (!record) {
                return null;
            }

            if (typeof (record) !== 'object') {
                throw new Error(`${baseMsg}: expected an object.`);
            } else if ((typeof (record.contentType) !== 'string' && record.contentType !== null)) {
                throw new Error(`${baseMsg}: contentType is not valid.`);
            } else if (!_.contains(JSON_CONTENT_TYPES, record.contentType)
                && typeof (record.body) !== 'string'
                && !Buffer.isBuffer(record.body)) {
                throw new Error(`${baseMsg}: body must be String or Buffer.`);
            }
            return record.body;
        });

    return nodeifyPromise(promise, callback);
};

/**
 * Stores a value in the default key-value store for the current act run.
 * This data is stored in the key-value store created specifically for this run,
 * whose ID is defined in the `APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable.
 * The function has no result, but throws on invalid args or other errors.
 * @param value
 * If null, the record in the key-value store is deleted.
 * If no contentType is specified, the value can be any object and it will be stringified to JSON.
 * If contentType is specified, value is considered raw data it must be a String or Buffer.
 * For any other value an error will be thrown.
 * @param options Optional settings, currently only { contentType: String } is supported to set MIME content type of the value.
 * @param callback Optional callback.
 * @return Returns a promise if no callback was provided, otherwise the return value is not defined.
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

    const storeId = getDefaultStoreIdOrThrow();
    const promisePrototype = getPromisePrototype();

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

        // Keep this code in main scope so that simple errors are thrown rather than rejected promise.
        innerPromise = apifyClient.keyValueStores.putRecord({
            storeId,
            promise: promisePrototype,
            key,
            body: value,
            contentType: options.contentType,
            useRawBody: true,
        });
    } else {
        // Special case: remove the record from the store
        if (options.contentType !== null && options.contentType !== undefined) {
            throw new Error('The "options.contentType" parameter must not be used when removing the record.');
        }
        innerPromise = apifyClient.keyValueStores.deleteRecord({
            storeId,
            promise: promisePrototype,
            key,
        });
    }

    const promise = newPromise().then(() => innerPromise);
    return nodeifyPromise(promise, callback);
};


/**
 * Generates an object which contains parsed environment variables:
 * ```javascript
 * {
 *   actId: String,
 *   actRunId: String,
 *   userId: String,
 *   token: String,
 *   startedAt: Date,
 *   timeoutAt: Date,
 *   defaultKeyValueStoreId: String,
 *   internalPort: Number,
 * }
 * ```
 * All the information is generated from the APIFY_XXX environment variables.
 * If some of the variables is not defined or is invalid, the corresponding value in the resulting object will be null;
 * an error is not thrown in such a case in order to simplify local development and debugging of acts.
 * @return Object
 */
export const getEnv = () => {
    const env = process.env || {};
    return {
        actId: env[ENV_VARS.ACT_ID] || null,
        actRunId: env[ENV_VARS.ACT_RUN_ID] || null,
        userId: env[ENV_VARS.USER_ID] || null,
        token: env[ENV_VARS.TOKEN] || null,
        startedAt: tryParseDate(env[ENV_VARS.STARTED_AT]) || null,
        timeoutAt: tryParseDate(env[ENV_VARS.TIMEOUT_AT]) || null,
        defaultKeyValueStoreId: env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID] || null,
        internalPort: parseInt(env[ENV_VARS.INTERNAL_PORT], 10) || null,
    };
};


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
 * Notifies Apify runtime that act is listening on port specified by the APIFY_INTERNAL_PORT environment
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
 * Executes given, waits for it to finish and fetches it's OUTPUT from key-value store and saves it to run.output.
 *
 * @param {Object} [opts]
 * @param {String} [opts.actId] - Either act ID or username/actname.
 * @param {String} [opts.token] - User API token.
 * @param {String} [opts.build] - Build tag or number to be executed.
 * @param {String} [opts.body] - Act input body.
 * @param {String} [opts.contentType] - Content type of the act input.
 * @param {String} [opts.timeoutSecs] - Time limit for act to finish. If limit is reached then run in RUNNING status is returned.
                                        Default is unlimited.
 * @param {String} [opts.fetchOutput] - If false then doesn't fetch the OUTPUT from key-value store. Default is true.
 * @param {String} [opts.rawBody] - If true then returns only OUTPUT value without content type and other info. Default is false.
 * @param {String} [opts.disableBodyParser] - If true then doesn't parse the body - ie. JSON to object. Default is false.
 */
export const call = (opts) => {
    const { acts, keyValueStores } = apifyClient;

    checkParamOrThrow(opts, 'opts', 'Object');

    // Common options.
    const { actId, token } = opts;
    checkParamOrThrow(actId, 'actId', 'String');
    checkParamOrThrow(token, 'token', 'Maybe String');
    const defaultOpts = { actId };
    if (token) defaultOpts.token = token;

    // RunAct() options.
    const { build, body, contentType } = opts;
    checkParamOrThrow(build, 'build', 'Maybe String');
    checkParamOrThrow(body, 'body', 'Maybe Buffer | String');
    checkParamOrThrow(contentType, 'contentType', 'Maybe String');
    const runActOpts = {};
    if (contentType) runActOpts.contentType = contentType;
    if (build) runActOpts.build = build;
    if (body) runActOpts.build = body;

    // GetAct() options.
    const { timeoutSecs, fetchOutput = true } = opts;
    checkParamOrThrow(timeoutSecs, 'timeoutSecs', 'Maybe Number');
    checkParamOrThrow(fetchOutput, 'fetchOutput', 'Boolean');
    const timeoutAt = timeoutSecs ? Date.now() + (timeoutSecs * 1000) : null;

    // GetRecord() options.
    const { rawBody, disableBodyParser } = opts;
    checkParamOrThrow(rawBody, 'rawBody', 'Maybe Boolean');
    checkParamOrThrow(disableBodyParser, 'disableBodyParser', 'Maybe Boolean');

    // Adds run.output field to given run and returns it.
    const addOutputToRun = (run) => {
        const getRecordOpts = { key: 'OUTPUT', storeId: run.defaultKeyValueStoreId };
        if (rawBody) getRecordOpts.rawBody = rawBody;
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
                if (!fetchOutput) return run;

                return addOutputToRun(updatedRun);
            });
    };

    return acts
        .runAct(Object.assign({}, defaultOpts, runActOpts))
        .then(run => waitForRunToFinish(run));
};
