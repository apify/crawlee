import { rm } from 'node:fs/promises';
import path from 'node:path';

import { FileSystemStorageBackend } from '@crawlee/fs-storage';
import type { DatasetBackend, KeyValueStoreBackend } from '@crawlee/types';

describe('Async iteration support', () => {
    const localDataDirectory = path.resolve(__dirname, './tmp/async-iteration');
    const storage = new FileSystemStorageBackend({
        localDataDirectory,
    });

    afterAll(async () => {
        await rm(localDataDirectory, { force: true, recursive: true });
    });

    describe('Dataset.getData', () => {
        const elements = Array.from({ length: 25 }, (_, i) => ({ index: i }));
        let dataset: DatasetBackend<{ index: number }>;

        beforeAll(async () => {
            dataset = (await storage.createDatasetBackend({ name: 'async-iteration-dataset' })) as DatasetBackend<{
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

        test('respects limit option', async () => {
            const result = await dataset.getData({ limit: 10 });

            expect(result.items).toHaveLength(10);
            expect(result.items).toStrictEqual(elements.slice(0, 10));
        });

        test('respects offset option', async () => {
            const result = await dataset.getData({ offset: 5 });

            expect(result.items).toHaveLength(20);
            expect(result.items).toStrictEqual(elements.slice(5));
        });

        test('respects both offset and limit options', async () => {
            const result = await dataset.getData({ offset: 5, limit: 10 });

            expect(result.items).toHaveLength(10);
            expect(result.items).toStrictEqual(elements.slice(5, 15));
        });

        test('respects desc option', async () => {
            const result = await dataset.getData({ desc: true, limit: 5 });

            expect(result.items).toHaveLength(5);
            expect(result.items).toStrictEqual(elements.slice().reverse().slice(0, 5));
        });
    });

    describe('KeyValueStore.listKeys', () => {
        const keys = Array.from({ length: 25 }, (_, i) => `key-${String(i).padStart(2, '0')}`);
        let kvStore: KeyValueStoreBackend;

        beforeAll(async () => {
            kvStore = await storage.createKeyValueStoreBackend({ name: 'async-iteration-kvs' });

            for (const key of keys) {
                // The client is a byte transport: values arrive already serialized from the frontend
                // codec, so pass a string + content type rather than a raw object.
                await kvStore.setValue({
                    key,
                    value: JSON.stringify({ data: key }),
                    contentType: 'application/json; charset=utf-8',
                });
            }
        });

        test('returns all keys', async () => {
            const { items } = await kvStore.listKeys();

            expect(items).toHaveLength(25);
            expect(items.map((i) => i.key)).toStrictEqual(keys);
        });

        test('respects prefix option', async () => {
            // Only keys starting with 'key-0' (key-00 to key-09)
            const { items } = await kvStore.listKeys({ prefix: 'key-0' });

            expect(items).toHaveLength(10);
            expect(items.map((i) => i.key)).toStrictEqual(keys.slice(0, 10));
        });

        test('respects exclusiveStartKey option', async () => {
            const { items } = await kvStore.listKeys({ exclusiveStartKey: 'key-09' });

            expect(items).toHaveLength(15);
            expect(items.map((i) => i.key)).toStrictEqual(keys.slice(10));
        });

        test('respects limit option', async () => {
            const { items } = await kvStore.listKeys({ limit: 5 });

            expect(items).toHaveLength(5);
            expect(items.map((i) => i.key)).toStrictEqual(keys.slice(0, 5));
        });

        test('respects exclusiveStartKey and limit together', async () => {
            const { items } = await kvStore.listKeys({ exclusiveStartKey: 'key-04', limit: 5 });

            expect(items).toHaveLength(5);
            expect(items.map((i) => i.key)).toStrictEqual(keys.slice(5, 10));
        });
    });
});
