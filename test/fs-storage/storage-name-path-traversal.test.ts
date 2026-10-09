import { rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import { FileSystemStorageBackend } from '@crawlee/fs-storage';

describe('storage name path traversal', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/storage-name-path-traversal');

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    const storage = new FileSystemStorageBackend({
        localDataDirectory: tmpLocation,
    });

    const traversalNames = ['../escaped', `..${sep}escaped`, resolve(tmpLocation, '..', 'escaped-absolute')];

    describe('createXBackend rejects names that escape the storage directory', () => {
        test.each(traversalNames)('key-value store name %s', async (name) => {
            await expect(storage.createKeyValueStoreBackend({ name })).rejects.toThrow();
        });

        test.each(traversalNames)('dataset name %s', async (name) => {
            await expect(storage.createDatasetBackend({ name })).rejects.toThrow();
        });

        test.each(traversalNames)('request queue name %s', async (name) => {
            await expect(storage.createRequestQueueBackend({ name })).rejects.toThrow();
        });
    });

    test('legitimate names still work', async () => {
        const client = await storage.createKeyValueStoreBackend({ name: 'normal-name' });

        await expect(
            client.setValue({ key: 'SAFEKEY', value: 'value', contentType: 'text/plain' }),
        ).resolves.not.toThrow();
    });
});
