import { Dataset, KeyValueStore, RequestQueue } from '@crawlee/core';
import { MemoryStorageEmulator } from '../../shared/MemoryStorageEmulator.js';

const localStorageEmulator = new MemoryStorageEmulator();

beforeEach(async () => {
    await localStorageEmulator.init();
});

afterAll(async () => {
    await localStorageEmulator.destroy();
});

describe('storage aliases', () => {
    describe('Dataset.open with alias', () => {
        test('should open a dataset with an alias', async () => {
            const dataset = await Dataset.open({ alias: 'my-data' });
            expect(dataset).toBeDefined();
            expect(dataset.id).toBeDefined();
            // Alias storages are unnamed
            expect(dataset.name).toBeUndefined();
        });

        test('should return the same instance for the same alias', async () => {
            const dataset1 = await Dataset.open({ alias: 'my-data' });
            const dataset2 = await Dataset.open({ alias: 'my-data' });
            expect(dataset1).toBe(dataset2);
        });

        test('should return different instances for different aliases', async () => {
            const dataset1 = await Dataset.open({ alias: 'data-a' });
            const dataset2 = await Dataset.open({ alias: 'data-b' });
            expect(dataset1).not.toBe(dataset2);
            expect(dataset1.id).not.toBe(dataset2.id);
        });

        test('alias storage should be independent from default storage', async () => {
            const defaultDataset = await Dataset.open();
            const aliasDataset = await Dataset.open({ alias: 'other' });
            expect(defaultDataset).not.toBe(aliasDataset);
            expect(defaultDataset.id).not.toBe(aliasDataset.id);
        });

        test('should store and retrieve data independently per alias', async () => {
            const datasetA = await Dataset.open({ alias: 'store-a' });
            const datasetB = await Dataset.open({ alias: 'store-b' });

            await datasetA.pushData({ source: 'a' });
            await datasetB.pushData({ source: 'b' });

            await expect(datasetA.getData()).resolves.toMatchObject({ items: [{ source: 'a' }] });
            await expect(datasetB.getData()).resolves.toMatchObject({ items: [{ source: 'b' }] });
        });
    });

    describe('KeyValueStore.open with alias', () => {
        test('should open a KVS with an alias', async () => {
            const store = await KeyValueStore.open({ alias: 'my-store' });
            expect(store).toBeDefined();
            expect(store.id).toBeDefined();
            expect(store.name).toBeUndefined();
        });

        test('should return the same instance for the same alias', async () => {
            const store1 = await KeyValueStore.open({ alias: 'my-store' });
            const store2 = await KeyValueStore.open({ alias: 'my-store' });
            expect(store1).toBe(store2);
        });

        test('should store and retrieve values independently per alias', async () => {
            const storeA = await KeyValueStore.open({ alias: 'kvs-a' });
            const storeB = await KeyValueStore.open({ alias: 'kvs-b' });

            await storeA.setValue('key', 'value-a');
            await storeB.setValue('key', 'value-b');

            await expect(storeA.getValue('key')).resolves.toBe('value-a');
            await expect(storeB.getValue('key')).resolves.toBe('value-b');
        });
    });

    describe('RequestQueue.open with alias', () => {
        test('should return the same instance for the same alias', async () => {
            const queue1 = await RequestQueue.open({ alias: 'my-queue' });
            const queue2 = await RequestQueue.open({ alias: 'my-queue' });
            expect(queue1).toBe(queue2);
        });

        test('should return different instances for different aliases', async () => {
            const queue1 = await RequestQueue.open({ alias: 'queue-a' });
            const queue2 = await RequestQueue.open({ alias: 'queue-b' });
            expect(queue1).not.toBe(queue2);
            expect(queue1.id).not.toBe(queue2.id);
        });
    });

    describe('name/alias conflict detection', () => {
        test('should throw when opening alias that conflicts with existing named dataset', async () => {
            await Dataset.open({ name: 'shared-name' });
            await expect(Dataset.open({ alias: 'shared-name' })).rejects.toThrow(
                /Cannot open storage with alias "shared-name" because a named storage with the same identifier already exists/,
            );
        });

        test('should throw when opening named dataset that conflicts with existing alias', async () => {
            await Dataset.open({ alias: 'shared-name' });
            await expect(Dataset.open({ name: 'shared-name' })).rejects.toThrow(
                /Cannot open storage with name "shared-name" because an alias storage with the same identifier already exists\. If you meant to open the alias storage, use \{ alias: "shared-name" \} instead\./,
            );
        });

        test('should throw when opening alias that conflicts with existing named KVS', async () => {
            await KeyValueStore.open({ name: 'shared-kvs' });
            await expect(KeyValueStore.open({ alias: 'shared-kvs' })).rejects.toThrow(
                /Cannot open storage with alias "shared-kvs" because a named storage with the same identifier already exists/,
            );
        });

        test('should not conflict across different storage types', async () => {
            // A dataset name and a KVS alias with the same string should not conflict
            await Dataset.open({ name: 'cross-type' });
            const store = await KeyValueStore.open({ alias: 'cross-type' });
            expect(store).toBeDefined();
        });
    });

    describe('string identifier vs alias conflict', () => {
        test('should throw when opening a string identifier that matches an existing alias', async () => {
            await Dataset.open({ alias: 'asdf' });
            // 'asdf' as a bare string resolves to { name: 'asdf' }, which should conflict with alias 'asdf'
            await expect(Dataset.open('asdf')).rejects.toThrow(
                /Cannot open storage with name "asdf" because an alias storage with the same identifier already exists\. If you meant to open the alias storage, use \{ alias: "asdf" \} instead\./,
            );
        });

        test('should throw when opening an alias that matches an existing string-opened storage', async () => {
            await Dataset.open('asdf');
            await expect(Dataset.open({ alias: 'asdf' })).rejects.toThrow(
                /Cannot open storage with alias "asdf" because a named storage with the same identifier already exists/,
            );
        });
    });

    describe('string identifier vs alias conflict (persistent storage)', () => {
        const persistentEmulator = new MemoryStorageEmulator();

        beforeEach(async () => {
            await persistentEmulator.init({ persistStorage: true });
        });

        afterAll(async () => {
            await persistentEmulator.destroy();
        });

        test('should throw when opening a string identifier that matches an existing alias on disk', async () => {
            await Dataset.open({ alias: 'on-disk' });
            // With persistence, the directory 'on-disk' exists on disk. storageExists() should
            // not be fooled into treating the string as an ID.
            await expect(Dataset.open('on-disk')).rejects.toThrow(
                /Cannot open storage with name "on-disk" because an alias storage with the same identifier already exists\. If you meant to open the alias storage, use \{ alias: "on-disk" \} instead\./,
            );
        });
    });

    describe('resolveStorageIdentifier', () => {
        test('null identifier opens default storage', async () => {
            const dataset1 = await Dataset.open(null);
            const dataset2 = await Dataset.open();
            expect(dataset1).toBe(dataset2);
        });

        test('undefined identifier opens default storage', async () => {
            const dataset1 = await Dataset.open(undefined);
            const dataset2 = await Dataset.open();
            expect(dataset1).toBe(dataset2);
        });

        test('empty object opens default storage', async () => {
            const dataset1 = await Dataset.open({});
            const dataset2 = await Dataset.open();
            expect(dataset1).toBe(dataset2);
        });

        test('string identifier opens named storage', async () => {
            const dataset = await Dataset.open('test-named');
            expect(dataset.name).toBe('test-named');
        });

        test('{ name } identifier opens named storage', async () => {
            const dataset = await Dataset.open({ name: 'test-named-obj' });
            expect(dataset.name).toBe('test-named-obj');
        });

        test('{ alias } identifier opens alias storage', async () => {
            const dataset = await Dataset.open({ alias: 'test-alias' });
            expect(dataset.name).toBeUndefined();
        });
    });

    describe('drop with alias', () => {
        test('should be able to drop an aliased dataset and re-open it', async () => {
            const dataset1 = await Dataset.open({ alias: 'droppable' });
            await dataset1.pushData({ foo: 'bar' });
            await dataset1.drop();

            const dataset2 = await Dataset.open({ alias: 'droppable' });
            expect(dataset2).not.toBe(dataset1);
            await expect(dataset2.getData()).resolves.toMatchObject({ items: [] });
        });
    });

    describe('concurrent alias opens', () => {
        test('should handle concurrent opens of the same alias', async () => {
            const [d1, d2, d3] = await Promise.all([
                Dataset.open({ alias: 'concurrent' }),
                Dataset.open({ alias: 'concurrent' }),
                Dataset.open({ alias: 'concurrent' }),
            ]);
            expect(d1).toBe(d2);
            expect(d2).toBe(d3);
        });
    });
});
