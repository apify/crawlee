/**
 * Converts any iterable or async iterable to an async iterable.
 * @internal
 *
 * @yields Each item from the input iterable
 *
 * **Example usage:**
 * ```ts
 * const syncArray = [1, 2, 3];
 * for await (const item of asyncifyIterable(syncArray)) {
 *   console.log(item); // 1, 2, 3
 * }
 * ```
 */
export declare function asyncifyIterable<T>(iterable: Iterable<T> | AsyncIterable<T>): AsyncIterable<T>;
/**
 * Lazily splits the input async iterable into chunks of specified size.
 * The last chunk may contain fewer items if the total number of items
 * is not evenly divisible by the chunk size.
 * @internal
 *
 * @yields Arrays of items, each containing up to chunkSize items
 *
 * **Example usage:**
 * ```ts
 * const numbers = async function* () {
 *   for (let i = 1; i <= 10; i++) yield i;
 * };
 *
 * for await (const chunk of chunkedAsyncIterable(numbers(), 3)) {
 *   console.log(chunk); // [1, 2, 3], [4, 5, 6], [7, 8, 9], [10]
 * }
 * ```
 */
export declare function chunkedAsyncIterable<T>(iterable: AsyncIterable<T> | Iterable<T>, chunkSize: number | (() => number)): AsyncIterable<T[]>;
/**
 * An async iterator that also supports peeking at the next value without consuming it.
 * Extends both AsyncIterator and AsyncIterable interfaces.
 * @internal
 */
export interface PeekableAsyncIterator<T> extends AsyncIterator<T>, AsyncIterable<T> {
    /**
     * Peeks at the next value without consuming it from the iterator.
     * Subsequent calls to peek() will return the same value until next() is called.
     *
     * @returns Promise that resolves to the next value, or undefined if the iterator is exhausted
     */
    peek(): Promise<T | undefined>;
}
/**
 * An async iterable that yields peekable async iterators.
 * @internal
 */
export interface PeekableAsyncIterable<T> extends AsyncIterable<T> {
    [Symbol.asyncIterator](): PeekableAsyncIterator<T>;
}
/**
 * Wraps an async iterable to provide peek functionality, allowing you to look at
 * the next value without consuming it from the iterator.
 * @internal
 *
 * @param iterable - The async iterable to make peekable
 *
 * **Example usage:**
 * ```ts
 * const numbers = async function* () {
 *   yield 1; yield 2; yield 3;
 * };
 *
 * const peekable = peekableAsyncIterable(numbers());
 * const iterator = peekable[Symbol.asyncIterator]();
 *
 * console.log(await iterator.peek()); // 1 (doesn't consume)
 * console.log(await iterator.peek()); // 1 (still doesn't consume)
 * console.log(await iterator.next()); // { value: 1, done: false } (now consumed)
 * console.log(await iterator.peek()); // 2 (next value)
 * ```
 */
export declare function peekableAsyncIterable<T>(iterable: AsyncIterable<T> | Iterable<T>): PeekableAsyncIterable<T>;
