import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { MemoryStorage } from '@crawlee/memory-storage';
import { pathExists } from 'fs-extra';

import { waitTillWrittenToDisk } from '../__shared__';

describe('record key path traversal', () => {
    const tmpLocation = resolve(__dirname, './tmp/record-key-path-traversal');

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    const storage = new MemoryStorage({
        localDataDirectory: tmpLocation,
        persistStorage: true,
        writeMetadata: true,
    });

    test('setRecord rejects a key that escapes the store directory', async () => {
        const info = await storage.keyValueStores().getOrCreate('record-key-store');
        const client = storage.keyValueStore(info.id);

        await expect(
            client.setRecord({ key: '../escaped-record', value: 'pwned', contentType: 'text/plain' }),
        ).rejects.toThrow();

        // The escaped file must not have been created outside the store directory.
        await expect(pathExists(resolve(storage.keyValueStoresDirectory, 'escaped-record.txt'))).resolves.toBe(false);
    });

    test('setRecord still works for a regular key', async () => {
        const info = await storage.keyValueStores().getOrCreate('record-key-store-ok');
        const client = storage.keyValueStore(info.id);

        await expect(
            client.setRecord({ key: 'SAFEKEY', value: 'value', contentType: 'text/plain' }),
        ).resolves.not.toThrow();

        // The store was opened by name, so it lives under its name directory.
        const storePath = resolve(storage.keyValueStoresDirectory, info.name!);
        await waitTillWrittenToDisk(resolve(storePath, 'SAFEKEY.txt'));
        await expect(pathExists(resolve(storePath, 'SAFEKEY.txt'))).resolves.toBe(true);
    });
});
