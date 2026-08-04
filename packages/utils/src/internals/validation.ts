import type { z } from 'zod';

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

    /** The raw zod error that triggered this. */
    override readonly cause: z.ZodError;

    constructor(error: z.ZodError, value: unknown) {
        super(formatZodError(error, value), { cause: error });
        this.name = 'ArgumentValidationError';
        this.issues = error.issues;
        this.cause = error;
    }
}

/**
 * Parses `value` with `schema`, returning the typed result (with schema defaults applied).
 * Throws {@link ArgumentValidationError} on failure.
 * @internal
 */
export function parseArgument<TValue, TSchema extends z.ZodType>(
    value: TValue,
    schema: TSchema,
): TValue & z.output<TSchema> {
    const result = schema.safeParse(value);
    if (!result.success) throw new ArgumentValidationError(result.error, value);
    return result.data as TValue & z.output<TSchema>;
}
