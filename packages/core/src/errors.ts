import { inspectValue } from './debug.js';

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
 * A schema validation issue, structurally compatible with `StandardSchemaV1.Issue`. Declared here so that
 * error types do not have to depend on `@standard-schema/spec`.
 */
export interface SchemaIssue {
    readonly message: string;
    readonly path?: readonly (PropertyKey | { key: PropertyKey })[];
}

function formatIssues(issues: readonly SchemaIssue[]): string {
    return issues
        .map((issue) => {
            const path = (issue.path ?? [])
                .map((segment) => (typeof segment === 'object' ? segment.key : segment))
                .join('.');
            return `- ${path ? `${path}: ` : ''}${issue.message}`;
        })
        .join('\n');
}

/**
 * Thrown when a request's `userData` does not match the {@apilink RouteSchemas|Standard Schema} registered for its label.
 *
 * As the `userData` does not change between attempts, this error is non-retryable.
 */
export class RequestValidationError extends NonRetryableError {
    constructor(
        readonly label: string | symbol,
        readonly issues: readonly SchemaIssue[],
    ) {
        super(`Request userData for label '${String(label)}' failed schema validation:\n${formatIssues(issues)}`);
    }
}

/**
 * Thrown by {@apilink RecoverableState} when a persisted state record does not match its `stateSchema`.
 *
 * Whether a corrupt record should abort the run or be discarded in favour of the defaults depends on what the
 * state is for, so {@apilink RecoverableState.initialize} always throws and leaves the choice to the caller.
 */
export class StateValidationError extends Error {
    constructor(
        readonly persistStateKey: string,
        readonly issues: readonly SchemaIssue[],
    ) {
        super(`State persisted under key '${persistStateKey}' failed schema validation:\n${formatIssues(issues)}`);
    }
}

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
 * Errors of `SessionError` type retire the session associated with the request and trigger a regular retry.
 *
 * The retry counts towards the `maxRequestRetries` limit, just like any other error.
 */
export class SessionError extends Error {
    constructor(message?: string) {
        super(`Detected a session error, retiring session... ${message ? `\n${message}` : ''}`);
    }
}

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
 * Thrown when attempting to set a different service instance after one has already been retrieved.
 */
export class ServiceConflictError extends Error {
    constructor(serviceName: string, newValue: unknown, existingValue: unknown) {
        super(
            `Service ${serviceName} is already in use. ` +
                `Existing value: ${inspectValue(existingValue)}, attempted new value: ${inspectValue(newValue)}.`,
        );
    }
}

/**
 * Thrown by crawlers when `skipNavigation` is used on a request.
 * Subclasses can catch this error to skip their own navigation-dependent logic.
 */
export class NavigationSkippedError extends NonRetryableError {}
