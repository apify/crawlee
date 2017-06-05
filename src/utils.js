import ApifyClient from 'apify-client';
import { APIFY_ENV_VARS } from './constants';

let PromisesDependency = typeof Promise === 'function' ? Promise : null;

/* global process */

// TODO: add methods to override console.log() and console.error(), add unit tests for that!

/**
 * Sets the promise dependency the SDK will use wherever Promises are returned.
 * Passing `null` will force the SDK to use native Promises if they are available.
 * @param [Constructor] dep A reference to a Promise constructor
 */
export const setPromisesDependency = (dep) => {
    if (dep !== null && typeof dep !== 'function') throw new Error('The "dep" parameter must be a function');
    PromisesDependency = dep;
};

/**
 * Gets the promise dependency set by `Apifier.setPromisesDependency`.
 */
export const getPromisesDependency = () => {
    return PromisesDependency;
};

/**
 * Gets a promise dependency set using `setPromisesDependency()`,
 * or returns the native `Promise` function, or throws if no native promises are available.
 * @return Promise
 */
export const getPromisePrototype = () => {
    if (PromisesDependency) {
        if (typeof (PromisesDependency.resolve) !== 'function') {
            throw new Error('The promise dependency set using Apifier.setPromisesDependency() does not define resolve() function.');
        }
        return PromisesDependency;
    }
    if (typeof Promise === 'function') return Promise;
    throw new Error('Native promises are not available, please call Apifier.setPromisesDependency() to set a promise library.');
};

/**
 * Returns a result of `Promise.resolve()` using promise library set by `setPromisesDependency()`,
 * or using native promises, or throws if no native promises are available.
 * @return {*}
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
 * @return {*}
 */
export const newClient = () => {
    const opts = {
        baseUrl: process.env[APIFY_ENV_VARS.API_BASE_URL] || null,
        userId: process.env[APIFY_ENV_VARS.USER_ID] || null,
        token: process.env[APIFY_ENV_VARS.TOKEN] || null,
    };

    return new ApifyClient(opts);
};
