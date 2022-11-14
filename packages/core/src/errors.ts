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
 * Errors of `RetryRequestError` type will always be retried by the crawler.
 *
 * *This error overrides the `maxRequestRetries` option, i.e. the request can be retried indefinitely until it succeeds.*
 */
export class RetryRequestError extends Error {
    constructor(message?: string) {
        super(message ?? "Request is being retried at the user's request");
    }
}
