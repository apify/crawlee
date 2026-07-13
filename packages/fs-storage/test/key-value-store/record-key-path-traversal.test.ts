import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageBackend } from '@crawlee/fs-storage';

// On-disk file naming/encoding is the native `@crawlee/fs-storage-native` client's concern (see
// `special-keys.test.ts`), so these tests only assert through the public API rather than reaching
// for specific file paths on disk.
describe('record key path traversal', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/record-key-path-traversal');

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    const storage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation });

    test('setValue rejects a key that escapes the store directory', async () => {
        const client = await storage.createKeyValueStoreBackend({ name: 'record-key-store' });

        await expect(
            client.setValue({ key: '../escaped-record', value: 'pwned', contentType: 'text/plain' }),
        ).rejects.toThrow();
    });

    test('setValue still works for a regular key', async () => {
        const client = await storage.createKeyValueStoreBackend({ name: 'record-key-store-ok' });

        await expect(
            client.setValue({ key: 'SAFEKEY', value: 'value', contentType: 'text/plain' }),
        ).resolves.not.toThrow();

        expect(await client.recordExists('SAFEKEY')).toBe(true);
    });
});
