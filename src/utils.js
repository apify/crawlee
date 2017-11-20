import Promise from 'bluebird';
import contentTypeParser from 'content-type';
import ApifyClient from 'apify-client';
import { ENV_VARS } from './constants';

// For backward compatibility, re-export functions that were moved to proxy-chain package
// TODO: eventually get rid of this
export { parseUrl, redactUrl, redactParsedUrl } from 'proxy-chain';

/* global process */

let PromisesDependency = Promise;

// TODO: add methods to override console.log() and console.error(), add unit tests for that!

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
};

/**
 * @memberof module:Apify
 * @function
 * @description Gets the promise dependency set by <a href="#module-Apify-setPromisesDependency"><code>Apify.setPromisesDependency</code></a>.
 * By default, the package uses the `bluebird` promises.
 * @returns {Constructor} Reference to a Promise constructor
 */
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

export const nodeifyPromise = (promise, callback) => {
    if (!promise) throw new Error('The "promise" parameter must be provided.');

    if (callback) {
        promise.then(result => callback(null, result), err => callback(err));
    } else {
        return promise;
    }
};


/**
 * Creates an instance of ApifyClient using options as defined in the environment variables.
 * This function is exported in order to enable unit testing.
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
