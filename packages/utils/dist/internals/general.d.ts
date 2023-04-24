/**
 * Default regular expression to match URLs in a string that may be plain text, JSON, CSV or other. It supports common URL characters
 * and does not support URLs containing commas or spaces. The URLs also may contain Unicode letters (not symbols).
 */
export declare const URL_NO_COMMAS_REGEX: RegExp;
/**
 * Regular expression that, in addition to the default regular expression `URL_NO_COMMAS_REGEX`, supports matching commas in URL path and query.
 * Note, however, that this may prevent parsing URLs from comma delimited lists, or the URLs may become malformed.
 */
export declare const URL_WITH_COMMAS_REGEX: RegExp;
/**
 * Returns a `Promise` that resolves to true if the code is running in a Docker container.
 */
export declare function isDocker(forceReset?: boolean): Promise<boolean>;
/**
 * Computes a weighted average of an array of numbers, complemented by an array of weights.
 * @ignore
 */
export declare function weightedAvg(arrValues: number[], arrWeights: number[]): number;
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
export declare function sleep(millis?: number): Promise<void>;
/**
 * Converts SNAKE_CASE to camelCase.
 * @ignore
 */
export declare function snakeCaseToCamelCase(snakeCaseStr: string): string;
//# sourceMappingURL=general.d.ts.map