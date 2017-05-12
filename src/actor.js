import fs from 'fs';
import { APIFY_ENV_VARS, EXIT_CODES } from './constants';
import { newPromise } from './utils';

/* global process */

/**
 * Tries to parse a string with date.
 * @param str Date string
 * @return Returns either a Date object or undefined
 */
const tryParseDate = (str) => {
    const unix = Date.parse(str);
    return unix > 0 ? new Date(unix) : undefined;
};

/**
 * Gets a context object which contains meta-data about this act run
 * extracted from the APIFY_XXX environment variables.
 * @return Returns a dictionary with all properties that could be determined from environment variables.
 */
export const getContext = () => {
    return {
        internalPort: process.env[APIFY_ENV_VARS.INTERNAL_PORT],
        actId: process.env[APIFY_ENV_VARS.ACT_ID],
        actRunId: process.env[APIFY_ENV_VARS.ACT_RUN_ID],
        startedAt: tryParseDate(process.env[APIFY_ENV_VARS.STARTED_AT]),
        timeoutAt: tryParseDate(process.env[APIFY_ENV_VARS.TIMEOUT_AT]),
        defaultKeyValueStoreId: process.env[APIFY_ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID],
        // TODO: defaultStore object ?
    };
};

export const getInput = (callback) => {
    return null;
};

export const setOutput = (callback) => {
    return null;
};


const exitError = (err, exitCode, message) => {
    console.error(message);
    console.error(err.stack || err);
    process.exit(exitCode);
};


export const main = (userFunc) => {
    if (!userFunc || typeof (userFunc) !== 'function') {
        throw new Error('Handler function must be provided as a parameter');
    }

    const options = {
        context: getContext(),
        input: null,
    };

    try {
        newPromise()
            .then(() => {
                // Read input from the key-value store
                return getInput();
            })
            .then((input) => {
                options.input = input;
            })
            .catch((err) => {
                exitError(err, EXIT_CODES.ERROR_GETTING_INPUT, 'Failed to fetch act input');
            })
            .then(() => {
                return userFunc(options);
            })
            .catch((err) => {
                exitError(err, EXIT_CODES.ERROR_USER_FUNCTION_THREW, 'User function threw an exception');
            })
            .then((returnValue) => {
                // Save output to the key-value store
                if (returnValue) {
                    const obj = {
                        json: JSON.stringify(returnValue),
                        contentType: 'application/json',
                    };
                    return setOutput(obj);
                }
            })
            .catch((err) => {
                exitError(err, EXIT_CODES.ERROR_SETTING_OUTPUT, 'Failed to save act output');
            })
            .then(() => {
                process.exit(EXIT_CODES.SUCCESS);
            });
    } catch (err) {
        // This can happen e.g. if there's no Promise dependency
        exitError(err, EXIT_CODES.ERROR_UNKNOWN, 'Unknown error occurred');
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
