import { asyncifyIterable, chunkedAsyncIterable, peekableAsyncIterable } from '@crawlee/utils';
import { describe, expect, it } from 'vitest';

describe('asyncifyIterable', () => {
    it('should convert a regular array to async iterable', async () => {
        const asyncIterable = asyncifyIterable([1, 2, 3, 4, 5]);

        const result = [];
        for await (const item of asyncIterable) {
            result.push(item);
        }

        expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle empty arrays', async () => {
        const asyncIterable = asyncifyIterable([]);

        const result: unknown[] = [];
        for await (const item of asyncIterable) {
            result.push(item);
        }

        expect(result).toEqual([]);
    });

    it('should work with Set', async () => {
        const asyncIterable = asyncifyIterable(new Set([1, 2, 3, 2, 1]));

        const result = [];
        for await (const item of asyncIterable) {
            result.push(item);
        }

        expect(result).toEqual([1, 2, 3]);
    });

    it('should work with generator function', async () => {
        function* generator() {
            yield 1;
            yield 2;
            yield 3;
        }

        const asyncIterable = asyncifyIterable(generator());

        const result = [];
        for await (const item of asyncIterable) {
            result.push(item);
        }

        expect(result).toEqual([1, 2, 3]);
    });
});

describe('chunkedAsyncIterable', () => {
    it('should chunk an async iterable into specified sizes', async () => {
        const asyncIterable = asyncifyIterable([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

        const result = [];
        for await (const chunk of chunkedAsyncIterable(asyncIterable, 3)) {
            result.push(chunk);
        }

        expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
    });

    it('should handle chunk size of 1', async () => {
        const asyncIterable = asyncifyIterable([1, 2, 3]);

        const result = [];
        for await (const chunk of chunkedAsyncIterable(asyncIterable, 1)) {
            result.push(chunk);
        }

        expect(result).toEqual([[1], [2], [3]]);
    });

    it('should handle chunk size larger than input', async () => {
        const asyncIterable = asyncifyIterable([1, 2, 3]);
        const chunked = chunkedAsyncIterable(asyncIterable, 10);

        const result = [];
        for await (const chunk of chunked) {
            result.push(chunk);
        }

        expect(result).toEqual([[1, 2, 3]]);
    });

    it('should handle empty async iterable', async () => {
        const asyncIterable = asyncifyIterable([]);

        const result = [];
        for await (const chunk of chunkedAsyncIterable(asyncIterable, 3)) {
            result.push(chunk);
        }

        expect(result).toEqual([]);
    });

    it('should throw error for invalid chunk size', async () => {
        const input = [1, 2, 3];
        const asyncIterable = asyncifyIterable(input);

        await expect(
            (async () => {
                for await (const _ of chunkedAsyncIterable(asyncIterable, 0)) {
                    // Empty block
                }
            })(),
        ).rejects.toThrow();
        await expect(
            (async () => {
                for await (const _ of chunkedAsyncIterable(asyncIterable, -1)) {
                    // Empty block
                }
            })(),
        ).rejects.toThrow();
    });
});

describe('peekableAsyncIterable', () => {
    it('should allow peeking at the next value without advancing', async () => {
        const iterable = peekableAsyncIterable(asyncifyIterable([1, 2, 3]));
        const iterator = iterable[Symbol.asyncIterator]();

        const peeked = await iterator.peek();
        expect(peeked).toBe(1);

        // Peeking again should return the same value
        const peekedAgain = await iterator.peek();
        expect(peekedAgain).toBe(1);

        // Now iterate and verify we get the peeked value first
        const results = [];
        for await (const value of iterable) {
            results.push(value);
        }

        expect(results).toEqual([1, 2, 3]);
    });

    it('should return undefined when peeking at empty iterable', async () => {
        const iterable = peekableAsyncIterable(asyncifyIterable([]));
        const iterator = iterable[Symbol.asyncIterator]();

        const peeked = await iterator.peek();
        expect(peeked).toBeUndefined();
    });

    it('should handle peek after exhausting the iterable', async () => {
        const iterable = peekableAsyncIterable(asyncifyIterable([1]));

        // Consume the iterable
        const results = [];
        for await (const value of iterable) {
            results.push(value);
        }
        expect(results).toEqual([1]);

        // Get a fresh iterator and peek should return undefined
        const iterator = iterable[Symbol.asyncIterator]();
        const peeked = await iterator.peek();
        expect(peeked).toBeUndefined();
    });

    it('should work with manual iteration', async () => {
        const iterable = peekableAsyncIterable(asyncifyIterable([10, 20, 30]));
        const iterator = iterable[Symbol.asyncIterator]();

        // Peek first
        expect(await iterator.peek()).toBe(10);

        const first = await iterator.next();
        expect(first.value).toBe(10);
        expect(first.done).toBe(false);
        expect(await iterator.peek()).toBe(20);

        const second = await iterator.next();
        expect(second.value).toBe(20);
        expect(second.done).toBe(false);
        expect(await iterator.peek()).toBe(30);

        const third = await iterator.next();
        expect(third.value).toBe(30);
        expect(third.done).toBe(false);
        expect(await iterator.peek()).toBe(undefined);

        const done = await iterator.next();
        expect(done.done).toBe(true);
        expect(await iterator.peek()).toBe(undefined);
    });

    it('should handle peek on single element iterable', async () => {
        const iterable = peekableAsyncIterable(asyncifyIterable([42]));
        const iterator = iterable[Symbol.asyncIterator]();

        expect(await iterator.peek()).toBe(42);

        const results = [];
        for await (const value of iterable) {
            results.push(value);
        }

        expect(results).toEqual([42]);

        // Get a fresh iterator and peek after exhaustion
        const newIterator = iterable[Symbol.asyncIterator]();
        expect(await newIterator.peek()).toBeUndefined();
    });
});
