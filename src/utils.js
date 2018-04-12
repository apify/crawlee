import Promise from 'bluebird';
import contentTypeParser from 'content-type';
import os from 'os';
import fs from 'fs';
import _ from 'underscore';
import fsExtra from 'fs-extra';
import ApifyClient from 'apify-client';
import { ENV_VARS } from './constants';

const ensureDirPromised = Promise.promisify(fsExtra.ensureDir);

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
 * A default instance of the `ApifyClient` class provided
 * by the <a href="https://www.apify.com/docs/sdk/apify-client-js/latest" target="_blank">apify-client</a> NPM package.
 * The instance is created when the `apify` package is first imported
 * and it is configured using the `APIFY_API_BASE_URL`, `APIFY_USER_ID` and `APIFY_TOKEN`
 * environment variables.
 *
 * After that, the instance is used for all underlying calls to the Apify API
 * in functions such as <a href="#module-Apify-getValue">Apify.getValue()</a>
 * or <a href="#module-Apify-call">Apify.call()</a>.
 * The settings of the client can be globally altered by calling the
 * <a href="https://www.apify.com/docs/js/apify-client-js/latest#ApifyClient-setOptions"><code>Apify.client.setOptions()</code></a> function.
 * Just be careful, it might have undesired effects on other functions provided by this package.
 *
 * @memberof module:Apify
 * @name client
 * @instance
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
 * @param contentType
 * @returns {string}
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

let isDockerPromise;
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
 * Returns promise that resolves to true if the code is running in a Docker container.
 *
 * @return {Promise}
 *
 * @memberof module:Apify
 * @name isDocker
 * @instance
 * @function
 */
export const isDocker = (forceReset) => {
    // Parameter forceReset is just internal for unit tests.
    if (!isDockerPromise || forceReset) isDockerPromise = createIsDockerPromise();

    return isDockerPromise;
};

/**
 * Returns memory statistics of the container, which is an object with the following properties:
 *
 * ```javascript
 * {
 *   // Total memory available to the act
 *   totalBytes: Number,
 *   &nbsp;
 *   // Amount of free memory
 *   freeBytes: Number,
 *   &nbsp;
 *   // Amount of memory used (= totalBytes - freeBytes)
 *   usedBytes: Number,
 * }
 * ```
 *
 * @returns {Promise} Returns a promise.
 *
 * @memberof module:Apify
 * @name getMemoryInfo
 * @instance
 * @function
 */
export const getMemoryInfo = () => {
    // module.exports must be here so that we can mock it.
    return module.exports.isDocker()
        .then((isDockerVar) => {
            if (!isDockerVar) {
                const freeBytes = os.freemem();
                const totalBytes = os.totalmem();

                return Promise.resolve({ totalBytes, freeBytes, usedBytes: totalBytes - freeBytes });
            }

            // This must be promisified here so that we can Mock it.
            const readPromised = Promise.promisify(fs.readFile);

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
 * Helper function for validation if parameter is an instance of given prototype or multiple prototypes.
 * TODO: Move this to shared package along with checkParamOrThrow
 *
 * @ignore
 */
export const checkParamPrototypeOrThrow = (paramVal, paramName, prototypes, prototypeName, isOptional = false) => {
    if (isOptional && (paramVal === undefined || paramVal === null)) return;

    const hasCorrectPrototype = prototypes instanceof Array
        ? _.some(prototypes, prototype => paramVal instanceof prototype)
        : paramVal instanceof prototypes;

    if (!hasCorrectPrototype) throw new Error(`Parameter "${paramName}" must be an instance of ${prototypeName}`);
};

/**
 * Returns true if node is in production environment and false otherwise.
 *
 * @ignore
 */
export const isProduction = () => process.env.NODE_ENV !== 'production';

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
 * @returns {string}
 * @ignore
 */
export const getTypicalChromeExecutablePath = () => {
    switch (os.platform()) {
    case 'darwin': return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    case 'win32': return 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
    default: return 'google-chrome';
    }
};
