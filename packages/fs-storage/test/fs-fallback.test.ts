import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageBackend } from '@crawlee/fs-storage';
import type { KeyValueStoreRecord } from '@crawlee/types';

// The storage is backed by the native `@crawlee/fs-storage-native` extension, which only serves
// key-value records it has written itself (tracked via per-record metadata sidecars). The
// `KeyValueStoreBackend` adapter layers a fallback on top so that value files placed into the store
// directory out-of-band — e.g. a hand-written or platform-provided `INPUT.json` — are still readable.
// These tests pin both the store-identity metadata fallback and that bare-file fallback.
//
// The client is a plain byte transport: bare-file reads return the raw bytes plus a content type
// inferred from the file extension (falling back to the native `application/octet-stream` when there
// is none). Parsing those bytes — and surfacing any error from a malformed value — is the
// `KeyValueStore` frontend's job, so the client does not validate them. Bare files are readable by
// known key and are also enumerated by `listKeys` under their actual on-disk name (e.g. a bare
// `INPUT.json` is listed as `INPUT.json` and reads back under that key), while the logical `INPUT`
// lookup keeps resolving the same bare file.
describe('fallback to fs for reading', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/fs-fallback');
    const storage = new FileSystemStorageBackend({
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
        const defaultStore = await storage.createKeyValueStoreBackend({ name: 'default' });
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
        const otherStore = await storage.createKeyValueStoreBackend({ name: 'other' });

        // Byte transport: raw bytes out, parsing is the frontend's job.
        const input = await otherStore.getValue('INPUT');
        expect(input).toStrictEqual<KeyValueStoreRecord>({
            key: 'INPUT',
            value: Buffer.from(JSON.stringify({ foo: 'bar but from fs' })),
            contentType: 'application/json; charset=utf-8',
        });
    });

    test('a store with no data on disk is still accessible after creation', async () => {
        const default2Store = await storage.createKeyValueStoreBackend({ name: 'default_2' });
        const info = await default2Store.getMetadata();
        expect(info.name).toEqual('default_2');
    });

    test('loads a value file with no extension as raw bytes with a generic content type', async () => {
        const noExtStore = await storage.createKeyValueStoreBackend({ name: 'no-ext' });

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
        const invalidJsonStore = await storage.createKeyValueStoreBackend({ name: 'invalid-json' });

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
        const otherStore = await storage.createKeyValueStoreBackend({ name: 'other' });

        expect(await otherStore.recordExists('INPUT')).toBe(true);
        expect(await otherStore.recordExists('does-not-exist')).toBe(false);

        const url = await otherStore.getPublicUrl('INPUT');
        expect(url).toMatch(/^file:\/\/.*INPUT\.json$/);

        // A bare `INPUT.json` is enumerated under its actual on-disk name, not the logical `INPUT`.
        const { items } = await otherStore.listKeys();
        expect(items.map((item) => item.key)).toContain('INPUT.json');
    });

    test('a listed bare key round-trips through getValue / recordExists / getPublicUrl', async () => {
        const otherStore = await storage.createKeyValueStoreBackend({ name: 'other' });

        // The key `listKeys` reports for a bare file must be readable back verbatim, while the logical
        // `INPUT` lookup keeps resolving the same bare file (matching how Crawlee reads run input).
        const [listed] = (await otherStore.listKeys()).items.map((item) => item.key);
        expect(listed).toBe('INPUT.json');

        const expected: KeyValueStoreRecord = {
            key: 'INPUT.json',
            value: Buffer.from(JSON.stringify({ foo: 'bar but from fs' })),
            contentType: 'application/json; charset=utf-8',
        };
        expect(await otherStore.getValue('INPUT.json')).toStrictEqual(expected);
        expect(await otherStore.recordExists('INPUT.json')).toBe(true);
        expect(await otherStore.getPublicUrl('INPUT.json')).toMatch(/^file:\/\/.*INPUT\.json$/);

        // The logical key still resolves the same underlying file (reported under the requested key).
        expect(await otherStore.getValue('INPUT')).toStrictEqual({ ...expected, key: 'INPUT' });
    });

    test('the bare-file fallback is scoped to INPUT: a non-INPUT bare file is ignored', async () => {
        const nonInputStore = await storage.createKeyValueStoreBackend({ name: 'non-input' });

        // `some-key.json` sits on disk with no metadata sidecar. Only `INPUT` keys probe bare files,
        // so this is invisible to every read path: it has no tracked record, and the `.json` extension
        // probing that would resolve a bare `INPUT` is never attempted for other keys.
        expect(await nonInputStore.getValue('some-key')).toBeUndefined();
        expect(await nonInputStore.recordExists('some-key')).toBe(false);
        expect(await nonInputStore.getPublicUrl('some-key')).toBeUndefined();

        // `listKeys` only surfaces bare files for the run-input keys, so `some-key` is not enumerated.
        const { items } = await nonInputStore.listKeys();
        expect(items.map((item) => item.key)).not.toContain('some-key');
    });

    test('a tracked INPUT record shadows the bare INPUT.json variant in listKeys', async () => {
        const collisionStore = await storage.createKeyValueStoreBackend({ name: 'input-collision' });

        // Write a tracked `INPUT` record (value file + metadata sidecar), then drop a sidecar-less bare
        // `INPUT.json` next to it. Both belong to the logical key `INPUT`; the tracked record wins, so
        // only `INPUT` is listed and the bare `INPUT.json` variant is suppressed.
        await collisionStore.setValue({ key: 'INPUT', value: 'tracked', contentType: 'text/plain; charset=utf-8' });
        await writeFile(
            resolve(storage.keyValueStoresDirectory, 'input-collision/INPUT.json'),
            JSON.stringify({ foo: 'bare' }),
        );

        const keys = (await collisionStore.listKeys()).items.map((item) => item.key);
        expect(keys).toContain('INPUT');
        expect(keys).not.toContain('INPUT.json');
    });
});

