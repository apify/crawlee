import { MemoryStorageClient } from '@crawlee/memory-storage';
import type { KeyValueStoreClient } from '@crawlee/types';

describe('MemoryStorageClient.purge preserves the default key-value store input', () => {
    test('purging keeps INPUT in the default store but removes everything else', async () => {
        const storage = new MemoryStorageClient();
        const store: KeyValueStoreClient = await storage.createKeyValueStoreClient({ name: 'default' });

        await store.setValue({ key: 'INPUT', value: { hello: 'world' } });
        await store.setValue({ key: 'some-other-key', value: { foo: 'bar' } });

        await storage.purge();

        // INPUT must survive the purge (parity with FileSystemStorageClient)...
        const input = await store.getValue('INPUT');
        expect(input?.value).toEqual({ hello: 'world' });

        // ...while every other record is removed.
        expect(await store.getValue('some-other-key')).toBeUndefined();
        const keys = await store.listKeys();
        expect(keys.map((item) => item.key)).toEqual(['INPUT']);
    });

    test('purging a non-default store removes INPUT as well', async () => {
        const storage = new MemoryStorageClient();
        const store: KeyValueStoreClient = await storage.createKeyValueStoreClient({ name: 'not-default' });

        await store.setValue({ key: 'INPUT', value: { hello: 'world' } });

        // `purge` on the storage client only touches default storages, so a named store keeps its data.
        await storage.purge();
        expect((await store.getValue('INPUT'))?.value).toEqual({ hello: 'world' });

        // Purging the store directly clears everything, including INPUT.
        await store.purge();
        expect(await store.getValue('INPUT')).toBeUndefined();
    });
});
