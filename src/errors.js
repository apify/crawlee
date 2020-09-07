/* eslint-disable max-classes-per-file */
export const APIFY_CALL_ERROR_NAME = 'ApifyCallError';

// eslint-disable-next-line import/named,no-unused-vars,import/first
import { ActorRun } from './typedefs';

/**
 * The class represents exceptions thrown
 * by the {@link Apify#call} function.
 *
 * @property {string} message
 *   Error message
 * @property {ActorRun} run
 *   Object representing the failed actor run.
 * @property {string} name
 *   Contains `"ApifyCallError"`
 */
export class ApifyCallError extends Error {
    /**
     * @param {ActorRun} run
     * @param {string} [message]
     */
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
