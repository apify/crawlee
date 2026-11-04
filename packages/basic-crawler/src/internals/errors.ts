import { CriticalError, NonRetryableError } from '@crawlee/core';

import type { SkippedRequestReason } from './crawling-request.js';

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

/**
 * Settles the request as skipped rather than failed: no retry, no failure, and its storage writes are rolled back.
 * Use {@apilink RestrictedCrawlingContext.skipRequest|`context.skipRequest()`} rather than throwing this directly.
 * @internal
 */
export class ContextPipelineInterruptedError extends Error {
    constructor(
        readonly reason: SkippedRequestReason,
        readonly skipMessage?: string,
    ) {
        super(skipMessage ?? 'Request was skipped');
    }
}

export class ContextPipelineCleanupError extends CriticalError {
    constructor(error: unknown, options?: ErrorOptions) {
        super(undefined, { cause: error, ...options });
    }
}

/** Wraps a failure of a context pipeline middleware, telling it apart from a {@apilink RequestHandlerError}. */
export class ContextPipelineInitializationError extends Error {
    constructor(error: unknown, options?: ErrorOptions) {
        super(undefined, { cause: error, ...options });
    }
}

/** Wraps a failure of the context pipeline's final consumer (the request handler), telling it apart from a middleware failure. */
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

/**
 * Wraps a `skipNavigation` request so that reading `loadedUrl` throws a {@apilink NavigationSkippedError}.
 * @internal
 */
export function skippedNavigationRequest<R extends object>(request: R): R {
    return new Proxy(request, {
        get(target, propertyName) {
            if (propertyName === 'loadedUrl') {
                throw new NavigationSkippedError(
                    'The `request.loadedUrl` property is not available - `skipNavigation` was used',
                );
            }
            // `target` as receiver and bound methods, or `#` members throw on the proxy
            const value = Reflect.get(target, propertyName, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
        // Hide `loadedUrl` from enumeration so bookkeeping (spread/JSON/zod) skips it; direct reads still throw above.
        getOwnPropertyDescriptor(target, propertyName) {
            const descriptor = Reflect.getOwnPropertyDescriptor(target, propertyName);
            if (propertyName === 'loadedUrl' && descriptor) {
                return { ...descriptor, enumerable: false };
            }
            return descriptor;
        },
        set: (target, propertyName, value) => Reflect.set(target, propertyName, value, target),
    });
}
