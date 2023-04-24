/**
 * Errors of `NonRetryableError` type will never be retried by the crawler.
 */
export declare class NonRetryableError extends Error {
}
/**
 * Errors of `CriticalError` type will shut down the whole crawler.
 */
export declare class CriticalError extends NonRetryableError {
}
/**
 * @ignore
 */
export declare class MissingRouteError extends CriticalError {
}
/**
 * Errors of `RetryRequestError` type will always be retried by the crawler.
 *
 * *This error overrides the `maxRequestRetries` option, i.e. the request can be retried indefinitely until it succeeds.*
 */
export declare class RetryRequestError extends Error {
    constructor(message?: string);
}
//# sourceMappingURL=errors.d.ts.map