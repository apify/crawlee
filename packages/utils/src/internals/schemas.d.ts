import { BaseHttpClient } from '@crawlee/http-client';
import type { Dictionary } from '@crawlee/types';
import { z } from 'zod';
/**
 * Accepts any object (including arrays and functions).
 * @internal
 */
export declare const anyObject: z.ZodCustom<Dictionary, Dictionary>;
/**
 * Accepts any array without validating its items (cheap for huge arrays).
 * @internal
 */
export declare const anyArray: z.ZodCustom<unknown[], unknown[]>;
/**
 * Accepts any function.
 * @internal
 */
export declare const anyFunction: z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>;
/**
 * Mirrors `ow.number`: `Infinity` is a valid number, `NaN` is not.
 * @internal
 */
export declare const anyNumber: z.ZodCustom<number, number>;
/**
 * Accepts any object (including functions) that has all the given keys, own or inherited.
 * @internal
 */
export declare function objectWithKeys(keys: string[], message?: string): z.ZodType<Dictionary>;
/**
 * Accepts only instances of {@link BaseHttpClient} (all Crawlee HTTP clients extend it).
 * @internal
 */
export declare const httpClient: z.ZodCustom<BaseHttpClient, BaseHttpClient>;
/**
 * Accepts any object implementing the CrawleeLogger interface.
 * @internal
 */
export declare const logger: z.ZodType<Dictionary, unknown, z.core.$ZodTypeInternals<Dictionary, unknown>>;
/**
 * Accepts any typed array (`Uint8Array`, `Float64Array`, ...), but not a `DataView`.
 * @internal
 */
export declare const typedArray: z.ZodCustom<NodeJS.TypedArray<ArrayBufferLike>, NodeJS.TypedArray<ArrayBufferLike>>;
/**
 * Accepts any non-null, non-array object.
 * @internal
 */
export declare const plainObject: z.ZodCustom<Record<string, unknown>, Record<string, unknown>>;
/**
 * Shape of a request stored in a request queue.
 * @internal
 */
export declare const storageRequest: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodURL;
    uniqueKey: z.ZodString;
    method: z.ZodOptional<z.ZodString>;
    retryCount: z.ZodOptional<z.ZodNumber>;
    handledAt: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
}, z.core.$loose>;
/**
 * {@link storageRequest} before an id is assigned.
 * @internal
 */
export declare const storageRequestWithoutId: z.ZodObject<{
    url: z.ZodURL;
    uniqueKey: z.ZodString;
    method: z.ZodOptional<z.ZodString>;
    handledAt: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
    retryCount: z.ZodOptional<z.ZodNumber>;
}, z.core.$loose>;
/**
 * `z.array(item)` whose top-level type error names the element type — ``expected an array of numbers`` —
 * instead of zod's bare `expected array`. Element failures keep zod's per-index messages, and `elements`
 * is a human-readable plural (`'numbers'`, `'URL patterns'`), since element types cannot be introspected.
 * @internal
 */
export declare function arrayOf<TItem extends z.ZodType>(item: TItem, elements: string): z.ZodArray<TItem>;
/**
 * Batch of {@link storageRequestWithoutId}.
 * @internal
 */
export declare const storageRequestBatch: z.ZodArray<z.ZodObject<{
    url: z.ZodURL;
    uniqueKey: z.ZodString;
    method: z.ZodOptional<z.ZodString>;
    handledAt: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
    retryCount: z.ZodOptional<z.ZodNumber>;
}, z.core.$loose>>;
/**
 * Options of request queue add/update operations.
 * @internal
 */
export declare const requestQueueOperationOptions: z.ZodObject<{
    forefront: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
/**
 * Options of key-value store `listKeys`.
 * @internal
 */
export declare const keyValueStoreListKeysOptions: z.ZodObject<{
    prefix: z.ZodOptional<z.ZodString>;
    exclusiveStartKey: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
/**
 * Options of dataset item listing.
 * @internal
 */
export declare const datasetListItemsOptions: z.ZodObject<{
    desc: z.ZodOptional<z.ZodBoolean>;
    limit: z.ZodOptional<z.ZodNumber>;
    offset: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
