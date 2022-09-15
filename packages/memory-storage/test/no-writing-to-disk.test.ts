import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MemoryStorage } from '@crawlee/memory-storage';
import { waitTillWrittenToDisk } from './__shared__';

describe('persistStorage option', () => {
    const tmpLocation = resolve(__dirname, './tmp/no-writing-to-disk');

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    describe('when false and writeMetadata is also false', () => {
        const localDataDirectory = resolve(tmpLocation, './no-metadata');
        const storage = new MemoryStorage({
            localDataDirectory,
            persistStorage: false,
        });

        test('creating a key-value pair in a key-value store should not write data to the disk', async () => {
            const keyValueStoreInfo = await storage.keyValueStores().getOrCreate();

            const keyValueStore = storage.keyValueStore(keyValueStoreInfo.id);
            await keyValueStore.setRecord({ key: 'foo', value: 'test' });

            // We check that reading the directory for the store throws an error, which means it wasn't created on disk
            await expect(() => readdir(localDataDirectory)).rejects.toThrow();
        });
    });

    describe('when false and writeMetadata is true', () => {
        const localDataDirectory = resolve(tmpLocation, './with-metadata');
        const storage = new MemoryStorage({
            localDataDirectory,
            persistStorage: false,
            writeMetadata: true,
        });

        test('creating a key-value pair in a key-value store should not write data to the disk, but it should write the __metadata__ file', async () => {
            const keyValueStoreInfo = await storage.keyValueStores().getOrCreate();

            const keyValueStore = storage.keyValueStore(keyValueStoreInfo.id);
            await keyValueStore.setRecord({ key: 'foo', value: 'test' });

            const storePath = resolve(storage.keyValueStoresDirectory, `${keyValueStoreInfo.id}`);

            await waitTillWrittenToDisk(storePath);

            const directoryFiles = await readdir(storePath);

            expect(directoryFiles).toHaveLength(1);
            expect(directoryFiles).toEqual([
                '__metadata__.json',
            ]);
        });
    });
});
