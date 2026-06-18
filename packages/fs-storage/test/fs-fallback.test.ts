import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageClient } from '@crawlee/fs-storage';
import type { KeyValueStoreRecord } from '@crawlee/types';

// The storage is backed by the native `@crawlee/fs-storage-native` extension, which only serves
// key-value records it has written itself (tracked via per-record metadata sidecars). The
// `KeyValueStoreClient` adapter layers a fallback on top so that value files placed into the store
// directory out-of-band — e.g. a hand-written or platform-provided `INPUT.json` — are still readable.
// These tests pin both the store-identity metadata fallback and that bare-file fallback.
//
// The client is a plain byte transport: bare-file reads return the raw bytes plus a content type
// inferred from the file extension; parsing those bytes is the `KeyValueStore` frontend's job. The
// client only validates that an inferred-JSON body is parseable so that a malformed value can be
// treated as a missing record.
describe('fallback to fs for reading', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/fs-fallback');
    const storage = new FileSystemStorageClient({
        localDataDirectory: tmpLocation,
    });

    const expectedFsDate = new Date(2022, 0, 1);

    beforeAll(async () => {
        // "default" store: metadata file + a bare INPUT.json (no per-record metadata sidecar).
        await mkdir(resolve(storage.keyValueStoresDirectory, 'default'), { recursive: true });
        await writeFile(
            resolve(storage.keyValueStoresDirectory, 'default/__metadata__.json'),
            JSON.stringify({
                id: randomUUID(),
                name: 'default',
                createdAt: expectedFsDate,
                accessedAt: expectedFsDate,
                modifiedAt: expectedFsDate,
            }),
        );
        await writeFile(
            resolve(storage.keyValueStoresDirectory, 'default/INPUT.json'),
            JSON.stringify({ foo: 'bar but from fs' }),
        );

        // "other" store: a bare INPUT.json with no store metadata file at all.
        await mkdir(resolve(storage.keyValueStoresDirectory, 'other'), { recursive: true });
        await writeFile(
            resolve(storage.keyValueStoresDirectory, 'other/INPUT.json'),
            JSON.stringify({ foo: 'bar but from fs' }),
        );

        // "no-ext" store: a value file with no extension — loaded as raw text.
        await mkdir(resolve(storage.keyValueStoresDirectory, 'no-ext'), { recursive: true });
        await writeFile(
            resolve(storage.keyValueStoresDirectory, 'no-ext/INPUT'),
            JSON.stringify({ foo: 'bar but from fs' }),
        );

        // "invalid-json" store: a malformed INPUT.json — ignored.
        await mkdir(resolve(storage.keyValueStoresDirectory, 'invalid-json'), { recursive: true });
        await writeFile(resolve(storage.keyValueStoresDirectory, 'invalid-json/INPUT.json'), '{');
    });

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('reads store identity from the on-disk metadata, and a bare INPUT.json value', async () => {
        const defaultStore = await storage.createKeyValueStoreClient({ name: 'default' });
        const defaultStoreInfo = await defaultStore.getMetadata();

        expect(defaultStoreInfo.name).toEqual('default');
        expect(defaultStoreInfo.createdAt).toEqual(expectedFsDate);

        // The client is a byte transport: it returns the raw on-disk bytes verbatim and leaves
        // parsing to the KeyValueStore frontend codec. So we expect a Buffer, not a parsed object.
        const input = await defaultStore.getValue('INPUT');
        expect(input).toStrictEqual<KeyValueStoreRecord>({
            key: 'INPUT',
            value: Buffer.from(JSON.stringify({ foo: 'bar but from fs' })),
            contentType: 'application/json; charset=utf-8',
        });
    });

    test('reads a bare INPUT.json even with no store metadata present', async () => {
        const otherStore = await storage.createKeyValueStoreClient({ name: 'other' });

        // Byte transport: raw bytes out, parsing is the frontend's job.
        const input = await otherStore.getValue('INPUT');
        expect(input).toStrictEqual<KeyValueStoreRecord>({
            key: 'INPUT',
            value: Buffer.from(JSON.stringify({ foo: 'bar but from fs' })),
            contentType: 'application/json; charset=utf-8',
        });
    });

    test('a store with no data on disk is still accessible after creation', async () => {
        const default2Store = await storage.createKeyValueStoreClient({ name: 'default_2' });
        const info = await default2Store.getMetadata();
        expect(info.name).toEqual('default_2');
    });

    test('loads a value file with no extension as raw bytes with a text content type', async () => {
        const noExtStore = await storage.createKeyValueStoreClient({ name: 'no-ext' });

        // Byte transport: the no-extension fallback also returns raw bytes now, not a decoded string.
        const input = await noExtStore.getValue('INPUT');
        expect(input).toStrictEqual<KeyValueStoreRecord>({
            key: 'INPUT',
            value: Buffer.from(JSON.stringify({ foo: 'bar but from fs' })),
            contentType: 'text/plain',
        });
    });

    test('ignores an invalid-JSON bare value file', async () => {
        const invalidJsonStore = await storage.createKeyValueStoreClient({ name: 'invalid-json' });

        const input = await invalidJsonStore.getValue('INPUT');
        expect(input).toBeUndefined();
    });

    test('bare files are visible to recordExists, getPublicUrl and listKeys', async () => {
        const otherStore = await storage.createKeyValueStoreClient({ name: 'other' });

        expect(await otherStore.recordExists('INPUT')).toBe(true);
        expect(await otherStore.recordExists('does-not-exist')).toBe(false);

        const url = await otherStore.getPublicUrl('INPUT');
        expect(url).toMatch(/^file:\/\/.*INPUT\.json$/);

        const keys = await otherStore.listKeys();
        expect(keys.map((item) => item.key)).toContain('INPUT');
    });
});
