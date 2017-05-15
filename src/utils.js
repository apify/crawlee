
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

export const nodeifyPromise = (promise, callback) => {
    if (!promise) throw new Error('The "promise" parameter must be provided.');
    if (!callback) return promise;
    promise
        .then(() => callback(context))
        .catch(err => callback(err));
};
