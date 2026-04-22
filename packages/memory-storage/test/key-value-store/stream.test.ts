import { Readable } from 'node:stream';

import { MemoryStorage } from '@crawlee/memory-storage';

describe('KeyValueStore should drain streams when setting records', () => {
    const storage = new MemoryStorage({
        persistStorage: false,
    });

    const fsStream = Readable.from([Buffer.from('hello'), Buffer.from('world')]);

    test('should drain stream', async () => {
        const defaultStore = await storage.createKeyValueStoreClient({ name: 'default' });

        await defaultStore.setRecord({ key: 'streamz', value: fsStream, contentType: 'text/plain' });

        expect(fsStream.destroyed).toBeTruthy();

        const record = await defaultStore.getRecord('streamz');
        expect(record!.value.toString('utf8')).toEqual('helloworld');
    });
});
