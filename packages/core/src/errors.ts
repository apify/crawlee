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
 * Thrown when a request's `userData` does not match the {@apilink RouteSchemas|Standard Schema} registered for its label.
 *
 * As the `userData` does not change between attempts, this error is non-retryable.
 */
export class RequestValidationError extends NonRetryableError {
    constructor(
        readonly label: string | symbol,
        readonly issues: readonly {
            readonly message: string;
            readonly path?: readonly (PropertyKey | { key: PropertyKey })[];
        }[],
    ) {
        const details = issues
            .map((issue) => {
                const path = (issue.path ?? [])
                    .map((segment) => (typeof segment === 'object' ? segment.key : segment))
                    .join('.');
                return `- ${path ? `${path}: ` : ''}${issue.message}`;
            })
            .join('\n');

        super(`Request userData for label '${String(label)}' failed schema validation:\n${details}`);
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
                `Existing value: ${existingValue}, attempted new value: ${newValue}.`,
        );
    }
}
