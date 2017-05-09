import request from 'request';
import _ from 'underscore';

let PromisesDependency = typeof Promise === 'function' ? Promise : null;

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
 * Returns a result of `Promise.resolve()` using promise library set by `setPromisesDependency()`,
 * or using native promises, or throws if no native promises are available.
 * @return {*}
 */
export const newPromise = () => {
    if (PromisesDependency) {
        if (typeof (PromisesDependency.resolve) !== 'function') {
            throw new Error('The promise dependency set using Apifier.setPromisesDependency() does not define resolve() function.');
        }
        return PromisesDependency.resolve();
    }
    if (typeof Promise === 'function') return Promise.resolve();
    throw new Error('Native promises are not available, please call Apifier.setPromisesDependency() to set a promise library.');
};

/**
 * Parses simple map { a: 'aa', b: 'bb' } to query string ?a=aa&b=bb.
 */
export const objectToQueryString = (object) => {
    const query = _.chain(object)
                   .mapObject(val => encodeURIComponent(val))
                   .mapObject((val, key) => `${key}=${val}`)
                   .toArray()
                   .join('&');

    return query ? `?${query}` : '';
};

/**
 * Promised version of request(options) function.
 */
export const requestPromise = (options) => {
    const method = _.isString(options.method) ? options.method.toLowerCase() : options.method;

    if (!method) throw new Error('"options.method" parameter must be provided');
    if (!request[method]) throw new Error('"options.method" is not a valid http request method');

    return new PromisesDependency((resolve, reject) => {
        // We have to use request[method]({ ... }) instead of request({ method, ... })
        // to be able to mock request when unit testing requestPromise().
        request[method](options, (error, response, body) => {
            if (error) return reject(error);

            resolve(body);
        });
    });
};

/**
 * Zips two arrays ['a1', 'a2', ... ] and ['b1', 'b2', ...] into map { a1: 'b1', a2: 'b2', ... }.
 */
export const arrays2object = (keys, vals) => {
    return keys.reduce((prev, val, index) => {
        prev[val] = vals[index];

        return prev;
    }, {});
};
