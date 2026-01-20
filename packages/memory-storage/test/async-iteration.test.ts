import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { MemoryStorage } from '@crawlee/memory-storage';
import type { DatasetClient, KeyValueStoreClient } from '@crawlee/types';

describe('Async iteration support', () => {
    const localDataDirectory = resolve(__dirname, './tmp/async-iteration');
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
});
