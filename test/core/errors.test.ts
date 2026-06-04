import { ArgumentValidationError } from '@crawlee/core';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

describe('ArgumentValidationError', () => {
    const schema = z
        .object({
            countryCode: z.string().regex(/^[A-Z]{2}$/),
            retries: z.number().optional(),
        })
        .strict();

    test('message names the offending field and the value it received', () => {
        const error = new ArgumentValidationError(schema.safeParse({ countryCode: 'CZE' }).error!, {
            countryCode: 'CZE',
        });

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('ArgumentValidationError');
        expect(error.message).toBe('Invalid string: must match pattern /^[A-Z]{2}$/ at `countryCode`, got `CZE`');
    });

    test('exposes structured issues and keeps the ZodError as cause', () => {
        const zodError = schema.safeParse({ retries: 'lots' }).error!;
        const error = new ArgumentValidationError(zodError, { retries: 'lots' });

        // `issues` is reachable directly, without digging into `cause`.
        expect(error.issues).toBe(zodError.issues);
        expect(error.issues.map((issue) => issue.path)).toContainEqual(['retries']);
        expect(error.cause).toBe(zodError);
    });
});
