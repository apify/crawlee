import { rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import { MemoryStorage } from '@crawlee/memory-storage';

describe('storage name path traversal', () => {
    const tmpLocation = resolve(__dirname, './tmp/storage-name-path-traversal');

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    const storage = new MemoryStorage({
        localDataDirectory: tmpLocation,
        persistStorage: true,
        writeMetadata: true,
    });

    const traversalNames = ['../escaped', `..${sep}escaped`, resolve(tmpLocation, '..', 'escaped-absolute')];

    describe('getOrCreate rejects names that escape the storage directory', () => {
        test.each(traversalNames)('key-value store name %s', async (name) => {
            await expect(storage.keyValueStores().getOrCreate(name)).rejects.toThrow();
        });

        test.each(traversalNames)('dataset name %s', async (name) => {
            await expect(storage.datasets().getOrCreate(name)).rejects.toThrow();
        });

        test.each(traversalNames)('request queue name %s', async (name) => {
            await expect(storage.requestQueues().getOrCreate(name)).rejects.toThrow();
        });
    });

    test('rename via update rejects names that escape the storage directory', async () => {
        const info = await storage.keyValueStores().getOrCreate('legit-store');
        const client = storage.keyValueStore(info.id);

        await expect(client.update({ name: '../escaped-rename' })).rejects.toThrow();
    });

    test('legitimate names still work', async () => {
        const info = await storage.keyValueStores().getOrCreate('normal-name');
        const client = storage.keyValueStore(info.id);

        await expect(
            client.setRecord({ key: 'SAFEKEY', value: 'value', contentType: 'text/plain' }),
        ).resolves.not.toThrow();
    });
});
