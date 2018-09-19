export const APIFY_CALL_ERROR_NAME = 'ApifyCallError';

/**
 * @typedef {Object} ApifyCallError
 * @property {String} message=Apify.call()&nbsp;failed
 * @property {String} name=APIFY_CALL_ERROR
 * @property {Object} run Object of the failed run.
 */
export class ApifyCallError extends Error {
    constructor(run) {
        super(`The actor invoked by Apify.call() did not succeed (run ID: ${run.id})`);
        this.name = APIFY_CALL_ERROR_NAME;
        this.run = run;

        Error.captureStackTrace(this, ApifyCallError);
    }
}
