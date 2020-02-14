export const APIFY_CALL_ERROR_NAME: "ApifyCallError";
/**
 * The class represents exceptions thrown
 * by the {@link Apify#call} function.
 *
 * @property {string} message
 *   Error message
 * @property {ActorRun<null>} run
 *   Object representing the failed actor run.
 * @property {string} name
 *   Contains `"ApifyCallError"`
 */
export class ApifyCallError extends Error {
    /**
     * @param {ActorRun<null>} run
     * @param {string} [message]
     */
    constructor(run: ActorRun<null>, message?: string | undefined);
    run: ActorRun<null>;
}
/**
 * TimeoutError class.
 * This error should be thrown after request timeout from `requestAsBrowser`.
 * @ignore
 */
export class TimeoutError extends Error {
    constructor(message?: string | undefined);
}
import { ActorRun } from "./typedefs";
