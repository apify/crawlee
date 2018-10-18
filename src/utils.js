import Promise from 'bluebird';
import contentTypeParser from 'content-type';
import os from 'os';
import fs from 'fs';
import fsExtra from 'fs-extra';
import ApifyClient from 'apify-client';
import psTree from '@apify/ps-tree';
import requestPromise from 'request-promise';
import XRegExp from 'xregexp';
import { delayPromise, getRandomInt } from 'apify-shared/utilities';
import { ENV_VARS, LOCAL_ENV_VARS } from 'apify-shared/consts';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { USER_AGENT_LIST } from './constants';

/* globals process */


/**
 * Default regular expression to match URLs in a string that may be plain text, JSON, CSV or other. It supports common URL characters
 * and does not support URLs containing commas or spaces. The URLs also may contain Unicode letters (not symbols).
 * @memberOf utils
 */
const URL_NO_COMMAS_REGEX = XRegExp('https?://(www\\.)?[\\p{L}0-9][-\\p{L}0-9@:%._\\+~#=]{0,254}[\\p{L}0-9]\\.[a-z]{2,63}(:\\d{1,5})?(/[-\\p{L}0-9@:%_\\+.~#?&//=\\(\\)]*)?', 'gi'); // eslint-disable-line
/**
 * Regular expression that, in addition to the default regular expression `URL_NO_COMMAS_REGEX`, supports matching commas in URL path and query.
 * Note, however, that this may prevent parsing URLs from comma delimited lists, or the URLs may become malformed.
 * @memberOf utils
 */
const URL_WITH_COMMAS_REGEX = XRegExp('https?://(www\\.)?[\\p{L}0-9][-\\p{L}0-9@:%._\\+~#=]{0,254}[\\p{L}0-9]\\.[a-z]{2,63}(:\\d{1,5})?(/[-\\p{L}0-9@:%_\\+,.~#?&//=\\(\\)]*)?', 'gi'); // eslint-disable-line

const ensureDirPromised = Promise.promisify(fsExtra.ensureDir);
const psTreePromised = Promise.promisify(psTree);

/**
 * Creates an instance of ApifyClient using options as defined in the environment variables.
 * This function is exported to enable unit testing.
 *
 * @returns {*}
 * @ignore
 */
export const newClient = () => {
    const opts = {
        userId: process.env[ENV_VARS.USER_ID] || null,
        token: process.env[ENV_VARS.TOKEN] || null,
    };

    // Only set baseUrl if overridden by env var, so that 'https://api.apify.com' is used by default.
    // This simplifies local development, which should run against production unless user wants otherwise.
    const apiBaseUrl = process.env[ENV_VARS.API_BASE_URL];
    if (apiBaseUrl) opts.baseUrl = apiBaseUrl;

    return new ApifyClient(opts);
};

/**
 * Gets the default instance of the `ApifyClient` class provided
 * <a href="https://www.apify.com/docs/sdk/apify-client-js/latest"
 * target="_blank">apify-client</a> by the NPM package.
 * The instance is created automatically by the Apify SDK and it is configured using the
 * `APIFY_API_BASE_URL`, `APIFY_USER_ID` and `APIFY_TOKEN` environment variables.
 *
 * The instance is used for all underlying calls to the Apify API in functions such as
 * [`Apify.getValue()`](#module_Apify.getValue) or [`Apify.call()`](#module_Apify.call).
 * The settings of the client can be globally altered by calling the
 * <a href="https://www.apify.com/docs/sdk/apify-client-js/latest#ApifyClient-setOptions"
 * target="_blank">`Apify.client.setOptions()`</a> function.
 * Beware that altering these settings might have unintended effects on the entire Apify SDK package.
 *
 * @memberof module:Apify
 * @name client
 */
export const apifyClient = newClient();

/**
 * Returns a result of `Promise.resolve()`.
 *
 * @returns {*}
 *
 * @ignore
 */
export const newPromise = () => {
    return Promise.resolve();
};

