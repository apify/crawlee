import { MemoryStorage } from '@crawlee/memory-storage';
import type { KeyValueStoreRecord } from '@crawlee/types';
import { ensureDir } from 'fs-extra';
import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

describe('fallback to fs for reading', () => {
    const tmpLocation = resolve(__dirname, './tmp/fs-fallback');
    const storage = new MemoryStorage({
        localDataDirectory: tmpLocation,
    });

    const expectedFsDate = new Date(2022, 0, 1);

    beforeAll(async () => {
        // Create "default" key-value store and give it an entry
        await ensureDir(resolve(storage.keyValueStoresDirectory, 'default'));
        await writeFile(resolve(storage.keyValueStoresDirectory, 'default/__metadata__.json'), JSON.stringify({
            id: randomUUID(),
            name: 'default',
            createdAt: expectedFsDate,
            accessedAt: expectedFsDate,
            modifiedAt: expectedFsDate,
        }));
        await writeFile(resolve(storage.keyValueStoresDirectory, 'default/INPUT.json'), JSON.stringify({ foo: 'bar but from fs' }));

        await ensureDir(resolve(storage.keyValueStoresDirectory, 'other'));
        await writeFile(resolve(storage.keyValueStoresDirectory, 'other/INPUT.json'), JSON.stringify({ foo: 'bar but from fs' }));

        await ensureDir(resolve(storage.keyValueStoresDirectory, 'no-ext'));
        await writeFile(resolve(storage.keyValueStoresDirectory, 'no-ext/INPUT'), JSON.stringify({ foo: 'bar but from fs' }));

        await ensureDir(resolve(storage.keyValueStoresDirectory, 'invalid-json'));
        await writeFile(resolve(storage.keyValueStoresDirectory, 'invalid-json/INPUT.json'), '{');
    });

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    // POST INIT //

    test('attempting to read "default" key value store with "__metadata__" present should read from fs', async () => {
        const defaultStoreInfo = await storage.keyValueStores().getOrCreate('default');
        const defaultStore = storage.keyValueStore(defaultStoreInfo.id);

        expect(defaultStoreInfo.name).toEqual('default');
        expect(defaultStoreInfo.createdAt).toEqual(expectedFsDate);

        const input = await defaultStore.getRecord('INPUT');
        expect(input).toStrictEqual<KeyValueStoreRecord>({
            key: 'INPUT',
            value: { foo: 'bar but from fs' },
            contentType: 'application/json; charset=utf-8',
        });
    });

    test(
        'attempting to read "other" key value store with no "__metadata__" present should read from fs, even if accessed without generating id first',
        async () => {
            const otherStore = storage.keyValueStore('other');

            const input = await otherStore.getRecord('INPUT');
            expect(input).toStrictEqual<KeyValueStoreRecord>({
                key: 'INPUT',
                value: { foo: 'bar but from fs' },
                contentType: 'application/json; charset=utf-8',
            });
        },
    );

    test('attempting to read non-existent "default_2" key value store should return undefined', async () => {
        await expect(storage.keyValueStore('default_2').get()).resolves.toBeUndefined();
    });

    test('attempting to read "no-ext" key value store should load the missing extension file correctly', async () => {
        const noExtStore = storage.keyValueStore('no-ext');

        const input = await noExtStore.getRecord('INPUT');
        expect(input).toStrictEqual<KeyValueStoreRecord>({
            key: 'INPUT',
            value: JSON.stringify({ foo: 'bar but from fs' }),
            contentType: 'text/plain',
        });
    });

    test('attempting to read "invalid-json" key value store should ignore the invalid "INPUT" json file', async () => {
        const invalidJsonStore = storage.keyValueStore('invalid-json');

        const input = await invalidJsonStore.getRecord('INPUT');
        expect(input).toBeUndefined();
    });
});
