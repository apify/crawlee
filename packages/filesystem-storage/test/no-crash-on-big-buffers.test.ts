// https://github.com/apify/crawlee/issues/1732
// https://github.com/apify/crawlee/issues/1710

import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageClient } from '@crawlee/filesystem-storage';
import type { KeyValueStoreClient } from '@crawlee/types';

describe('FileSystemStorageClient should not crash when saving a big buffer', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/no-buffer-crash');
    const storage = new FileSystemStorageClient({
        localDataDirectory: tmpLocation,
    });

    let store: KeyValueStoreClient;

    beforeAll(async () => {
        store = await storage.createKeyValueStoreClient();
    });

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('should not crash when saving a big buffer', async () => {
        let zip: Buffer;

        if (process.env.CRAWLEE_DIFFICULT_TESTS) {
            const numbers = Array.from([...Array(18_100_000).keys()].map((i) => i * 3_000_000));

            zip = Buffer.from([...numbers]);
        } else {
            zip = Buffer.from([...Array(100_000)].map((i) => i * 8));
        }

        try {
            await store.setValue({ key: 'owo.zip', value: zip });
        } catch (err) {
            expect(err).not.toBeDefined();
        }
    });
});
