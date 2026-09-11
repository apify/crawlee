import { CriticalError, NonRetryableError } from '@crawlee/core';

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
 * Thrown when a domain has rate-limited us and the request should simply be attempted again later.
 *
 * The request is reclaimed without recording a failure: it costs neither a retry nor session reputation, because
 * nothing about the request or the session was at fault. A {@apilink ThrottlingRequestManager} holds it back until
 * the domain's backoff expires, so retries are paced rather than immediate.
 */
export class RequestThrottledError extends RetryRequestError {
    constructor(message?: string) {
        super(message ?? 'Request is being retried later because its domain is rate-limiting us');
    }
}

/**
 * Thrown when a domain has rate-limited us for so long that no request has got through, and the crawl is
 * abandoned rather than kept waiting.
 *
 * Waiting longer will not help: at this point the concurrency is too high for the domain, or it has blocked us.
 * The affected requests are deliberately left in their queue, so re-running the crawl without purging storages
 * resumes them once the domain recovers.
 */
export class PersistentRateLimitError extends CriticalError {}

/**
 * Thrown when a requested session is not found in the referenced SessionPool.
 */
export class MissingSessionError extends Error {
    constructor(sessionId?: string) {
        super(
            `The current SessionPool instance couldn't find a valid session${sessionId ? ` for the following id: ${sessionId}.` : '.'}`,
        );
    }
}

export class ContextPipelineInterruptedError extends Error {
    constructor(message?: string) {
        super(`Request handling was interrupted during context initialization ${message ? ` - ${message}` : ''}`);
    }
}

export class ContextPipelineInitializationError extends Error {
    constructor(error: unknown, options?: ErrorOptions) {
        super(undefined, { cause: error, ...options });
    }
}

export class ContextPipelineCleanupError extends CriticalError {
    constructor(error: unknown, options?: ErrorOptions) {
        super(undefined, { cause: error, ...options });
    }
}

export class RequestHandlerError extends Error {
    constructor(error: unknown, options?: ErrorOptions) {
        super(undefined, { cause: error, ...options });
    }
}

/**
 * Thrown by crawlers when `skipNavigation` is used on a request.
 * Subclasses can catch this error to skip their own navigation-dependent logic.
 */
export class NavigationSkippedError extends NonRetryableError {}
