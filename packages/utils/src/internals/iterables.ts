import { inspect } from 'node:util';

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
export function isIterable<T>(value: unknown): value is Iterable<T> {
    if (value == null || typeof value === 'string' || ArrayBuffer.isView(value)) {
        return false;
    }

    if (Array.isArray(value)) {
        return true;
    }

    return typeof Object(value)[Symbol.iterator] === 'function';
}

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
export function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
    if (value == null || typeof value === 'string' || ArrayBuffer.isView(value)) {
        return false;
    }

    return typeof Object(value)[Symbol.asyncIterator] === 'function';
}

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
export async function* asyncifyIterable<T>(iterable: Iterable<T> | AsyncIterable<T>): AsyncIterable<T> {
    yield* iterable;
}

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
export async function* chunkedAsyncIterable<T>(
    iterable: AsyncIterable<T> | Iterable<T>,
    chunkSize: number,
): AsyncIterable<T[]> {
    if (typeof chunkSize !== 'number' || chunkSize < 1) {
        throw new Error(`Chunk size must be a positive number (${inspect(chunkSize)}) received`);
    }

    let chunk: T[] = [];

    for await (const item of iterable) {
        chunk.push(item);

        if (chunk.length >= chunkSize) {
            yield chunk;
            chunk = [];
        }
    }

    if (chunk.length) {
        yield chunk;
    }
}

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
export function peekableAsyncIterable<T>(iterable: AsyncIterable<T> | Iterable<T>): PeekableAsyncIterable<T> {
    const iterator = asyncifyIterable(iterable)[Symbol.asyncIterator]();
    let peekedValue: { done: boolean; value: T } | undefined;
    let isExhausted = false;

    const peekableIterator: PeekableAsyncIterator<T> = {
        async next(): Promise<IteratorResult<T>> {
            // If we have peeked a value, return it and clear the peek
            if (peekedValue !== undefined) {
                const result = peekedValue;
                peekedValue = undefined;

                if (result.done) {
                    isExhausted = true;
                    return { done: true, value: undefined };
                }

                return { done: false, value: result.value };
            }

            if (isExhausted) {
                return { done: true, value: undefined };
            }

            const result = await iterator.next();

            if (result.done) {
                isExhausted = true;
            }

            return result;
        },

        async peek(): Promise<T | undefined> {
            if (peekedValue !== undefined) {
                return peekedValue.done ? undefined : peekedValue.value;
            }

            if (isExhausted) {
                return undefined;
            }

            const result = await iterator.next();
            peekedValue = { done: result.done ?? false, value: result.value };

            if (result.done) {
                isExhausted = true;
                return undefined;
            }

            return result.value;
        },

        [Symbol.asyncIterator]() {
            return this;
        },
    };

    return {
        [Symbol.asyncIterator]() {
            return peekableIterator;
        },
    };
}
