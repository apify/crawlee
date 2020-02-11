// TYPE IMPORTS
/* eslint-disable no-unused-vars,import/named,import/no-duplicates,import/order */
import { ActorRun } from './typedefs';
/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order */

export const APIFY_CALL_ERROR_NAME = 'ApifyCallError';

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
    constructor(run, message = 'The actor invoked by Apify.call() did not succeed') {
        super(`${message} (run ID: ${run.id})`);
        this.name = APIFY_CALL_ERROR_NAME;
        this.run = run;

        Error.captureStackTrace(this, ApifyCallError);
    }
}
/**
 * TimeoutError class.
 * This error should be thrown after request timeout from `requestAsBrowser`.
 * @ignore
 */
export class TimeoutError extends Error {}