// For each run-input bare file: the on-disk filename, the literal key that reads it directly, the
// content type the client reports (`.json`/`.txt` infer from the extension; the extensionless `INPUT`
// and `.bin` report the synthesized `application/octet-stream`), and a unique payload so a read can be
// proven to have returned *this* file and not a sibling.
const BARE_VARIANTS = [
    { file: 'INPUT', literalKey: 'INPUT', contentType: 'application/octet-stream' },
    { file: 'INPUT.json', literalKey: 'INPUT.json', contentType: 'application/json; charset=utf-8' },
    { file: 'INPUT.txt', literalKey: 'INPUT.txt', contentType: 'text/plain; charset=utf-8' },
    { file: 'INPUT.bin', literalKey: 'INPUT.bin', contentType: 'application/octet-stream' },
].map((variant) => ({ ...variant, payload: `payload of ${variant.file}` }));

// Each run-input bare file must be reachable by exactly two keys — the logical `INPUT` (which probes
// the `['', '.json', '.txt', '.bin']` ladder, first match wins) and its own literal on-disk name — and
// NOT via a *different* extension's literal name (a bare `INPUT.txt` is not `INPUT.json`). Here each
// variant lives in its own store so the logical-`INPUT` lookup resolves it unambiguously.
describe('run-input bare-file reachability (one variant per store)', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/fs-reachability-isolated');
    const storage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation });

    const storeNameFor = (file: string) => `reach-${file.toLowerCase().replace('.', '-')}`;

    beforeAll(async () => {
        for (const { file, payload } of BARE_VARIANTS) {
            const dir = resolve(storage.keyValueStoresDirectory, storeNameFor(file));
            await mkdir(dir, { recursive: true });
            await writeFile(resolve(dir, file), payload);
        }
    });

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    describe.each(BARE_VARIANTS)('a bare $file', ({ file, literalKey, contentType, payload }) => {
        // Keys that should resolve this variant: the logical `INPUT` and the file's own literal name
        // (deduplicated — the extensionless variant's literal key *is* `INPUT`).
        const reachableKeys = [...new Set(['INPUT', literalKey])];
        // The literal names of the *other* extensions, which must never resolve this variant.
        const unreachableKeys = BARE_VARIANTS.map((variant) => variant.literalKey).filter(
            (key) => !reachableKeys.includes(key),
        );

        test.each(reachableKeys)('is reachable via %s', async (key) => {
            const store = await storage.createKeyValueStoreBackend({ name: storeNameFor(file) });

            expect(await store.getValue(key)).toStrictEqual<KeyValueStoreRecord>({
                key,
                value: Buffer.from(payload),
                contentType,
            });
            expect(await store.recordExists(key)).toBe(true);
            expect(await store.getPublicUrl(key)).toMatch(new RegExp(`^file://.*${file.replace('.', '\\.')}$`));
        });

        test.each(unreachableKeys)('is not reachable via %s', async (key) => {
            const store = await storage.createKeyValueStoreBackend({ name: storeNameFor(file) });

            expect(await store.getValue(key)).toBeUndefined();
            expect(await store.recordExists(key)).toBe(false);
            expect(await store.getPublicUrl(key)).toBeUndefined();
        });
    });
});

// The sharper cross-talk check: with *all four* variants in one store, each literal key must read back
// its own bytes (never a sibling's), and the logical `INPUT` must resolve the first ladder match — the
// extensionless `INPUT`. This is what fails if literal-name probing ever widens to other extensions.
describe('run-input bare-file reachability (all variants in one store)', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/fs-reachability-shared');
    const storage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation });

    beforeAll(async () => {
        const dir = resolve(storage.keyValueStoresDirectory, 'all-variants');
        await mkdir(dir, { recursive: true });
        for (const { file, payload } of BARE_VARIANTS) {
            await writeFile(resolve(dir, file), payload);
        }
    });

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test.each(BARE_VARIANTS)(
        'the literal key $literalKey reads its own file, not a sibling',
        async ({ literalKey, contentType, payload }) => {
            const store = await storage.createKeyValueStoreBackend({ name: 'all-variants' });

            expect(await store.getValue(literalKey)).toStrictEqual<KeyValueStoreRecord>({
                key: literalKey,
                value: Buffer.from(payload),
                contentType,
            });
        },
    );

    test('the logical INPUT key resolves the extensionless file (first ladder match)', async () => {
        const store = await storage.createKeyValueStoreBackend({ name: 'all-variants' });

        const extensionless = BARE_VARIANTS.find((variant) => variant.file === 'INPUT')!;
        expect(await store.getValue('INPUT')).toStrictEqual<KeyValueStoreRecord>({
            key: 'INPUT',
            value: Buffer.from(extensionless.payload),
            contentType: extensionless.contentType,
        });
    });
});
