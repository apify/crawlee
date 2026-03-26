import { rm } from 'node:fs/promises';
import path from 'node:path';

import { MemoryStorage } from '@crawlee/memory-storage';
import type { DatasetClient, KeyValueStoreClient } from '@crawlee/types';
import { vi } from 'vitest';

import { createLazyIterablePromise } from '../src/utils';

describe('Async iteration support', () => {
    const localDataDirectory = path.resolve(__dirname, './tmp/async-iteration');
    const storage = new MemoryStorage({
        localDataDirectory,
        persistStorage: false,
    });

    afterAll(async () => {
        await rm(localDataDirectory, { force: true, recursive: true });
    });

    describe('Dataset.listItems', () => {
        const elements = Array.from({ length: 25 }, (_, i) => ({ index: i }));
        let dataset: DatasetClient;

        beforeAll(async () => {
            const { id } = await storage.datasets().getOrCreate('async-iteration-dataset');
            dataset = storage.dataset(id);
            await dataset.pushItems(elements);
        });

        test('can be awaited directly (backward compatibility)', async () => {
            const result = await dataset.listItems({ limit: 10 });

            expect(result.items).toHaveLength(10);
            expect(result.total).toBe(25);
            expect(result.offset).toBe(0);
            expect(result.items).toStrictEqual(elements.slice(0, 10));
        });

        test('can be used with for await...of to iterate all items', async () => {
            const items: { index: number }[] = [];

            for await (const item of dataset.listItems()) {
                items.push(item);
            }

            expect(items).toHaveLength(25);
            expect(items).toStrictEqual(elements);
        });

        test('respects limit option when iterating', async () => {
            const items: { index: number }[] = [];

            for await (const item of dataset.listItems({ limit: 10 })) {
                items.push(item);
            }

            expect(items).toHaveLength(10);
            expect(items).toStrictEqual(elements.slice(0, 10));
        });

        test('respects offset option when iterating', async () => {
            const items: { index: number }[] = [];

            for await (const item of dataset.listItems({ offset: 5 })) {
                items.push(item);
            }

            expect(items).toHaveLength(20);
            expect(items).toStrictEqual(elements.slice(5));
        });

        test('respects both offset and limit options when iterating', async () => {
            const items: { index: number }[] = [];

            for await (const item of dataset.listItems({ offset: 5, limit: 10 })) {
                items.push(item);
            }

            expect(items).toHaveLength(10);
            expect(items).toStrictEqual(elements.slice(5, 15));
        });

        test('respects desc option when iterating', async () => {
            const items: { index: number }[] = [];

            for await (const item of dataset.listItems({ desc: true, limit: 5 })) {
                items.push(item);
            }

            expect(items).toHaveLength(5);
            expect(items).toStrictEqual(elements.slice().reverse().slice(0, 5));
        });
    });

    describe('KeyValueStore.listKeys', () => {
        const keys = Array.from({ length: 25 }, (_, i) => `key-${String(i).padStart(2, '0')}`);
        let kvStore: KeyValueStoreClient;

        beforeAll(async () => {
            const { id } = await storage.keyValueStores().getOrCreate('async-iteration-kvs');
            kvStore = storage.keyValueStore(id);

            for (const key of keys) {
                await kvStore.setRecord({ key, value: { data: key } });
            }
        });

        test('can be awaited directly (backward compatibility)', async () => {
            const result = await kvStore.listKeys({ limit: 10 });

            expect(result.items).toHaveLength(10);
            expect(result.isTruncated).toBe(true);
            expect(result.items.map((i) => i.key)).toStrictEqual(keys.slice(0, 10));
        });

        test('can be used with for await...of to iterate all keys', async () => {
            const items: string[] = [];

            for await (const item of kvStore.listKeys()) {
                items.push(item.key);
            }

            expect(items).toHaveLength(25);
            expect(items).toStrictEqual(keys);
        });

        test('respects limit option when iterating (10 items, limit 2)', async () => {
            // Create a fresh store with exactly 10 items to match the reported bug scenario
            const { id } = await storage.keyValueStores().getOrCreate('limit-test-kvs');
            const testStore = storage.keyValueStore(id);

            for (let i = 0; i < 10; i++) {
                await testStore.setRecord({ key: `key-${i}`, value: `value-${i}` });
            }

            const items: string[] = [];

            // This should only return 2 items, matching apify-client behavior
            for await (const item of testStore.listKeys({ limit: 2 })) {
                items.push(item.key);
            }

            // Should only get 2 items, not all 10
            expect(items).toHaveLength(2);
        });

        test('respects exclusiveStartKey option when iterating', async () => {
            const items: string[] = [];

            // Start after key-04 (index 4), should get keys 5-24
            for await (const item of kvStore.listKeys({ exclusiveStartKey: 'key-04' })) {
                items.push(item.key);
            }

            expect(items).toHaveLength(20);
            expect(items).toStrictEqual(keys.slice(5));
        });

        test('respects prefix option when iterating', async () => {
            const items: string[] = [];

            // Only keys starting with 'key-0' (key-00 to key-09)
            for await (const item of kvStore.listKeys({ prefix: 'key-0' })) {
                items.push(item.key);
            }

            expect(items).toHaveLength(10);
            expect(items).toStrictEqual(keys.slice(0, 10));
        });
    });

    describe('KeyValueStore.keys', () => {
        const keys = Array.from({ length: 25 }, (_, i) => `key-${String(i).padStart(2, '0')}`);
        let kvStore: KeyValueStoreClient;

        beforeAll(async () => {
            const { id } = await storage.keyValueStores().getOrCreate('async-iteration-kvs-keys');
            kvStore = storage.keyValueStore(id);

            for (const key of keys) {
                await kvStore.setRecord({ key, value: { data: key } });
            }
        });

        test('can be awaited directly (backward compatibility)', async () => {
            const result = await kvStore.keys({ limit: 10 });

            // When awaited, returns the same structure as listKeys
            expect(result.items).toHaveLength(10);
            expect(result.isTruncated).toBe(true);
            expect(result.items.map((i) => i.key)).toStrictEqual(keys.slice(0, 10));
        });

        test('can be used with for await...of to iterate all keys as strings', async () => {
            const items: string[] = [];

            for await (const key of kvStore.keys()) {
                items.push(key);
            }

            expect(items).toHaveLength(25);
            expect(items).toStrictEqual(keys);
        });

        test('yields strings directly, not objects', async () => {
            // eslint-disable-next-line no-unreachable-loop
            for await (const key of kvStore.keys()) {
                expect(typeof key).toBe('string');
                break; // Only need to check the first one
            }
        });

        test('respects limit option when iterating', async () => {
            const items: string[] = [];

            for await (const key of kvStore.keys({ limit: 10 })) {
                items.push(key);
            }

            expect(items).toHaveLength(10);
            expect(items).toStrictEqual(keys.slice(0, 10));
        });

        test('respects exclusiveStartKey option when iterating', async () => {
            const items: string[] = [];

            // Start after key-04 (index 4), should get keys 5-24
            for await (const key of kvStore.keys({ exclusiveStartKey: 'key-04' })) {
                items.push(key);
            }

            expect(items).toHaveLength(20);
            expect(items).toStrictEqual(keys.slice(5));
        });

        test('respects prefix option when iterating', async () => {
            const items: string[] = [];

            // Only keys starting with 'key-0' (key-00 to key-09)
            for await (const key of kvStore.keys({ prefix: 'key-0' })) {
                items.push(key);
            }

            expect(items).toHaveLength(10);
            expect(items).toStrictEqual(keys.slice(0, 10));
        });

        test('respects both exclusiveStartKey and limit options', async () => {
            const items: string[] = [];

            for await (const key of kvStore.keys({ exclusiveStartKey: 'key-04', limit: 5 })) {
                items.push(key);
            }

            expect(items).toHaveLength(5);
            expect(items).toStrictEqual(keys.slice(5, 10));
        });
    });

    describe('KeyValueStore.values', () => {
        const keys = Array.from({ length: 25 }, (_, i) => `key-${String(i).padStart(2, '0')}`);
        let kvStore: KeyValueStoreClient;

        beforeAll(async () => {
            const { id } = await storage.keyValueStores().getOrCreate('async-iteration-kvs-values');
            kvStore = storage.keyValueStore(id);

            for (const key of keys) {
                await kvStore.setRecord({ key, value: { data: key } });
            }
        });

        test('can be awaited directly (backward compatibility)', async () => {
            const values = await kvStore.values({ limit: 10 });

            expect(values).toHaveLength(10);
            expect(Array.isArray(values)).toBe(true);
            expect(values[0]).toStrictEqual({ data: 'key-00' });
        });

        test('can be used with for await...of to iterate all values', async () => {
            const values: unknown[] = [];

            for await (const value of kvStore.values()) {
                values.push(value);
            }

            expect(values).toHaveLength(25);
            expect(values.every((v) => v && typeof v === 'object')).toBe(true);
        });

        test('yields values directly, not KeyValueStoreRecord objects', async () => {
            // eslint-disable-next-line no-unreachable-loop
            for await (const value of kvStore.values()) {
                // Should be the actual value, not a record wrapper
                expect(value).toStrictEqual({ data: 'key-00' });
                expect(value).not.toHaveProperty('contentType');
                break; // Only need to check the first one
            }
        });

        test('respects limit option when iterating', async () => {
            const values: unknown[] = [];

            for await (const value of kvStore.values({ limit: 10 })) {
                values.push(value);
            }

            expect(values).toHaveLength(10);
        });

        test('respects exclusiveStartKey option when iterating', async () => {
            const values: unknown[] = [];

            // Start after key-04 (index 4), should get keys 5-24
            for await (const value of kvStore.values({ exclusiveStartKey: 'key-04' })) {
                values.push(value);
            }

            expect(values).toHaveLength(20);
        });

        test('respects prefix option when iterating', async () => {
            const values: unknown[] = [];

            // Only keys starting with 'key-0' (key-00 to key-09)
            for await (const value of kvStore.values({ prefix: 'key-0' })) {
                values.push(value);
            }

            expect(values).toHaveLength(10);
        });

        test('fetches actual record values', async () => {
            const values: unknown[] = [];

            for await (const value of kvStore.values({ limit: 3 })) {
                values.push(value);
            }

            expect(values[0]).toStrictEqual({ data: 'key-00' });
            expect(values[1]).toStrictEqual({ data: 'key-01' });
            expect(values[2]).toStrictEqual({ data: 'key-02' });
        });
    });

    describe('KeyValueStore.entries', () => {
        const keys = Array.from({ length: 25 }, (_, i) => `key-${String(i).padStart(2, '0')}`);
        let kvStore: KeyValueStoreClient;

        beforeAll(async () => {
            const { id } = await storage.keyValueStores().getOrCreate('async-iteration-kvs-entries');
            kvStore = storage.keyValueStore(id);

            for (const key of keys) {
                await kvStore.setRecord({ key, value: { data: key } });
            }
        });

        test('can be awaited directly (backward compatibility)', async () => {
            const entries = await kvStore.entries({ limit: 10 });

            expect(entries).toHaveLength(10);
            expect(Array.isArray(entries)).toBe(true);
            // Each entry is a [key, value] tuple
            expect(entries[0][0]).toBe('key-00');
            expect(entries[0][1]).toStrictEqual({ data: 'key-00' });
        });

        test('can be used with for await...of to iterate all entries', async () => {
            const entries: [string, unknown][] = [];

            for await (const entry of kvStore.entries()) {
                entries.push(entry);
            }

            expect(entries).toHaveLength(25);
            expect(entries.map(([key]) => key)).toStrictEqual(keys);
        });

        test('yields [key, value] tuples', async () => {
            // eslint-disable-next-line no-unreachable-loop
            for await (const [key, value] of kvStore.entries()) {
                expect(typeof key).toBe('string');
                expect(key).toBe('key-00');
                expect(value).toStrictEqual({ data: 'key-00' });
                // Value should not be a record wrapper
                expect(value).not.toHaveProperty('contentType');
                break; // Only need to check the first one
            }
        });

        test('respects limit option when iterating', async () => {
            const entries: [string, unknown][] = [];

            for await (const entry of kvStore.entries({ limit: 10 })) {
                entries.push(entry);
            }

            expect(entries).toHaveLength(10);
            expect(entries.map(([key]) => key)).toStrictEqual(keys.slice(0, 10));
        });

        test('respects exclusiveStartKey option when iterating', async () => {
            const entries: [string, unknown][] = [];

            // Start after key-04 (index 4), should get keys 5-24
            for await (const entry of kvStore.entries({ exclusiveStartKey: 'key-04' })) {
                entries.push(entry);
            }

            expect(entries).toHaveLength(20);
            expect(entries.map(([key]) => key)).toStrictEqual(keys.slice(5));
        });

        test('respects prefix option when iterating', async () => {
            const entries: [string, unknown][] = [];

            // Only keys starting with 'key-0' (key-00 to key-09)
            for await (const entry of kvStore.entries({ prefix: 'key-0' })) {
                entries.push(entry);
            }

            expect(entries).toHaveLength(10);
            expect(entries.map(([key]) => key)).toStrictEqual(keys.slice(0, 10));
        });

        test('values in entries match expected data', async () => {
            for await (const [key, value] of kvStore.entries({ limit: 5 })) {
                expect(value).toStrictEqual({ data: key });
            }
        });
    });

    describe('createLazyIterablePromise', () => {
        test('promise factory is not called until awaited', async () => {
            const promiseFactory = vi.fn(() => Promise.resolve([1, 2, 3]));
            async function* iteratorFactory() {
                yield 1;
                yield 2;
                yield 3;
            }

            const result = createLazyIterablePromise<number[], number>(promiseFactory, iteratorFactory);

            // Factory should not be called yet
            expect(promiseFactory).not.toHaveBeenCalled();

            // Now await it
            const values = await result;
            expect(promiseFactory).toHaveBeenCalledTimes(1);
            expect(values).toStrictEqual([1, 2, 3]);
        });

        test('iterating does not trigger the promise factory', async () => {
            const promiseFactory = vi.fn(() => Promise.resolve([1, 2, 3]));
            async function* iteratorFactory() {
                yield 10;
                yield 20;
                yield 30;
            }

            const result = createLazyIterablePromise<number[], number>(promiseFactory, iteratorFactory);

            const items: number[] = [];
            for await (const item of result) {
                items.push(item);
            }

            expect(items).toStrictEqual([10, 20, 30]);
            expect(promiseFactory).not.toHaveBeenCalled();
        });

        test('promise factory result is cached across multiple awaits', async () => {
            const promiseFactory = vi.fn(() => Promise.resolve([1, 2, 3]));
            async function* iteratorFactory() {
                yield 1;
            }

            const result = createLazyIterablePromise<number[], number>(promiseFactory, iteratorFactory);

            await result;
            await result;
            await result;

            expect(promiseFactory).toHaveBeenCalledTimes(1);
        });
    });

    describe('KeyValueStore.values lazy promise behavior', () => {
        let kvStore: KeyValueStoreClient;

        beforeAll(async () => {
            const { id } = await storage.keyValueStores().getOrCreate('lazy-test-kvs-values');
            kvStore = storage.keyValueStore(id);

            for (let i = 0; i < 5; i++) {
                await kvStore.setRecord({ key: `key-${i}`, value: { data: i } });
            }
        });

        test('calling values() does not immediately fetch records', async () => {
            const getRecordSpy = vi.spyOn(kvStore, 'getRecord');

            // Call values() but do not await or iterate
            const result = kvStore.values();

            // getRecord should not have been called yet (lazy)
            // Note: keys may be fetched eagerly, but record values should not
            // We need to wait a tick to ensure no async work triggered getRecord
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(getRecordSpy).not.toHaveBeenCalled();

            // Clean up: consume the result to avoid dangling promises
            await result;
            getRecordSpy.mockRestore();
        });

        test('iterating and awaiting produce the same values', async () => {
            const awaited = await kvStore.values();

            const iterated: unknown[] = [];
            for await (const value of kvStore.values()) {
                iterated.push(value);
            }

            expect(awaited).toStrictEqual(iterated);
        });
    });

    describe('KeyValueStore.entries lazy promise behavior', () => {
        let kvStore: KeyValueStoreClient;

        beforeAll(async () => {
            const { id } = await storage.keyValueStores().getOrCreate('lazy-test-kvs-entries');
            kvStore = storage.keyValueStore(id);

            for (let i = 0; i < 5; i++) {
                await kvStore.setRecord({ key: `key-${i}`, value: { data: i } });
            }
        });

        test('calling entries() does not immediately fetch records', async () => {
            const getRecordSpy = vi.spyOn(kvStore, 'getRecord');

            const result = kvStore.entries();

            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(getRecordSpy).not.toHaveBeenCalled();

            await result;
            getRecordSpy.mockRestore();
        });

        test('iterating and awaiting produce the same entries', async () => {
            const awaited = await kvStore.entries();

            const iterated: [string, unknown][] = [];
            for await (const entry of kvStore.entries()) {
                iterated.push(entry);
            }

            expect(awaited).toStrictEqual(iterated);
        });
    });
});
