import type { Dictionary } from '@crawlee/types';
import { z } from 'zod';

/**
 * Accepts any object (including arrays and functions).
 * @internal
 */
export const anyObject = z.custom<Dictionary>(
    (value) => (typeof value === 'object' && value !== null) || typeof value === 'function',
    { message: 'Invalid input: expected object' },
);

/**
 * Accepts any array without validating its items (cheap for huge arrays).
 * @internal
 */
export const anyArray = z.custom<unknown[]>(Array.isArray, { message: 'Invalid input: expected array' });

/**
 * Accepts any function.
 * @internal
 */
export const anyFunction = z.custom<(...args: any[]) => unknown>((value) => typeof value === 'function', {
    message: 'Invalid input: expected function',
});

/**
 * Mirrors `ow.number`: `Infinity` is a valid number, `NaN` is not.
 * @internal
 */
export const anyNumber = z.custom<number>((value) => typeof value === 'number' && !Number.isNaN(value), {
    message: 'Invalid input: expected number',
});

/**
 * Accepts any object (including functions) that has all the given keys, own or inherited.
 * @internal
 */
export function objectWithKeys(keys: string[], message?: string): z.ZodType<Dictionary> {
    return z.custom<Dictionary>(
        (value) =>
            ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
            keys.every((key) => key in value),
        {
            message:
                message ?? `Invalid input: expected an object with keys ${keys.map((key) => `'${key}'`).join(', ')}`,
        },
    );
}

/**
 * Accepts any typed array (`Uint8Array`, `Float64Array`, ...), but not a `DataView`.
 * @internal
 */
export const typedArray = z.custom<NodeJS.TypedArray>(
    (value) => ArrayBuffer.isView(value) && !(value instanceof DataView),
    { message: 'Invalid input: expected a typed array' },
);

/**
 * Accepts any non-null, non-array object.
 * @internal
 */
export const plainObject = z.custom<Record<string, unknown>>(
    (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
    { message: 'Invalid input: expected an object' },
);

/**
 * Shape of a request stored in a request queue.
 * @internal
 */
export const storageRequest = z.looseObject({
    id: z.string(),
    url: z.url({ protocol: /^https?$/ }),
    uniqueKey: z.string(),
    method: z.string().optional(),
    retryCount: z.number().int().optional(),
    handledAt: z.union([z.string(), z.date()]).optional(),
});

/**
 * {@link storageRequest} before an id is assigned.
 * @internal
 */
export const storageRequestWithoutId = storageRequest.omit({ id: true });

/**
 * Batch of {@link storageRequestWithoutId}.
 * @internal
 */
export const storageRequestBatch = z.array(storageRequestWithoutId);

/**
 * Options of request queue add/update operations.
 * @internal
 */
export const requestQueueOperationOptions = z.object({
    forefront: z.boolean().optional(),
});

/**
 * Options of key-value store `listKeys`.
 * @internal
 */
export const keyValueStoreListKeysOptions = z.object({
    prefix: z.string().optional(),
    exclusiveStartKey: z.string().optional(),
    limit: z.number().int().gt(0).optional(),
});

/**
 * Options of dataset item listing.
 * @internal
 */
export const datasetListItemsOptions = z.object({
    desc: z.boolean().optional(),
    limit: z.number().int().optional(),
    offset: z.number().int().optional(),
});
