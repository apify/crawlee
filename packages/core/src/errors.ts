/**
 * Errors of `NonRetryableError` type will never be retried by the crawler.
 */
export class NonRetryableError extends Error {}

/**
 * Errors of `CriticalError` type will shut down the whole crawler.
 * Error handlers catching CriticalError should avoid logging it, as it will be logged by Node.js itself at the end
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

/**
 * Errors of `SessionError` type will trigger a session rotation.
 *
 * This error doesn't respect the `maxRequestRetries` option and has a separate limit of `maxSessionRotations`.
 */
export class SessionError extends RetryRequestError {
    constructor(message?: string) {
        super(`Detected a session error, rotating session... ${message ? `\n${message}` : ''}`);
    }
}

export class ContextPipelineInterruptedError extends Error {
    constructor(message?: string) {
        super(`Request handling was interrupted during context initialization ${message ? ` - ${message}` : ''}`);
    }
}

export class ContextPipelineInitializationError extends Error {
    constructor(
        public error: unknown,
        public crawlingContext: {},
    ) {
        super();
    }
}

export class ContextPipelineCleanupError extends Error {
    constructor(
        public error: unknown,
        public crawlingContext: {},
    ) {
        super();
    }
}

export class RequestHandlerError extends Error {
    constructor(
        public error: unknown,
        public crawlingContext: {},
    ) {
        super();
    }
}
