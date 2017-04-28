'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});


var promisesDependency = typeof Promise === 'function' ? Promise : null;

// TODO: add methods to override console.log() and console.error(), add unit tests for that!


/**
 * Sets the promise dependency the SDK will use wherever Promises are returned.
 * Passing `null` will force the SDK to use native Promises if they are available.
 * @param [Constructor] dep A reference to a Promise constructor
 */
var setPromisesDependency = exports.setPromisesDependency = function setPromisesDependency(dep) {
    if (dep !== null && typeof dep !== 'function') throw new Error('The "dep" parameter must be a function');
    promisesDependency = dep;
};

/**
 * Gets the promise dependency set by `Apifier.setPromisesDependency`.
 */
var getPromisesDependency = exports.getPromisesDependency = function getPromisesDependency() {
    return promisesDependency;
};

/**
 * Returns a result of `Promise.resolve()` using promise library set by `setPromisesDependency()`,
 * or using native promises, or throws if no native promises are available.
 * @return {*}
 */
var newPromise = exports.newPromise = function newPromise() {
    if (promisesDependency) {
        if (typeof promisesDependency.resolve !== 'function') {
            throw new Error('The promise dependency set using Apifier.setPromisesDependency() does not define resolve() function.');
        }
        return promisesDependency.resolve();
    }
    if (typeof Promise === 'function') return Promise.resolve();
    throw new Error('Native promises are not available, please call Apifier.setPromisesDependency() to set a promise library.');
};