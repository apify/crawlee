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

// Source - https://stackoverflow.com/a/71288323
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
export async function* mergeAsyncIterables<T>(...iterables: AsyncIterable<T>[]): AsyncIterable<T> {
    const asyncIterators = iterables.map((iterable) => iterable[Symbol.asyncIterator]());
    const results = [];
    let count = asyncIterators.length;
    const never: Promise<never> = new Promise(() => {});
    async function getNext(asyncIterator: AsyncIterator<T>, index: number) {
        const result = await asyncIterator.next();
        return {
            index,
            result,
        };
    }
    const nextPromises = asyncIterators.map(getNext);
    try {
        while (count) {
            const { index, result } = await Promise.race(nextPromises);
            if (result.done) {
                nextPromises[index] = never;
                results[index] = result.value;
                count--;
            } else {
                nextPromises[index] = getNext(asyncIterators[index], index);
                yield result.value;
            }
        }
    } finally {
        for (const [index, iterator] of asyncIterators.entries()) {
            // no await here - see https://github.com/tc39/proposal-async-iteration/issues/126
            if (nextPromises[index] !== never && iterator.return != null) void iterator.return();
        }
    }
    return results;
}
