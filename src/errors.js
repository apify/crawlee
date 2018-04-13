export const APIFY_CALL_ERROR_NAME = 'APIFY_CALL_ERROR';
export const APIFY_CALL_ERROR_MESSAGE = 'Apify.call() wasn\'t succeed';

/**
 * @typedef {Object} ApifyCallError
 * @property {String} message=Apify.call()&nbsp;wasn't&nbsp;succeed
 * @property {String} name=APIFY_CALL_ERROR
 * @property {Object} run Object of the failed run.
 */
export class ApifyCallError extends Error {
    constructor(run) {
        super(APIFY_CALL_ERROR_MESSAGE);
        this.name = APIFY_CALL_ERROR_NAME;
        this.run = run;

        Error.captureStackTrace(this, ApifyCallError);
    }
}