/**
 * Adds charset=utf-8 to given content type if this parameter is missing.
 *
 * @param {String} contentType
 * @returns {String}
 *
 * @ignore
 */
export const addCharsetToContentType = (contentType) => {
    if (!contentType) return contentType;

    const parsed = contentTypeParser.parse(contentType);

    if (parsed.parameters.charset) return contentType;

    parsed.parameters.charset = 'utf-8';

    return contentTypeParser.format(parsed);
};

let isDockerPromiseCache;
const createIsDockerPromise = () => {
    const promise1 = Promise
        .promisify(fs.stat)('/.dockerenv')
        .then(() => true)
        .catch(() => false);

    const promise2 = Promise
        .promisify(fs.readFile)('/proc/self/cgroup', 'utf8')
        .then(content => content.indexOf('docker') !== -1)
        .catch(() => false);

    return Promise
        .all([promise1, promise2])
        .then(([result1, result2]) => result1 || result2);
};

/**
 * Returns a `Promise` that resolves to true if the code is running in a Docker container.
 *
 * @return {Promise}
 *
 * @memberof module:Apify
 * @name isDocker
 * @function
 */
export const isDocker = (forceReset) => {
    // Parameter forceReset is just internal for unit tests.
    if (!isDockerPromiseCache || forceReset) isDockerPromiseCache = createIsDockerPromise();

    return isDockerPromiseCache;
};

/**
 * Sums an array of numbers.
 *
 * @param {Array} arr An array of numbers.
 * @return {Number} Sum of the numbers.
 *
 * @ignore
 */
export const sum = arr => arr.reduce((total, c) => total + c, 0);

/**
 * Computes an average of an array of numbers.
 *
 * @param {Array} arr An array of numbers.
 * @return {Number} Average value.
 *
 * @ignore
 */
export const avg = arr => sum(arr) / arr.length;

/**
 * Computes a weighted average of an array of numbers, complemented by an array of weights.
 *
 * @param {Array} arrValues
 * @param {Array} arrWeights
 * @return {Number}
 *
 * @ignore
 */
export const weightedAvg = (arrValues, arrWeights) => {
    const result = arrValues.map((value, i) => {
        const weight = arrWeights[i];
        const sum = value * weight; // eslint-disable-line no-shadow

        return [sum, weight];
    }).reduce((p, c) => [p[0] + c[0], p[1] + c[1]], [0, 0]);

    return result[0] / result[1];
};

/**
 * Returns memory statistics of the process and the system, which is an object with the following properties:
 *
 * ```javascript
 * {
 *   // Total memory available in the system or container
 *   totalBytes: Number,
 *   // Amount of free memory in the system or container
 *   freeBytes: Number,
 *   // Amount of memory used (= totalBytes - freeBytes)
 *   usedBytes: Number,
 *   // Amount of memory used the current Node.js process
 *   mainProcessBytes: Number,
 *   // Amount of memory used by child processes of the current Node.js process
 *   childProcessesBytes: Number,
 * }
 * ```
 *
 * If the process runs inside of Docker, the `getMemoryInfo` gets container memory limits,
 * otherwise it gets system memory limits.
 *
 * Beware that the function is quite inefficient because it spawns a new process.
 * Therefore you shouldn't call it too often, like more than once per second.
 *
 * @returns {Promise<Object>}
 *
 * @memberof module:Apify
 * @name getMemoryInfo
 * @function
 */
