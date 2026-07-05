import { MemoryStorageClient } from '@crawlee/core';
import type { KeyValueStoreClient } from '@crawlee/types';

describe('MemoryStorageClient.purge preserves the default key-value store input', () => {
    test('purging keeps INPUT in the default store but removes everything else', async () => {
        const storage = new MemoryStorageClient();
        const store: KeyValueStoreClient = await storage.createKeyValueStoreClient({ name: 'default' });

        await store.setValue({
            key: 'INPUT',
            value: JSON.stringify({ hello: 'world' }),
            contentType: 'application/json; charset=utf-8',
        });
        await store.setValue({
            key: 'some-other-key',
            value: JSON.stringify({ foo: 'bar' }),
            contentType: 'application/json; charset=utf-8',
        });

        await storage.purge();

        // INPUT must survive the purge (parity with FileSystemStorageClient)...
        const input = await store.getValue('INPUT');
        expect(input?.value.toString()).toBe(JSON.stringify({ hello: 'world' }));

        // ...while every other record is removed.
        expect(await store.getValue('some-other-key')).toBeUndefined();
        const { items: keys } = await store.listKeys();
        expect(keys.map((item) => item.key)).toEqual(['INPUT']);
    });

    test('purging a non-default store removes INPUT as well', async () => {
        const storage = new MemoryStorageClient();
        const store: KeyValueStoreClient = await storage.createKeyValueStoreClient({ name: 'not-default' });

        await store.setValue({
            key: 'INPUT',
            value: JSON.stringify({ hello: 'world' }),
            contentType: 'application/json; charset=utf-8',
        });

        // `purge` on the storage client only touches default storages, so a named store keeps its data.
        await storage.purge();
        expect((await store.getValue('INPUT'))?.value.toString()).toBe(JSON.stringify({ hello: 'world' }));

        // Purging the store directly clears everything, including INPUT.
        await store.purge();
        expect(await store.getValue('INPUT')).toBeUndefined();
    });
});
