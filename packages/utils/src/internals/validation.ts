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

/** Names the runtime type of `value` the way zod's own messages do (`null`, `array`, `string`, …). */
function describeType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

/** The bare custom-schema messages that stop at the expected type, e.g. `Invalid input: expected number`. */
const BARE_EXPECTED_TYPE_MESSAGE = /^Invalid input: expected (object|array|function|number|string|boolean)$/;

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

/** Renders one issue as a line each; a union expands into a line per failed arm. */
function formatIssue(issue: z.ZodError['issues'][number], root: unknown, basePath: readonly PropertyKey[]): string[] {
    const path = [...basePath, ...issue.path];
    // A union's own message is a bare "Invalid input" — the useful part is in `errors`,
    // whose paths are relative to the union, hence passing `path` down as the base.
    if (issue.code === 'invalid_union') {
        return issue.errors.flatMap((arm) => arm.flatMap((nested) => formatIssue(nested, root, path)));
    }

    const location = path.length ? ` at \`${formatIssuePath(path)}\`` : '';
    const value = valueAtPath(root, path);

    // ow named the received type ("expected `number` but received type `string`"); zod's built-in
    // messages do too, but our custom schemas stop at the expected type — name the received one here.
    // Skipped when the two would read the same (`expected number, received number` for `NaN`).
    let { message } = issue;
    const bareExpected = BARE_EXPECTED_TYPE_MESSAGE.exec(message);
    if (bareExpected && describeType(value) !== bareExpected[1]) {
        message += `, received ${describeType(value)}`;
    }

    const received = describeReceived(value);
    const got = received === undefined ? '' : `, got \`${received}\``;
    return [`${message}${location}${got}`];
}

/**
 * Formats a `ZodError` as a plain, human-readable message that names the
 * offending field *and* the value it received (e.g. ``must match pattern
 * /^[A-Z]{2}$/ at `countryCode`, got `CZE` ``) — closer to the old `ow` errors
 * than zod's default, which omits the received value.
 */
function formatZodError(error: z.ZodError, root: unknown, label?: string): string {
    const lines = error.issues.flatMap((issue) => formatIssue(issue, root, []));
    // The label names the validated interface, the way ow's errors ended with "in object `X`".
    return (label ? lines.map((line) => `${line} in \`${label}\``) : lines).join('\n');
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

    constructor(error: z.ZodError, value: unknown, label?: string) {
        super(formatZodError(error, value, label), { cause: error });
        this.name = 'ArgumentValidationError';
        this.issues = error.issues;
        this.cause = error;
    }
}

/**
 * Parses `value` with `schema`, returning the typed result (with schema defaults applied).
 * Throws {@link ArgumentValidationError} on failure.
 *
 * The optional `label` names the interface being validated and is appended to every error line
 * (e.g. ``… at `maxRequestRetries` in `BasicCrawlerOptions` ``).
 * @internal
 */
export function parseArgument<TValue, TSchema extends z.ZodType>(
    value: TValue,
    schema: TSchema,
    label?: string,
): TValue & z.output<TSchema> {
    const result = schema.safeParse(value);
    if (!result.success) throw new ArgumentValidationError(result.error, value, label);
    return result.data as TValue & z.output<TSchema>;
}
