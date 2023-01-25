// https://github.com/apify/crawlee/issues/1732
// https://github.com/apify/crawlee/issues/1710

import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MemoryStorage } from '@crawlee/memory-storage';
import type { KeyValueStoreClient, KeyValueStoreInfo } from '@crawlee/types';

describe('MemoryStorage should not crash when saving a big buffer', () => {
    const tmpLocation = resolve(__dirname, './tmp/no-buffer-crash');
    const storage = new MemoryStorage({
        localDataDirectory: tmpLocation,
        persistStorage: false,
    });

    let kvs: KeyValueStoreInfo;
    let store: KeyValueStoreClient;

    beforeAll(async () => {
        kvs = await storage.keyValueStores().getOrCreate();
        store = storage.keyValueStore(kvs.id);
    });

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('should not crash when saving a big buffer', async () => {
        let zip: Buffer;

        if (process.env.CRAWLEE_DIFFICULT_TESTS) {
            const numbers = Array.from(([...Array(18_100_000).keys()]).map((i) => i * 3_000_000));

            zip = Buffer.from([...numbers]);
        } else {
            zip = Buffer.from([...Array(100_000)].map((i) => i * 8));
        }

        try {
            await store.setRecord({ key: 'owo.zip', value: zip });
        } catch (err) {
            expect(err).not.toBeDefined();
        }
    });
});
