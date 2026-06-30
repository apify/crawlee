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
// inferred from the file extension (falling back to the native `application/octet-stream` when there
// is none). Parsing those bytes — and surfacing any error from a malformed value — is the
// `KeyValueStore` frontend's job, so the client does not validate them. Bare files are readable by
// known key and are also enumerated by `listKeys` under their logical key (e.g. a bare `INPUT.json`
// is listed as `INPUT`).
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

        // "non-input" store: a bare value file under a non-INPUT key. The bare-file fallback is scoped
        // to the run input, so this file is NOT readable out-of-band — only `INPUT`-keyed bare files are.
        await mkdir(resolve(storage.keyValueStoresDirectory, 'non-input'), { recursive: true });
        await writeFile(
            resolve(storage.keyValueStoresDirectory, 'non-input/some-key.json'),
            JSON.stringify({ foo: 'bar but from fs' }),
        );
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

    test('loads a value file with no extension as raw bytes with a generic content type', async () => {
        const noExtStore = await storage.createKeyValueStoreClient({ name: 'no-ext' });

        // Byte transport: the no-extension fallback returns raw bytes. With no extension to infer a
        // content type from, the native client reports the generic `application/octet-stream`.
        const input = await noExtStore.getValue('INPUT');
        expect(input).toStrictEqual<KeyValueStoreRecord>({
            key: 'INPUT',
            value: Buffer.from(JSON.stringify({ foo: 'bar but from fs' })),
            contentType: 'application/octet-stream',
        });
    });

    test('returns an invalid-JSON bare value file verbatim', async () => {
        const invalidJsonStore = await storage.createKeyValueStoreClient({ name: 'invalid-json' });

        // Byte transport: the client no longer validates parseability. Malformed JSON is returned
        // verbatim as raw bytes; parsing (and any resulting error) is the KeyValueStore frontend's job.
        const input = await invalidJsonStore.getValue('INPUT');
        expect(input).toStrictEqual<KeyValueStoreRecord>({
            key: 'INPUT',
            value: Buffer.from('{'),
            contentType: 'application/json; charset=utf-8',
        });
    });

    test('bare files are visible to recordExists, getPublicUrl, and listKeys', async () => {
        const otherStore = await storage.createKeyValueStoreClient({ name: 'other' });

        expect(await otherStore.recordExists('INPUT')).toBe(true);
        expect(await otherStore.recordExists('does-not-exist')).toBe(false);

        const url = await otherStore.getPublicUrl('INPUT');
        expect(url).toMatch(/^file:\/\/.*INPUT\.json$/);

        // A bare `INPUT.json` is enumerated under its logical key `INPUT`, so the listed key matches
        // what `getValue` / `recordExists` accept.
        const keys = await otherStore.listKeys();
        expect(keys.map((item) => item.key)).toContain('INPUT');
    });

    test('the bare-file fallback is scoped to INPUT: a non-INPUT bare file is ignored', async () => {
        const nonInputStore = await storage.createKeyValueStoreClient({ name: 'non-input' });

        // `some-key.json` sits on disk with no metadata sidecar. Only `INPUT` keys probe bare files,
        // so this is invisible to every read path: it has no tracked record, and the `.json` extension
        // probing that would resolve a bare `INPUT` is never attempted for other keys.
        expect(await nonInputStore.getValue('some-key')).toBeUndefined();
        expect(await nonInputStore.recordExists('some-key')).toBe(false);
        expect(await nonInputStore.getPublicUrl('some-key')).toBeUndefined();

        // `listKeys` only surfaces bare files for the run-input keys, so `some-key` is not enumerated.
        const keys = await nonInputStore.listKeys();
        expect(keys.map((item) => item.key)).not.toContain('some-key');
    });

    test('listKeys does not list a logical key twice when a tracked record and a bare file collide', async () => {
        const collisionStore = await storage.createKeyValueStoreClient({ name: 'input-collision' });

        // Write a tracked `INPUT` record (value file + metadata sidecar), then drop a sidecar-less bare
        // `INPUT.json` next to it. Both collapse to the logical key `INPUT`; the native only dedupes
        // same-named files, so the adapter must drop the duplicate itself.
        await collisionStore.setValue({ key: 'INPUT', value: 'tracked', contentType: 'text/plain; charset=utf-8' });
        await writeFile(
            resolve(storage.keyValueStoresDirectory, 'input-collision/INPUT.json'),
            JSON.stringify({ foo: 'bare' }),
        );

        const keys = (await collisionStore.listKeys()).map((item) => item.key);
        expect(keys.filter((key) => key === 'INPUT')).toHaveLength(1);
    });
});