export const getMemoryInfo = async () => {
    const [isDockerVar, processes] = await Promise.all([
        // module.exports must be here so that we can mock it.
        module.exports.isDocker(),
        // Query both root and child processes
        psTreePromised(process.pid, true),
    ]);

    let mainProcessBytes = -1;
    let childProcessesBytes = 0;
    processes.forEach((rec) => {
        // Skip the 'ps' or 'wmic' commands used by ps-tree to query the processes
        if (rec.COMMAND === 'ps' || rec.COMMAND === 'WMIC.exe') {
            return;
        }
        const bytes = parseInt(rec.RSS, 10);
        // Obtain main process' memory separately
        if (rec.PID === `${process.pid}`) {
            mainProcessBytes = bytes;
            return;
        }
        childProcessesBytes += bytes;
    });

    let totalBytes;
    let freeBytes;
    let usedBytes;

    if (!isDockerVar) {
        totalBytes = os.totalmem();
        freeBytes = os.freemem();
        usedBytes = totalBytes - freeBytes;
    } else {
        // When running inside Docker container, use container memory limits
        // This must be promisified here so that we can mock it.
        const readPromised = Promise.promisify(fs.readFile);

        const [totalBytesStr, usedBytesStr] = await Promise.all([
            readPromised('/sys/fs/cgroup/memory/memory.limit_in_bytes'),
            readPromised('/sys/fs/cgroup/memory/memory.usage_in_bytes'),
        ]);

        totalBytes = parseInt(totalBytesStr, 10);
        usedBytes = parseInt(usedBytesStr, 10);
        freeBytes = totalBytes - usedBytes;
    }

    return {
        totalBytes,
        freeBytes,
        usedBytes,
        mainProcessBytes,
        childProcessesBytes,
    };
};

/**
 * Helper function that detrermines if given parameter is an instance of Promise.
 *
 * @ignore
 */
export const isPromise = (maybePromise) => {
    return maybePromise && typeof maybePromise.then === 'function' && typeof maybePromise.catch === 'function';
};

/**
 * Returns true if node is in production environment and false otherwise.
 *
 * @ignore
 */
export const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Helper function used for local implementations. Creates dir.
 *
 * @ignore
 */
export const ensureDirExists = path => ensureDirPromised(path);

/**
 * Helper function that returns the first key from plan object.
 *
 * @ignore
 */
export const getFirstKey = (dict) => {
    for (const key in dict) { // eslint-disable-line guard-for-in, no-restricted-syntax
        return key;
    }
};

/**
 * Gets a typical path to Chrome executable, depending on the current operating system.
 *
 * @return {string}
 * @ignore
 */
export const getTypicalChromeExecutablePath = () => {
    switch (os.platform()) {
    case 'darwin': return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    case 'win32': return 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
    default: return 'google-chrome';
    }
};

/**
 * Creates a promise that after given time gets rejected with given error.
 *
 * @return {Promise<Error>}
 * @ignore
 */
export const createTimeoutPromise = (timeoutMillis, errorMessage) => {
    return delayPromise(timeoutMillis).then(() => {
        throw new Error(errorMessage);
    });
};

/**
 * Returns `true` when code is running on Apify platform and `false` otherwise (for example locally).
 *
 * @returns {Boolean}
 *
 * @memberof module:Apify
 * @name isAtHome
 * @function
 */
export const isAtHome = () => !!process.env[ENV_VARS.IS_AT_HOME];

/**
 * Returns a `Promise` that resolves after a specific period of time. This is useful to implement waiting
 * in your code, e.g. to prevent overloading of target website or to avoid bot detection.
 *
 * **Example usage:**
 *
 * ```
 * const Apify = require('apify');
 *
 * ...
 *
 * // Sleep 1.5 seconds
 * await Apify.utils.sleep(1500);
 * ```
 * @param {Number} millis Period of time to sleep, in milliseconds. If not a positive number, the returned promise resolves immediately.
 * @memberof utils
 * @return {Promise}
 */
const sleep = (millis) => {
    return delayPromise(millis);
};

/**
 * Returns a promise that resolves to an array of urls parsed from the resource available at the provided url.
 * Optionally, custom regular expression and encoding may be provided.
 *
 * @param {String} url
 * @param {String} [encoding='utf8']
 * @param {RegExp} [urlRegExp=URL_NO_COMMAS_REGEX]
 * @returns {Promise<String[]>}
 * @memberOf utils
 */
