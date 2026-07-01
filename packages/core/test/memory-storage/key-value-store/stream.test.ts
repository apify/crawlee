import { Readable } from 'node:stream';

import { MemoryStorageClient } from '@crawlee/core';

describe('KeyValueStore should drain streams when setting records', () => {
    const storage = new MemoryStorageClient();

    const fsStream = Readable.from([Buffer.from('hello'), Buffer.from('world')]);

    test('should drain stream', async () => {
        const defaultStore = await storage.createKeyValueStoreClient({ name: 'default' });

        await defaultStore.setValue({ key: 'streamz', value: fsStream, contentType: 'text/plain' });

        expect(fsStream.destroyed).toBeTruthy();

        const record = await defaultStore.getValue('streamz');
        expect(record!.value.toString('utf8')).toEqual('helloworld');
    });
});
