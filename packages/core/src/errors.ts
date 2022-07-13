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
