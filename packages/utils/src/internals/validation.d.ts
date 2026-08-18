import type { z } from 'zod';
/**
 * Thrown when an argument fails schema validation.
 *
 * Its `message` is a human-readable sentence naming the offending field and the
 * value it received (rather than a raw JSON dump). The structured
 * {@link https://zod.dev | zod} issues are available on `issues`, and the
 * original `ZodError` on `cause`, for programmatic inspection.
 */
export declare class ArgumentValidationError extends Error {
    /** Structured issues from the underlying schema check. */
    readonly issues: z.ZodError['issues'];
    /** The raw zod error that triggered this. */
    readonly cause: z.ZodError;
    constructor(error: z.ZodError, value: unknown, label?: string);
}
/**
 * Parses `value` with `schema`, returning the typed result (with schema defaults applied).
 * Throws {@link ArgumentValidationError} on failure.
 *
 * The optional `label` names the interface being validated and is appended to every error line
 * (e.g. ``… at `maxRequestRetries` in `BasicCrawlerOptions` ``).
 * @internal
 */
export declare function parseArgument<TValue, TSchema extends z.ZodType>(value: TValue, schema: TSchema, label?: string): TValue & z.output<TSchema>;
