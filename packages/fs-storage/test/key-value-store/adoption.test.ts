import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { AdoptionCandidate, KeyValueStoreBackend } from '@crawlee/fs-storage';
import { FileSystemStorageBackend } from '@crawlee/fs-storage';
import type { KeyValueStoreRecord } from '@crawlee/types';

// Value files land in a key-value store directory without the metadata sidecar that makes them a
// record all the time: written by the Apify CLI, shipped in a project template, left behind by
// Crawlee v3, or edited by hand. `FileSystemStorageBackend` declares such files as adoption
// candidates when it opens a store, so the native client writes the missing sidecar once and
// everything afterwards — reads, listings, deletes, purge — deals in ordinary records.
//
// Every file is adopted under its own filename as the key. Content types come from the extension
// alone: `.json` is JSON, anything else is bytes for the `KeyValueStore` frontend to make sense of.
// Claiming a file under a different key, and sparing it on purge, is left to subclasses (the Apify
// SDK does both for its run input).

const payload = JSON.stringify({ hello: 'from disk' });

/** A fresh backend over `directory`, seeded with sidecar-less files in one key-value store. */
async function seedStore<T extends FileSystemStorageBackend>(
    directory: string,
    store: string,
    files: Record<string, string>,
    Backend: new (options: { localDataDirectory: string }) => T = FileSystemStorageBackend as never,
): Promise<T> {
    const storage = new Backend({ localDataDirectory: directory });
    const storeDirectory = resolve(storage.keyValueStoresDirectory, store);
    await mkdir(storeDirectory, { recursive: true });
    for (const [file, content] of Object.entries(files)) {
        await writeFile(resolve(storeDirectory, file), content);
    }
    return storage;
}

describe('sidecar-less files', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/adoption-sweep');

    afterEach(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('become records keyed by their filename', async () => {
        const storage = await seedStore(tmpLocation, 'named-store', {
            'some-key.json': payload,
            'photo.png': 'not really a png',
            '.hidden': 'tooling leftover',
        });
        const store = await storage.createKeyValueStoreBackend({ name: 'named-store' });

        expect((await store.listKeys()).items).toEqual([
            { key: 'photo.png', contentType: 'application/octet-stream', size: 16 },
            { key: 'some-key.json', contentType: 'application/json; charset=utf-8', size: payload.length },
        ]);
        expect((await store.getValue('some-key.json'))?.value.toString()).toBe(payload);

        // Dotfiles are tooling droppings (including the native client's own `.tmp.*` write
        // leftovers), never someone's record.
        expect(await store.getValue('.hidden')).toBeUndefined();
    });

    test('include an INPUT.json in the default store, keyed by its filename like any other', async () => {
        const storage = await seedStore(tmpLocation, 'default', { 'INPUT.json': payload });
        const store = await storage.createKeyValueStoreBackend();

        // Crawlee has no notion of a run input, so the file is a record named after itself.
        expect(await store.getValue('INPUT')).toBeUndefined();
        expect((await store.getValue('INPUT.json'))?.value.toString()).toBe(payload);
    });

    test('are adopted verbatim even when they are malformed JSON', async () => {
        const storage = await seedStore(tmpLocation, 'default', { 'broken.json': '{' });
        const store = await storage.createKeyValueStoreBackend();

        // The backend is a byte transport — parsing, and any error from it, belongs to the frontend.
        expect(await store.getValue('broken.json')).toStrictEqual<KeyValueStoreRecord>({
            key: 'broken.json',
            value: Buffer.from('{'),
            contentType: 'application/json; charset=utf-8',
        });
    });

    test('are purged from a run-scoped store on start', async () => {
        const storage = await seedStore(tmpLocation, 'default', { 'INPUT.json': payload, 'leftover.json': '{}' });

        await storage.purge();

        expect(await readdir(resolve(storage.keyValueStoresDirectory, 'default'))).not.toContain('INPUT.json');
        expect(await readdir(resolve(storage.keyValueStoresDirectory, 'default'))).not.toContain('leftover.json');
    });
});

