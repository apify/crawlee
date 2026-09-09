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
 * Wraps the failure of a callback registered with {@apilink StorageTransaction.afterCommit|`afterCommit`}
 * that ran after the request's writes had already been committed.
 *
 * Non-retryable by nature: the writes are durable, so re-running the request handler would duplicate
 * them. A callback that throws a `NonRetryableError` of its own is left alone.
 */
export class AfterCommitError extends NonRetryableError {
    constructor(cause: unknown) {
        super(cause instanceof Error ? cause.message : String(cause), { cause });
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
