export const APIFY_CALL_ERROR_NAME: "ApifyCallError";
/**
 * The class represents exceptions thrown
 * by the [`Apify.call()`](../api/apify#module_Apify.call) function.
 *
 * @typedef {Object} ApifyCallError
 * @property {String} message
 *   Error message
 * @property {String} name
 *   Contains `"ApifyCallError"`
 * @property {ActorRun} run
 *   Object representing the failed actor run.
 */
export class ApifyCallError extends Error {
    constructor(run: any, message?: string);
    run: any;
}
/**
 * TimeoutError class.
 * This error should be thrown after request timeout from `requestAsBrowser`.
 * @ignore
 */
export class TimeoutError extends Error {
    constructor(message?: string);
}
