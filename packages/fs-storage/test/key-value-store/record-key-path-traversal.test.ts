import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageClient } from '@crawlee/fs-storage';
import { pathExists } from 'fs-extra/esm';

import { waitTillWrittenToDisk } from '../__shared__.js';

describe('record key path traversal', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/record-key-path-traversal');

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    const storage = new FileSystemStorageClient({
        localDataDirectory: tmpLocation,
        writeMetadata: true,
    });

    test('setValue rejects a key that escapes the store directory', async () => {
        const client = await storage.createKeyValueStoreClient({ name: 'record-key-store' });

        await expect(
            client.setValue({ key: '../escaped-record', value: 'pwned', contentType: 'text/plain' }),
        ).rejects.toThrow();

        // The escaped file must not have been created outside the store directory.
        await expect(pathExists(resolve(storage.keyValueStoresDirectory, 'escaped-record.txt'))).resolves.toBe(
            false,
        );
    });

    test('setValue still works for a regular key', async () => {
        const client = await storage.createKeyValueStoreClient({ name: 'record-key-store-ok' });

        await expect(
            client.setValue({ key: 'SAFEKEY', value: 'value', contentType: 'text/plain' }),
        ).resolves.not.toThrow();

        // The store was opened by name, so it lives under its name directory.
        const storePath = resolve(storage.keyValueStoresDirectory, (await client.getMetadata()).name!);
        await waitTillWrittenToDisk(resolve(storePath, 'SAFEKEY.txt'));
        await expect(pathExists(resolve(storePath, 'SAFEKEY.txt'))).resolves.toBe(true);
    });
});