describe('a hand-written store directory', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/adoption-identity');
    const expectedDate = new Date(2022, 0, 1);

    afterEach(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('keeps the identity its own metadata declares', async () => {
        const storage = await seedStore(tmpLocation, 'hand-written', {
            '__metadata__.json': JSON.stringify({
                id: randomUUID(),
                name: 'hand-written',
                createdAt: expectedDate,
                accessedAt: expectedDate,
                modifiedAt: expectedDate,
            }),
            'INPUT.json': payload,
        });
        const store = await storage.createKeyValueStoreBackend({ name: 'hand-written' });

        const metadata = await store.getMetadata();
        expect(metadata.name).toBe('hand-written');
        expect(metadata.createdAt).toEqual(expectedDate);

        // The store's own metadata file is not a value file, so adoption leaves it be.
        expect((await store.listKeys()).items.map((item) => item.key)).toEqual(['INPUT.json']);
    });

    test('works with no metadata file at all', async () => {
        const storage = await seedStore(tmpLocation, 'no-metadata', { 'INPUT.json': payload });
        const store = await storage.createKeyValueStoreBackend({ name: 'no-metadata' });

        expect((await store.getMetadata()).name).toBe('no-metadata');
        expect((await store.getValue('INPUT.json'))?.value.toString()).toBe(payload);
    });
});

// What the Apify SDK does for its run input: claim a bare `INPUT` / `INPUT.json` in the default store
// as the record `INPUT`, and keep that record when the store is purged on start.
class InputAwareBackend extends FileSystemStorageBackend {
    protected override keyValueStoreAdoptionCandidates(isDefaultStore: boolean): AdoptionCandidate[] {
        const inputCandidate: AdoptionCandidate = {
            key: 'INPUT',
            files: [
                { filename: 'INPUT', contentType: 'application/octet-stream' },
                { filename: 'INPUT.json', contentType: 'application/json; charset=utf-8' },
            ],
        };

        return [...(isDefaultStore ? [inputCandidate] : []), ...super.keyValueStoreAdoptionCandidates(isDefaultStore)];
    }

    protected override async purgeKeyValueStore(store: KeyValueStoreBackend, isDefaultStore: boolean): Promise<void> {
        await (isDefaultStore ? store.purgeExcept(['INPUT']) : store.purge());
    }
}

describe('a subclass claiming keys through the hooks', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/adoption-hooks');

    afterEach(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('adopts the file under the claimed key, not under its filename', async () => {
        const storage = await seedStore(tmpLocation, 'default', { 'INPUT.json': payload }, InputAwareBackend);
        const store = await storage.createKeyValueStoreBackend();

        expect(await store.getValue('INPUT')).toStrictEqual<KeyValueStoreRecord>({
            key: 'INPUT',
            value: Buffer.from(payload),
            contentType: 'application/json; charset=utf-8',
        });
        expect((await store.listKeys()).items.map((item) => item.key)).toEqual(['INPUT']);
        expect(await store.getPublicUrl('INPUT')).toMatch(/\/INPUT\.json$/);

        // The extension is the file's, not the key's.
        expect(await store.getValue('INPUT.json')).toBeUndefined();
    });

    test('fails the open when both candidate files are present', async () => {
        const storage = await seedStore(
            tmpLocation,
            'default',
            { INPUT: 'bytes', 'INPUT.json': payload },
            InputAwareBackend,
        );

        // Picking one would silently ignore the other, and there is no way to guess which one the
        // user means.
        await expect(storage.createKeyValueStoreBackend()).rejects.toThrow(/Multiple candidate files for key 'INPUT'/);
    });

    test('only receives isDefaultStore for the default store', async () => {
        const storage = await seedStore(tmpLocation, 'named-store', { 'INPUT.json': payload }, InputAwareBackend);
        const store = await storage.createKeyValueStoreBackend({ name: 'named-store' });

        expect(await store.getValue('INPUT')).toBeUndefined();
        expect((await store.getValue('INPUT.json'))?.value.toString()).toBe(payload);
    });

    test('spares the claimed key on purge and drops everything else', async () => {
        const storage = await seedStore(
            tmpLocation,
            'default',
            { 'INPUT.json': payload, 'leftover.json': '{}' },
            InputAwareBackend,
        );

        // Purge-on-start opens the store, so adoption runs first and the input survives as a record —
        // the very thing the keep-list is expressed in.
        await storage.purge();

        const store = await storage.createKeyValueStoreBackend();
        expect((await store.listKeys()).items.map((item) => item.key)).toEqual(['INPUT']);
        expect((await store.getValue('INPUT'))?.value.toString()).toBe(payload);
        expect(await readdir(resolve(storage.keyValueStoresDirectory, 'default'))).not.toContain('leftover.json');
    });

    test('purges a non-default store in full', async () => {
        const storage = await seedStore(tmpLocation, 'other', { 'INPUT.json': payload }, InputAwareBackend);
        await storage.createKeyValueStoreBackend({ alias: 'other' });

        await storage.purge();

        expect(await readdir(resolve(storage.keyValueStoresDirectory, 'other'))).not.toContain('INPUT.json');
    });
});
