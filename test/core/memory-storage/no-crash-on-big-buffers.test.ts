// https://github.com/apify/crawlee/issues/1732
// https://github.com/apify/crawlee/issues/1710

import { MemoryStorageBackend } from '@crawlee/core';
import type { KeyValueStoreBackend } from '@crawlee/types';

describe('MemoryStorageBackend should not crash when saving a big buffer', () => {
    const storage = new MemoryStorageBackend();

    let store: KeyValueStoreBackend;

    beforeAll(async () => {
        store = await storage.createKeyValueStoreBackend();
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
