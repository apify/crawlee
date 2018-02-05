import Promise from 'bluebird';
import contentTypeParser from 'content-type';
import os from 'os';
import fs from 'fs';
import ApifyClient from 'apify-client';
import { ENV_VARS } from './constants';

let PromisesDependency = Promise;

/**
 * Creates an instance of ApifyClient using options as defined in the environment variables.
 * This function is exported to enable unit testing.
 * @returns {*}
 * @ignore
 */
export const newClient = () => {
    const opts = {
        userId: process.env[ENV_VARS.USER_ID] || null,
        token: process.env[ENV_VARS.TOKEN] || null,
        promise: PromisesDependency,
    };

    // Only set baseUrl if overridden by env var, so that 'https://api.apify.com' is used by default.
    // This simplifies local development, which should run against production unless user wants otherwise.
    const apiBaseUrl = process.env[ENV_VARS.API_BASE_URL];
    if (apiBaseUrl) opts.baseUrl = apiBaseUrl;

    return new ApifyClient(opts);
};

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

/**
 * @memberof module:Apify
 * @function
 * @description <p>Sets the promise dependency that the package will use wherever promises are returned.
 * Passing `null` will force the SDK to use native Promises if they are available.</p>
 * <p>Example usage</p>
 * <pre><code class="language-javascript">const Promise = require('bluebird');
 * const Apify = require('apify');
 * &nbsp;
 * Apify.setPromisesDependency(Promise);
 * </code></pre>
 * By default, the package uses the `bluebird` promises.
 * @param [Constructor] dep Reference to a Promise constructor
 */
export const setPromisesDependency = (dep) => {
    if (dep !== null && typeof dep !== 'function') throw new Error('The "dep" parameter must be a function');
    PromisesDependency = dep;
    apifyClient.setOptions({ promise: dep });
};

/**
 * @memberof module:Apify
 * @function
 * @description Gets the promise dependency set by <a href="#module-Apify-setPromisesDependency"><code>Apify.setPromisesDependency</code></a>.
 * By default, the package uses the `bluebird` promises.
 * @returns {Constructor} Reference to a Promise constructor
 */
// @TODO: check thats used where appreciate
// @TODO: duplicite to PromisesDependency
export const getPromisesDependency = () => {
    return PromisesDependency;
};

/**
 * Gets a promise dependency set using `setPromisesDependency()`,
 * or returns the native `Promise` function, or throws if no native promises are available.
 * @returns Promise
 * @ignore
 */
export const getPromisePrototype = () => {
    if (PromisesDependency) {
        if (typeof (PromisesDependency.resolve) !== 'function') {
            throw new Error('The promise dependency set using Apify.setPromisesDependency() does not define resolve() function.');
        }
        return PromisesDependency;
    }
    if (typeof Promise === 'function') return Promise;
    throw new Error('Native promises are not available, please call Apify.setPromisesDependency() to set a promise library.');
};

/**
 * Returns a result of `Promise.resolve()` using promise library set by `setPromisesDependency()`,
 * or using native promises, or throws if no native promises are available.
 * @returns {*}
 * @ignore
 */
export const newPromise = () => {
    return getPromisePrototype().resolve();
};

// @TODO remove
export const nodeifyPromise = (promise, callback) => {
    if (!promise) throw new Error('The "promise" parameter must be provided.');

    if (callback) {
        promise.then(result => callback(null, result), err => callback(err));
    } else {
        return promise;
    }
};

/**
 * Adds charset=utf-8 to given content type if this parameter is missing.
 *
 * @param contentType
 * @returns {string}
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
 * Returns promise that resolves to true if the code is running in Docker container.
 * See https://github.com/sindresorhus/is-docker
 *
 * Param forceReset is just internal for unit tests.
 *
 * @return Promise
 */
export const isDocker = (forceReset) => {
    if (!isDockerPromise || forceReset) isDockerPromise = createIsDockerPromise();

    return isDockerPromise;
};

/**
 * @memberof module:Apify
 * @function
 * @description Returns memory statistics of the container, which is an object with the following properties:
 * ```javascript
 * {
 *   // Total memory available to the act
 *   totalBytes: Number,
 *
 *   // Amount of free memory
 *   freeBytes: Number,
 *
 *   // Amount of memory used (= totalBytes - freeBytes)
 *   usedBytes: Number,
 * }
 * ```
 *
 * @returns {Promise} Returns a promise.
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

// @TODO test
export const isPromise = (maybePromise) => {
    return maybePromise && typeof maybePromise.then === 'function' && typeof maybePromise.catch === 'function';
};

export const checkParamPrototypeOrThrow = (paramVal, paramName, prototype, prototypeName, isOptional = false) => {
    if (isOptional && (paramVal === undefined || paramVal === null)) return;

    if (paramVal && !(paramVal instanceof prototype)) {
        throw new Error(`Parameter "${paramName}" must be an instance of ${prototypeName}`);
    }
};