const downloadListOfUrls = ({ url, encoding = 'utf8', urlRegExp = URL_NO_COMMAS_REGEX }) => {
    try {
        checkParamOrThrow(url, 'url', 'String');
        checkParamOrThrow(encoding, 'string', 'String');
        checkParamOrThrow(urlRegExp, 'urlRegExp', 'RegExp');
    } catch (err) {
        return Promise.reject(err);
    }
    return requestPromise.get({ url, encoding })
        .then(string => extractUrls({ string, urlRegExp }));
};

/**
 * Collects all URLs in an arbitrary string to an array, optionally using a custom regular expression.
 * @param {String} string
 * @param {RegExp} [urlRegExp=URL_NO_COMMAS_REGEX]
 * @returns {String[]}
 * @memberOf utils
 */
const extractUrls = ({ string, urlRegExp = URL_NO_COMMAS_REGEX }) => {
    checkParamOrThrow(string, 'string', 'String');
    checkParamOrThrow(urlRegExp, 'urlRegExp', 'RegExp');
    return string.match(urlRegExp) || [];
};

/**
 * Returns a randomly selected User-Agent header out of a list of the most common headers.
 * @returns {String}
 * @memberOf utils
 */
const getRandomUserAgent = () => {
    const index = getRandomInt(USER_AGENT_LIST.length);
    return USER_AGENT_LIST[index];
};

/**
 * Helper function to open local storage.
 *
 * @ignore
 */
export const openLocalStorage = async (idOrName, defaultIdEnvVar, LocalClass, cache) => {
    const localStorageDir = process.env[ENV_VARS.LOCAL_STORAGE_DIR] || LOCAL_ENV_VARS[ENV_VARS.LOCAL_STORAGE_DIR];

    if (!idOrName) idOrName = process.env[defaultIdEnvVar] || LOCAL_ENV_VARS[defaultIdEnvVar];

    let storagePromise = cache.get(idOrName);

    if (!storagePromise) {
        storagePromise = Promise.resolve(new LocalClass(idOrName, localStorageDir));
        cache.add(idOrName, storagePromise);
    }

    return storagePromise;
};

/**
 * Helper function to open remote storage.
 *
 * @ignore
 */
export const openRemoteStorage = async (idOrName, defaultIdEnvVar, RemoteClass, cache, getOrCreateFunction) => {
    let isDefault = false;

    if (!idOrName) {
        isDefault = true;
        idOrName = process.env[defaultIdEnvVar];
        if (!idOrName) throw new Error(`The '${defaultIdEnvVar}' environment variable is not defined.`);
    }

    let storagePromise = cache.get(idOrName);

    if (!storagePromise) {
        storagePromise = isDefault // If true then we know that this is an ID of existing store.
            ? Promise.resolve(new RemoteClass(idOrName))
            : getOrCreateFunction(idOrName).then(storage => (new RemoteClass(storage.id, storage.name)));
        cache.add(idOrName, storagePromise);
    }

    return storagePromise;
};

/**
 * Checks if at least one of APIFY_LOCAL_STORAGE_DIR and APIFY_TOKEN environment variables is set.
 * @ignore
 */
export const ensureTokenOrLocalStorageEnvExists = (storageName) => {
    if (!process.env[ENV_VARS.LOCAL_STORAGE_DIR] && !process.env[ENV_VARS.TOKEN]) {
        throw new Error(`Cannot use ${storageName} as neither ${ENV_VARS.LOCAL_STORAGE_DIR} nor ${ENV_VARS.TOKEN} environment variable is set. You need to set one these variables in order to enable data storage.`); // eslint-disable-line max-len
    }
};

/**
 * A namespace that contains various utilities.
 *
 * **Example usage:**
 *
 * ```javascript
 * const Apify = require('apify');
 *
 * ...
 *
 * // Sleep 1.5 seconds
 * await Apify.utils.sleep(1500);
 * ```
 * @namespace utils
 */
export const publicUtils = {
    sleep,
    downloadListOfUrls,
    extractUrls,
    getRandomUserAgent,
    URL_NO_COMMAS_REGEX,
    URL_WITH_COMMAS_REGEX,
};
