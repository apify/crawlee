import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageBackend } from '@crawlee/fs-storage';

// The default storage lives in `default`. The alias @crawlee/core opens it under is an internal
// sentinel, and letting that reach the disk orphans every `storage/` directory an earlier run wrote.
describe('the default storage on disk', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/default-storage-layout');

    afterEach(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('every default storage lands in a `default` directory', async () => {
        const storage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation });

        await storage.createDatasetBackend();
        await storage.createKeyValueStoreBackend();
        await storage.createRequestQueueBackend();

        expect(await readdir(storage.datasetsDirectory)).toEqual(['default']);
        expect(await readdir(storage.keyValueStoresDirectory)).toEqual(['default']);
        expect(await readdir(storage.requestQueuesDirectory)).toEqual(['default']);
    });

    // A hand-placed file only turns up as a record if the `default` directory is the one the default
    // store actually opens.
    test('adopts a file placed in the default key-value store directory by hand', async () => {
        const storage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation });
        await mkdir(resolve(storage.keyValueStoresDirectory, 'default'), { recursive: true });
        await writeFile(
            resolve(storage.keyValueStoresDirectory, 'default', 'hand-placed.json'),
            JSON.stringify({ hello: 'world' }),
        );

        const defaultStore = await storage.createKeyValueStoreBackend();

        expect((await defaultStore.getValue('hand-placed.json'))?.value.toString()).toBe(
            JSON.stringify({ hello: 'world' }),
        );
    });
});
