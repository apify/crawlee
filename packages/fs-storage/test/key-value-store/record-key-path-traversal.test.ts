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

    test('setValue contains a key that looks like a traversal attempt within the store', async () => {
        const client = await storage.createKeyValueStoreBackend({ name: 'record-key-store' });
        const otherClient = await storage.createKeyValueStoreBackend({ name: 'record-key-store-other' });

        // The native client encodes the whole key as a single opaque filename (see `special-keys.test.ts`,
        // where keys containing `/` round-trip rather than being rejected), so a `..`-containing key can't
        // resolve outside the store directory the way a naive `resolve(storeDir, key)` would. It's therefore
        // treated like any other key: stored, retrievable, and scoped to this store.
        await client.setValue({ key: '../escaped-record', value: 'pwned', contentType: 'text/plain' });

        expect(await client.recordExists('../escaped-record')).toBe(true);
        const record = await client.getValue('../escaped-record');
        expect(record?.value).toStrictEqual(Buffer.from('pwned'));

        // Confirm it didn't land in a sibling store either.
        expect(await otherClient.recordExists('../escaped-record')).toBe(false);
    });

    test('setValue still works for a regular key', async () => {
        const client = await storage.createKeyValueStoreBackend({ name: 'record-key-store-ok' });

        await expect(
            client.setValue({ key: 'SAFEKEY', value: 'value', contentType: 'text/plain' }),
        ).resolves.not.toThrow();

        expect(await client.recordExists('SAFEKEY')).toBe(true);
    });
});
