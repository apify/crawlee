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
const BARE_EXPECTED_TYPE_MESSAGE =
    /^Invalid input: expected (an array of .+|a typed array|an object|object|array|function|number|string|boolean)$/;

/** Longest received string rendered in an error; the rest is elided. */
const MAX_RENDERED_STRING_LENGTH = 200;

/** Renders a primitive received value for an error; skips objects/Dates (noisy). */
function describeReceived(value: unknown): string | undefined {
    switch (typeof value) {
        case 'string':
            // An empty string would render as bare backticks — make it visible.
            if (value === '') return "''";
            return value.length > MAX_RENDERED_STRING_LENGTH
                ? `${value.slice(0, MAX_RENDERED_STRING_LENGTH)}… (${value.length - MAX_RENDERED_STRING_LENGTH} more characters)`
                : value;
        case 'number':
        case 'boolean':
        case 'bigint':
            return String(value);
        default:
            return undefined;
    }
}

/** Renders the received side of a sentence: ``received the string `abc` ``, `received NaN`, `received array`. */
function describeReceivedClause(value: unknown): string {
    if (typeof value === 'number' && Number.isNaN(value)) return 'received NaN';
    if (value === '') return 'received an empty string';
    const rendered = describeReceived(value);
    return rendered === undefined
        ? `received ${describeType(value)}`
        : `received the ${describeType(value)} \`${rendered}\``;
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
    const rendered = describeReceived(value);

    // ow named the received type ("expected `number` but received type `string`"). The received value is
    // folded into that clause (``received the string `3` ``) rather than dangling after the location: our
    // custom schemas stop at the expected type, so the clause is appended; zod's built-in messages already
    // end with `, received <type>`, so that tail is replaced with the enriched one.
    let { message } = issue;
    let got = '';
    const bareExpected = BARE_EXPECTED_TYPE_MESSAGE.exec(message);
    const zodReceived = /, received (\S+)$/.exec(message);
    // `arrayOf` messages name the element type — their expected runtime type is `array`.
    const expectedType = bareExpected?.[1].startsWith('an array of') ? 'array' : bareExpected?.[1];
    if (bareExpected && expectedType !== (Number.isNaN(value as number) ? 'NaN' : describeType(value))) {
        message += `, ${describeReceivedClause(value)}`;
    } else if (zodReceived && zodReceived[1] === describeType(value) && rendered !== undefined) {
        message = `${message.slice(0, zodReceived.index)}, ${describeReceivedClause(value)}`;
    } else if (rendered !== undefined && !message.endsWith(`received ${rendered}`)) {
        // Messages that never name a received type (regex, min/max, enums) keep the plain value suffix.
        got = `, got \`${rendered}\``;
    }

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
