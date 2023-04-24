"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.snakeCaseToCamelCase = exports.sleep = exports.weightedAvg = exports.isDocker = exports.URL_WITH_COMMAS_REGEX = exports.URL_NO_COMMAS_REGEX = void 0;
const tslib_1 = require("tslib");
const promises_1 = tslib_1.__importDefault(require("node:fs/promises"));
const promises_2 = require("node:timers/promises");
/**
 * Default regular expression to match URLs in a string that may be plain text, JSON, CSV or other. It supports common URL characters
 * and does not support URLs containing commas or spaces. The URLs also may contain Unicode letters (not symbols).
 */
exports.URL_NO_COMMAS_REGEX = RegExp('https?://(www\\.)?[\\p{L}0-9][-\\p{L}0-9@:%._\\+~#=]{0,254}[\\p{L}0-9]\\.[a-z]{2,63}(:\\d{1,5})?(/[-\\p{L}0-9@:%_\\+.~#?&//=\\(\\)]*)?', 'giu'); // eslint-disable-line
/**
 * Regular expression that, in addition to the default regular expression `URL_NO_COMMAS_REGEX`, supports matching commas in URL path and query.
 * Note, however, that this may prevent parsing URLs from comma delimited lists, or the URLs may become malformed.
 */
exports.URL_WITH_COMMAS_REGEX = RegExp('https?://(www\\.)?[\\p{L}0-9][-\\p{L}0-9@:%._\\+~#=]{0,254}[\\p{L}0-9]\\.[a-z]{2,63}(:\\d{1,5})?(/[-\\p{L}0-9@:%_\\+,.~#?&//=\\(\\)]*)?', 'giu'); // eslint-disable-line
let isDockerPromiseCache;
async function createIsDockerPromise() {
    const promise1 = promises_1.default.stat('/.dockerenv')
        .then(() => true)
        .catch(() => false);
    const promise2 = promises_1.default.readFile('/proc/self/cgroup', 'utf8')
        .then((content) => content.includes('docker'))
        .catch(() => false);
    const [result1, result2] = await Promise.all([promise1, promise2]);
    return result1 || result2;
}
/**
 * Returns a `Promise` that resolves to true if the code is running in a Docker container.
 */
function isDocker(forceReset) {
    // Parameter forceReset is just internal for unit tests.
    if (!isDockerPromiseCache || forceReset)
        isDockerPromiseCache = createIsDockerPromise();
    return isDockerPromiseCache;
}
exports.isDocker = isDocker;
/**
 * Computes a weighted average of an array of numbers, complemented by an array of weights.
 * @ignore
 */
function weightedAvg(arrValues, arrWeights) {
    const result = arrValues.map((value, i) => {
        const weight = arrWeights[i];
        const sum = value * weight;
        return [sum, weight];
    }).reduce((p, c) => [p[0] + c[0], p[1] + c[1]], [0, 0]);
    return result[0] / result[1];
}
exports.weightedAvg = weightedAvg;
/**
 * Returns a `Promise` that resolves after a specific period of time. This is useful to implement waiting
 * in your code, e.g. to prevent overloading of target website or to avoid bot detection.
 *
 * **Example usage:**
 *
 * ```
 * import { sleep } from 'crawlee';
 *
 * ...
 *
 * // Sleep 1.5 seconds
 * await sleep(1500);
 * ```
 * @param millis Period of time to sleep, in milliseconds. If not a positive number, the returned promise resolves immediately.
 */
function sleep(millis) {
    return (0, promises_2.setTimeout)(millis);
}
exports.sleep = sleep;
/**
 * Converts SNAKE_CASE to camelCase.
 * @ignore
 */
function snakeCaseToCamelCase(snakeCaseStr) {
    return snakeCaseStr
        .toLowerCase()
        .split('_')
        .map((part, index) => {
        return index > 0
            ? part.charAt(0).toUpperCase() + part.slice(1)
            : part;
    })
        .join('');
}
exports.snakeCaseToCamelCase = snakeCaseToCamelCase;
//# sourceMappingURL=general.js.map