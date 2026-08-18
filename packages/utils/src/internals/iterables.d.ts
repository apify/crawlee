/**
 * Type guard that checks if a value is iterable (has Symbol.iterator).
 * @internal
 *
 * **Example usage:**
 * ```ts
 * if (isIterable(someValue)) {
 *   for (const item of someValue) {
 *     console.log(item);
 *   }
 * }
 * ```
 */
export declare function isIterable<T>(value: unknown): value is Iterable<T>;
/**
 * Type guard that checks if a value is async iterable (has Symbol.asyncIterator).
 * @internal
 *
 * **Example usage:**
 * ```ts
 * if (isAsyncIterable(someValue)) {
 *   for await (const item of someValue) {
 *     console.log(item);
 *   }
 * }
 * ```
 */
export declare function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T>;
/**
 * Merges multiple async iterables into a single async iterable, yielding values concurrently.
 *
 * **Example usage:**
 * ```ts
 * const asyncIterable1 = async function* () {
 *   yield 1; yield 3; yield 5;
 * };
 *
 * const asyncIterable2 = async function* () {
 *   yield 2; yield 4; yield 6;
 * };
 *
 * for await (const value of mergeAsyncIterables(asyncIterable1(), asyncIterable2())) {
 *   console.log(value);
 * }
 * ```
 */
export declare function mergeAsyncIterables<T>(...iterables: AsyncIterable<T>[]): AsyncIterable<T>;
