import { rm } from 'node:fs/promises';
import path from 'node:path';

import { MemoryStorage } from '@crawlee/memory-storage';
import type { DatasetClient, KeyValueStoreClient } from '@crawlee/types';

describe('Async iteration support', () => {
    const localDataDirectory = path.resolve(__dirname, './tmp/async-iteration');
    const storage = new MemoryStorage({
        localDataDirectory,
        persistStorage: false,
    });

    afterAll(async () => {
        await rm(localDataDirectory, { force: true, recursive: true });
    });

    describe('Dataset.getData / iterateItems', () => {
        const elements = Array.from({ length: 25 }, (_, i) => ({ index: i }));
        let dataset: DatasetClient<{ index: number }>;

        beforeAll(async () => {
            dataset = (await storage.createDatasetClient({ name: 'async-iteration-dataset' })) as DatasetClient<{
                index: number;
            }>;
            await dataset.pushData(elements);
        });

        test('getData returns a paginated result', async () => {
            const result = await dataset.getData({ limit: 10 });

            expect(result.items).toHaveLength(10);
            expect(result.total).toBe(25);
            expect(result.offset).toBe(0);
            expect(result.items).toStrictEqual(elements.slice(0, 10));
        });

        test('can be used with for await...of to iterate all items', async () => {
            const items: { index: number }[] = [];

            for await (const item of dataset.iterateItems()) {
                items.push(item);
            }

            expect(items).toHaveLength(25);
            expect(items).toStrictEqual(elements);
        });

        test('respects limit option when iterating', async () => {
            const items: { index: number }[] = [];

            for await (const item of dataset.iterateItems({ limit: 10 })) {
                items.push(item);
            }

            expect(items).toHaveLength(10);
            expect(items).toStrictEqual(elements.slice(0, 10));
        });

        test('respects offset option when iterating', async () => {
            const items: { index: number }[] = [];

            for await (const item of dataset.iterateItems({ offset: 5 })) {
                items.push(item);
            }

            expect(items).toHaveLength(20);
            expect(items).toStrictEqual(elements.slice(5));
        });

        test('respects both offset and limit options when iterating', async () => {
            const items: { index: number }[] = [];

            for await (const item of dataset.iterateItems({ offset: 5, limit: 10 })) {
                items.push(item);
            }

            expect(items).toHaveLength(10);
            expect(items).toStrictEqual(elements.slice(5, 15));
        });

        test('respects desc option when iterating', async () => {
            const items: { index: number }[] = [];

            for await (const item of dataset.iterateItems({ desc: true, limit: 5 })) {
                items.push(item);
            }

            expect(items).toHaveLength(5);
            expect(items).toStrictEqual(elements.slice().reverse().slice(0, 5));
        });
    });

    describe('KeyValueStore.iterateKeys', () => {
        const keys = Array.from({ length: 25 }, (_, i) => `key-${String(i).padStart(2, '0')}`);
        let kvStore: KeyValueStoreClient;

        beforeAll(async () => {
            kvStore = await storage.createKeyValueStoreClient({ name: 'async-iteration-kvs' });

            for (const key of keys) {
                await kvStore.setValue({ key, value: { data: key } });
            }
        });

        test('can be used with for await...of to iterate all keys', async () => {
            const items: string[] = [];

            for await (const item of kvStore.iterateKeys()) {
                items.push(item.key);
            }

            expect(items).toHaveLength(25);
            expect(items).toStrictEqual(keys);
        });

        test('respects prefix option when iterating', async () => {
            const items: string[] = [];

            // Only keys starting with 'key-0' (key-00 to key-09)
            for await (const item of kvStore.iterateKeys({ prefix: 'key-0' })) {
                items.push(item.key);
            }

            expect(items).toHaveLength(10);
            expect(items).toStrictEqual(keys.slice(0, 10));
        });
    });
});
