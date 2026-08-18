/**
 * Resolves `segment` against `baseDirectory` and ensures the result stays within `baseDirectory`.
 * Storage names and record keys are used as filesystem path components, so a value containing `..`
 * or an absolute path could otherwise escape the intended directory.
 */
export declare function resolveWithinDirectory(baseDirectory: string, segment: string): string;
/**
 * Removes all properties with a null value
 * from the provided object.
 */
export declare function purgeNullsFromObject<T>(object: T): T;
/**
 * Creates a standard request ID (same as Platform).
 */
export declare function uniqueKeyToRequestId(uniqueKey: string): string;
export { isBuffer, isStream, toBuffer } from '../byte_utils.js';
