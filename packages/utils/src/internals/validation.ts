import { z } from 'zod';

/**
 * Thrown when an argument fails schema validation. Exposes the raw zod error as `validationError` (and `cause`).
 * @internal
 */
export class ArgumentValidationError extends Error {
    override readonly cause: z.ZodError;

    constructor(label: string, validationError: z.ZodError) {
        super(`Validation of argument '${label}' failed:\n${z.prettifyError(validationError)}`, {
            cause: validationError,
        });
        this.name = 'ArgumentValidationError';
        this.cause = validationError;
    }
}

/**
 * Parses `value` with `schema`, returning the typed result. Throws {@link ArgumentValidationError} on failure.
 * @internal
 */
export function parseArgument<TSchema extends z.ZodType>(
    value: unknown,
    label: string,
    schema: TSchema,
): z.output<TSchema> {
    try {
        return schema.parse(value);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new ArgumentValidationError(label, error);
        }

        throw error;
    }
}
