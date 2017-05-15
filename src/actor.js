import fs from 'fs';
import ApifyClient from 'apify-client';
import { APIFY_ENV_VARS, EXIT_CODES } from './constants';
import { getPromisesDependency, newPromise } from './utils';

/* global process */

const apifyClient = new ApifyClient();


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
    const storeId = process.env[APIFY_ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID];
    if (!storeId) throw new Error(`The '${APIFY_ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID}' environment variable is not defined.`);
    return storeId;
};


/**
 * Gets input data for the current act run.
 * This data is stored in the key-value store created specifically for this run,
 * whose ID is defined in the `APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable,
 * under record with the `INPUT` key.
 * The result of the function is an object such as `{ body: String/Buffer, contentType: String }`,
 * or `null` if record was not found.
 * @param callback Optional callback.
 * @return Returns a promise if no callback was provided, otherwise the return value is not defined.
 */
export const getInput = (callback = null) => {
    return apifyClient.keyValueStores.getRecord({
        storeId: getDefaultStoreIdOrThrow(),
        promise: getPromisesDependency(),
    }, callback);
};

/**
 * Sets output data for the current act run.
 * This data is stored in the key-value store created specifically for this run,
 * whose ID is defined in the `APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable,
 * under record with the `OUTPUT` key.
 * The function has no result.
 * @param output
 * @param callback Optional callback.
 * @return Returns a promise if no callback was provided, otherwise the return value is not defined.
 */
export const setOutput = (output, callback = null) => {
    if (!output) throw new Error('The "output" parameter must be provided.');

    return apifyClient.keyValueStores.setRecord({
        storeId: getDefaultStoreIdOrThrow(),
        promise: getPromisesDependency(),
        body: output.body,
        contentType: output.contentType,
    }, callback);
};

/**
 * Generates a context object which contains meta-data about this act run such as:
 * ```javascript
 * {
 *   internalPort: Number,
 *   actId: String,
 *   actRunId: String,
 *   startedAt: Date,
 *   timeoutAt: Date,
 *   defaultKeyValueStoreId: String,
 *   input: {
 *     body: String/Buffer,
 *     contentType: String,
 *   }
 * }
 * ```
 * The information is generate using the APIFY_XXX environment variables and the input data is fetched from Apifier API.
 * If some of the values cannot be determined, it will be set to null;
 * we don't throw error in such a case in order to simplify local development and debugging of acts.
 * @param callback Optional callback.
 * @return Returns a promise if no callback was provided, otherwise the return value is not defined.
 */
export const getContext = (callback = null) => {
    const context = {
        internalPort: process.env[APIFY_ENV_VARS.INTERNAL_PORT] || null,
        actId: process.env[APIFY_ENV_VARS.ACT_ID] || null,
        actRunId: process.env[APIFY_ENV_VARS.ACT_RUN_ID] || null,
        startedAt: tryParseDate(process.env[APIFY_ENV_VARS.STARTED_AT]) || null,
        timeoutAt: tryParseDate(process.env[APIFY_ENV_VARS.TIMEOUT_AT]) || null,
        defaultKeyValueStoreId: process.env[APIFY_ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID] || null,
        input: null,
    };

    return newPromise()
        .then(() => {
            if (!context.defaultKeyValueStoreId) return null;
            return getInput();
        })
        .then((input) => {
            context.input = input || null;
            return context;
        })
        .catch((err) => {
            if (!callback) throw err;
            callback(err);
        });
};


const exitWithError = (err, exitCode, message) => {
    console.error(message);
    console.error(err.stack || err);
    process.exit(exitCode);
};


export const main = (userFunc) => {
    if (!userFunc || typeof (userFunc) !== 'function') {
        throw new Error('Handler function must be provided as a parameter');
    }

    try {
        newPromise()
            .then(() => {
                return getContext();
            })
            .catch((err) => {
                exitWithError(err, EXIT_CODES.ERROR_GETTING_INPUT, 'Failed to fetch act input');
            })
            .then((context) => {
                return userFunc(context);
            })
            .catch((err) => {
                exitWithError(err, EXIT_CODES.ERROR_USER_FUNCTION_THREW, 'User function threw an exception');
            })
            .then((userReturnValue) => {
                // Save output to the key-value store
                if (userReturnValue) {
                    const output = {
                        body: JSON.stringify(userReturnValue),
                        contentType: 'application/json',
                    };
                    return setOutput(output);
                }
            })
            .catch((err) => {
                exitWithError(err, EXIT_CODES.ERROR_SETTING_OUTPUT, 'Failed to save act output');
            })
            .then(() => {
                process.exit(EXIT_CODES.SUCCESS);
            });
    } catch (err) {
        // This can happen e.g. if there's no Promise dependency
        exitWithError(err, EXIT_CODES.ERROR_UNKNOWN, 'Unknown error occurred');
    }
};

/**
 * Notifies Apifier runtime that act is listening on port specified by the APIFY_INTERNAL_PORT environment
 * variable and is ready to receive a HTTP request with act input.
 */
export const readyFreddy = () => {
    const watchFileName = process.env[APIFY_ENV_VARS.WATCH_FILE];
    if (watchFileName) {
        fs.writeFile(watchFileName, '', (err) => {
            if (err) console.log(`WARNING: Cannot write to watch file ${watchFileName}: ${err}`);
        });
    } else {
        console.log(`WARNING: ${APIFY_ENV_VARS.WATCH_FILE} environment variable not specified, readyFreddy() has no effect.`);
    }
};
