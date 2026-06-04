import { inspectValue } from '@crawlee/utils';
import type { z } from 'zod';

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

/** Formats a zod issue path like `groups[0]` or `countryCode`. */
function formatIssuePath(path: readonly PropertyKey[]): string {
    let out = '';
    for (const key of path) {
        if (typeof key === 'number') out += `[${key}]`;
        else out += out ? `.${String(key)}` : String(key);
    }
    return out;
}

/** Reads the value at `path` from the validated input, to include in the error. */
function valueAtPath(root: unknown, path: readonly PropertyKey[]): unknown {
    let current = root;
    for (const key of path) {
        if (current === null || typeof current !== 'object') return undefined;
        current = (current as Record<PropertyKey, unknown>)[key];
    }
    return current;
}

/** Renders a primitive received value for an error; skips objects/Dates (noisy). */
function describeReceived(value: unknown): string | undefined {
    switch (typeof value) {
        case 'string':
            return value;
        case 'number':
        case 'boolean':
        case 'bigint':
            return String(value);
        default:
            return undefined;
    }
}

/**
 * Formats a `ZodError` as a plain, human-readable message that names the
 * offending field *and* the value it received (e.g. ``must match pattern
 * /^[A-Z]{2}$/ at `countryCode`, got `CZE` ``) — closer to the old `ow` errors
 * than zod's default, which omits the received value.
 */
function formatZodError(error: z.ZodError, root: unknown): string {
    return error.issues
        .map((issue) => {
            const location = issue.path.length ? ` at \`${formatIssuePath(issue.path)}\`` : '';
            const received = describeReceived(valueAtPath(root, issue.path));
            const got = received === undefined ? '' : `, got \`${received}\``;
            return `${issue.message}${location}${got}`;
        })
        .join('\n');
}

/**
 * Thrown when an argument fails schema validation.
 *
 * Its `message` is a human-readable sentence naming the offending field and the
 * value it received (rather than a raw JSON dump). The structured
 * {@link https://zod.dev | zod} issues are available on `issues`, and the
 * original `ZodError` on `cause`, for programmatic inspection.
 */
export class ArgumentValidationError extends Error {
    /** Structured issues from the underlying schema check. */
    readonly issues: z.ZodError['issues'];

    constructor(error: z.ZodError, value: unknown) {
        super(formatZodError(error, value), { cause: error });
        this.name = 'ArgumentValidationError';
        this.issues = error.issues;
    }
}
