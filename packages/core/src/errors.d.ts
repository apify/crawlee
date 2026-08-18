/**
 * Errors of `NonRetryableError` type will never be retried by the crawler.
 */
export declare class NonRetryableError extends Error {
}
/**
 * Errors of `CriticalError` type will shut down the whole crawler.
 * Error handlers catching CriticalError should avoid logging it, as it will be logged by Node.js itself at the end
 */
export declare class CriticalError extends NonRetryableError {
}
/**
 * @ignore
 */
export declare class MissingRouteError extends CriticalError {
}
/**
 * A schema validation issue, structurally compatible with `StandardSchemaV1.Issue`. Declared here so that
 * error types do not have to depend on `@standard-schema/spec`.
 */
export interface SchemaIssue {
    readonly message: string;
    readonly path?: readonly (PropertyKey | {
        key: PropertyKey;
    })[];
}
/**
 * Thrown when a request's `userData` does not match the {@apilink RouteSchemas|Standard Schema} registered for its label.
 *
 * As the `userData` does not change between attempts, this error is non-retryable.
 */
export declare class RequestValidationError extends NonRetryableError {
    readonly label: string | symbol;
    readonly issues: readonly SchemaIssue[];
    constructor(label: string | symbol, issues: readonly SchemaIssue[]);
}
/**
 * Thrown by {@apilink RecoverableState} when a persisted state record does not match its `stateSchema`.
 *
 * Whether a corrupt record should abort the run or be discarded in favour of the defaults depends on what the
 * state is for, so {@apilink RecoverableState.initialize} always throws and leaves the choice to the caller.
 */
export declare class StateValidationError extends Error {
    readonly persistStateKey: string;
    readonly issues: readonly SchemaIssue[];
    constructor(persistStateKey: string, issues: readonly SchemaIssue[]);
}
/**
 * Errors of `RetryRequestError` type will always be retried by the crawler.
 *
 * *This error overrides the `maxRequestRetries` option, i.e. the request can be retried indefinitely until it succeeds.*
 */
export declare class RetryRequestError extends Error {
    constructor(message?: string);
}
/**
 * Thrown when a domain has rate-limited us and the request should simply be attempted again later.
 *
 * The request is reclaimed without recording a failure: it costs neither a retry nor session reputation, because
 * nothing about the request or the session was at fault. A {@apilink ThrottlingRequestManager} holds it back until
 * the domain's backoff expires, so retries are paced rather than immediate.
 */
export declare class RequestThrottledError extends RetryRequestError {
    constructor(message?: string);
}
/**
 * Thrown when a domain has rate-limited us for so long that no request has got through, and the crawl is
 * abandoned rather than kept waiting.
 *
 * Waiting longer will not help: at this point the concurrency is too high for the domain, or it has blocked us.
 * The affected requests are deliberately left in their queue, so re-running the crawl without purging storages
 * resumes them once the domain recovers.
 */
export declare class PersistentRateLimitError extends CriticalError {
}
/**
 * Errors of `SessionError` type retire the session associated with the request and trigger a regular retry.
 *
 * The retry counts towards the `maxRequestRetries` limit, just like any other error.
 */
export declare class SessionError extends Error {
    constructor(message?: string);
}
/**
 * Thrown when a requested session is not found in the referenced SessionPool.
 */
export declare class MissingSessionError extends Error {
    constructor(sessionId?: string);
}
export declare class ContextPipelineInterruptedError extends Error {
    constructor(message?: string);
}
export declare class ContextPipelineInitializationError extends Error {
    constructor(error: unknown, options?: ErrorOptions);
}
export declare class ContextPipelineCleanupError extends CriticalError {
    constructor(error: unknown, options?: ErrorOptions);
}
export declare class RequestHandlerError extends Error {
    constructor(error: unknown, options?: ErrorOptions);
}
/**
 * Thrown when attempting to set a different service instance after one has already been retrieved.
 */
export declare class ServiceConflictError extends Error {
    constructor(serviceName: string, newValue: unknown, existingValue: unknown);
}
/**
 * Thrown by crawlers when `skipNavigation` is used on a request.
 * Subclasses can catch this error to skip their own navigation-dependent logic.
 */
export declare class NavigationSkippedError extends NonRetryableError {
}
