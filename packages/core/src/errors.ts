/**
 * Errors of `NonRetryableError` type will never be retried by the crawler.
 */
export class NonRetryableError extends Error {}

/**
 * Errors of `CriticalError` type will shut down the whole crawler.
 */
export class CriticalError extends NonRetryableError {}

/**
 * @ignore
 */
export class MissingRouteError extends CriticalError {}

/**
 * Indicates that the request should be retried (while still respecting the maximum number of retries).
 */
export class RetryRequestError extends Error {
    constructor(message?: string) {
        super(message ?? "Request is being retried at the user's request");
    }
}
