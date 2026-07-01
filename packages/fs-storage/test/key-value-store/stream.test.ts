import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';

import { FileSystemStorageClient } from '@crawlee/fs-storage';

describe('KeyValueStore should drain streams when setting records', () => {
    const localDataDirectory = resolve(__dirname, './tmp/stream');
    const storage = new FileSystemStorageClient({ localDataDirectory });

    const fsStream = Readable.from([Buffer.from('hello'), Buffer.from('world')]);

    afterAll(async () => {
        await rm(localDataDirectory, { force: true, recursive: true });
    });

    test('should drain stream', async () => {
        const defaultStore = await storage.createKeyValueStoreClient({ name: 'default' });

        await defaultStore.setValue({ key: 'streamz', value: fsStream, contentType: 'text/plain' });

        expect(fsStream.destroyed).toBeTruthy();

        const record = await defaultStore.getValue('streamz');
        expect(record!.value.toString('utf8')).toEqual('helloworld');
    });
});
