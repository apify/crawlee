import fs from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

/**
 * Default regular expression to match URLs in a string that may be plain text, JSON, CSV or other. It supports common URL characters
 * and does not support URLs containing commas or spaces. The URLs also may contain Unicode letters (not symbols).
 */
export const URL_NO_COMMAS_REGEX = RegExp('https?://(www\\.)?[\\p{L}0-9][-\\p{L}0-9@:%._\\+~#=]{0,254}[\\p{L}0-9]\\.[a-z]{2,63}(:\\d{1,5})?(/[-\\p{L}0-9@:%_\\+.~#?&//=\\(\\)]*)?', 'giu'); // eslint-disable-line

/**
 * Regular expression that, in addition to the default regular expression `URL_NO_COMMAS_REGEX`, supports matching commas in URL path and query.
 * Note, however, that this may prevent parsing URLs from comma delimited lists, or the URLs may become malformed.
 */
export const URL_WITH_COMMAS_REGEX = RegExp('https?://(www\\.)?[\\p{L}0-9][-\\p{L}0-9@:%._\\+~#=]{0,254}[\\p{L}0-9]\\.[a-z]{2,63}(:\\d{1,5})?(/[-\\p{L}0-9@:%_\\+,.~#?&//=\\(\\)]*)?', 'giu'); // eslint-disable-line

let isDockerPromiseCache: Promise<boolean>;

async function createIsDockerPromise() {
    const promise1 = fs.stat('/.dockerenv')
        .then(() => true)
        .catch(() => false);

    const promise2 = fs.readFile('/proc/self/cgroup', 'utf8')
        .then((content) => content.includes('docker'))
        .catch(() => false);

    const [result1, result2] = await Promise.all([promise1, promise2]);

    return result1 || result2;
}

/**
 * Returns a `Promise` that resolves to true if the code is running in a Docker container.
 */
export function isDocker(forceReset?: boolean): Promise<boolean> {
    // Parameter forceReset is just internal for unit tests.
    if (!isDockerPromiseCache || forceReset) isDockerPromiseCache = createIsDockerPromise();

    return isDockerPromiseCache;
}

/**
 * Computes a weighted average of an array of numbers, complemented by an array of weights.
 * @ignore
 */
export function weightedAvg(arrValues: number[], arrWeights: number[]): number {
    const result = arrValues.map((value, i) => {
        const weight = arrWeights[i];
        const sum = value * weight;

        return [sum, weight];
    }).reduce((p, c) => [p[0] + c[0], p[1] + c[1]], [0, 0]);

    return result[0] / result[1];
}

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
export function sleep(millis?: number): Promise<void> {
    return setTimeout(millis);
}

/**
 * Converts SNAKE_CASE to camelCase.
 * @ignore
 */
export function snakeCaseToCamelCase(snakeCaseStr: string): string {
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
