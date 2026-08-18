import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageBackend } from '@crawlee/fs-storage';
import type { KeyValueStoreRecord } from '@crawlee/types';

// Value files land in a key-value store directory without the metadata sidecar that makes them a
// record all the time: written by the Apify CLI, shipped in a project template, left behind by
// Crawlee v3, or edited by hand. `FileSystemStorageBackend` declares such files as adoption
// candidates when it opens a store, so the native client writes the missing sidecar once and
// everything afterwards — reads, listings, deletes, purge — deals in ordinary records.
//
// The run-input keys claim a bare `<key>` or `<key>.json` in the default store; every other file is
// adopted under its own filename as the key. Content types come from the extension alone: `.json` is
// JSON, anything else is bytes for the `KeyValueStore` frontend to make sense of.

const payload = JSON.stringify({ hello: 'from disk' });

/** The backend lays key-value stores out under `<localDataDirectory>/key_value_stores`. */
const storesDirectory = (directory: string) => resolve(directory, 'key_value_stores');

/** A fresh backend over `directory`, seeded with sidecar-less files in one key-value store. */
async function seedStore(
    directory: string,
    store: string,
    files: Record<string, string>,
    options: { inputKey?: string } = {},
): Promise<FileSystemStorageBackend> {
    const storage = new FileSystemStorageBackend({ localDataDirectory: directory, ...options });
    const storeDirectory = resolve(storesDirectory(directory), store);
    await mkdir(storeDirectory, { recursive: true });
    for (const [file, content] of Object.entries(files)) {
        await writeFile(resolve(storeDirectory, file), content);
    }
    return storage;
}

describe('a sidecar-less run-input file in the default store', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/adoption-input');

    afterEach(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('is a record under the input key, not under its filename', async () => {
        const storage = await seedStore(tmpLocation, 'default', { 'INPUT.json': payload });
        const store = await storage.createKeyValueStoreBackend();

        expect(await store.getValue('INPUT')).toStrictEqual<KeyValueStoreRecord>({
            key: 'INPUT',
            value: Buffer.from(payload),
            contentType: 'application/json; charset=utf-8',
        });
        expect((await store.listKeys()).items.map((item) => item.key)).toEqual(['INPUT']);
        expect(await store.recordExists('INPUT')).toBe(true);
        expect(await store.getPublicUrl('INPUT')).toMatch(/\/INPUT\.json$/);

        // The extension is the file's, not the key's.
        expect(await store.getValue('INPUT.json')).toBeUndefined();
        expect(await store.recordExists('INPUT.json')).toBe(false);
    });

    test('is deleted by deleteValue instead of resurrecting the key', async () => {
        const storage = await seedStore(tmpLocation, 'default', { 'INPUT.json': payload });
        const store = await storage.createKeyValueStoreBackend();

        await store.deleteValue('INPUT');

        expect(await store.getValue('INPUT')).toBeUndefined();
        expect(await readdir(resolve(storesDirectory(tmpLocation), 'default'))).not.toContain('INPUT.json');
    });

    test('reads as bytes when it has no extension', async () => {
        const storage = await seedStore(tmpLocation, 'default', { INPUT: payload });
        const store = await storage.createKeyValueStoreBackend();

        // No sniffing: the extension is the only thing that makes a file JSON, so an extensionless
        // one is bytes. Turning those into a parsed input is the caller's job.
        expect(await store.getValue('INPUT')).toStrictEqual<KeyValueStoreRecord>({
            key: 'INPUT',
            value: Buffer.from(payload),
            contentType: 'application/octet-stream',
        });
    });

    test('is adopted verbatim even when it is malformed JSON', async () => {
        const storage = await seedStore(tmpLocation, 'default', { 'INPUT.json': '{' });
        const store = await storage.createKeyValueStoreBackend();

        // The backend is a byte transport — parsing, and any error from it, belongs to the frontend.
        expect(await store.getValue('INPUT')).toStrictEqual<KeyValueStoreRecord>({
            key: 'INPUT',
            value: Buffer.from('{'),
            contentType: 'application/json; charset=utf-8',
        });
    });

    test('fails the open when both candidate files are present', async () => {
        const storage = await seedStore(tmpLocation, 'default', { INPUT: 'bytes', 'INPUT.json': payload });

        // Picking one would silently ignore the other, and there is no way to guess which one the
        // user means.
        await expect(storage.createKeyValueStoreBackend()).rejects.toThrow(/Multiple candidate files for key 'INPUT'/);
    });

    test('is left alone when the input key already has a record', async () => {
        const storage = await seedStore(tmpLocation, 'default', {});
        const store = await storage.createKeyValueStoreBackend();
        await store.setValue({ key: 'INPUT', value: 'tracked', contentType: 'text/plain; charset=utf-8' });
        await writeFile(resolve(storesDirectory(tmpLocation), 'default', 'INPUT.json'), payload);

        // Reopening must not rebind the key: a stray file is not allowed to take over a record the
        // run wrote itself, and adopting it under its own filename would make `INPUT.json` a second
        // key for what the user thinks is the input.
        const reopened = await new FileSystemStorageBackend({
            localDataDirectory: tmpLocation,
        }).createKeyValueStoreBackend();

        expect((await reopened.getValue('INPUT'))?.value.toString()).toBe('tracked');
        expect((await reopened.listKeys()).items.map((item) => item.key)).toEqual(['INPUT']);
    });

    test('is adopted under the configured input key', async () => {
        const inputKey = '__CLI_INPUT';
        const storage = await seedStore(tmpLocation, 'default', { [`${inputKey}.json`]: payload }, { inputKey });
        const store = await storage.createKeyValueStoreBackend();

        expect(await store.getValue(inputKey)).toStrictEqual<KeyValueStoreRecord>({
            key: inputKey,
            value: Buffer.from(payload),
            contentType: 'application/json; charset=utf-8',
        });
        expect((await store.listKeys()).items.map((item) => item.key)).toEqual([inputKey]);
    });

    test('is adopted under its filename when a different input key is configured', async () => {
        const storage = await seedStore(tmpLocation, 'default', { '__CLI_INPUT.json': payload });
        const store = await storage.createKeyValueStoreBackend();

        // Not this run's input, so it is an ordinary file: a record named after itself.
        expect(await store.getValue('__CLI_INPUT')).toBeUndefined();
        expect((await store.getValue('__CLI_INPUT.json'))?.value.toString()).toBe(payload);
    });
});

describe('sidecar-less files outside the run input', () => {
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

    test('include an INPUT.json in a store that is not the default one', async () => {
        const storage = await seedStore(tmpLocation, 'named-store', { 'INPUT.json': payload });
        const store = await storage.createKeyValueStoreBackend({ name: 'named-store' });

        // Only the default store holds the run input, so here `INPUT.json` is just a file that
        // happens to be called that.
        expect(await store.getValue('INPUT')).toBeUndefined();
        expect((await store.getValue('INPUT.json'))?.value.toString()).toBe(payload);
    });

    test('are adopted in the default store too', async () => {
        const storage = await seedStore(tmpLocation, 'default', { 'leftover.json': payload });
        const store = await storage.createKeyValueStoreBackend();

        expect((await store.getValue('leftover.json'))?.value.toString()).toBe(payload);
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

describe('purging a store with adopted records', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/adoption-purge');

    afterEach(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('keeps the run input and drops everything else', async () => {
        const inputKey = '__CLI_INPUT';
        const storage = await seedStore(
            tmpLocation,
            'default',
            {
                'INPUT.json': payload,
                [`${inputKey}.json`]: JSON.stringify({ hello: 'from the cli' }),
                'leftover.json': JSON.stringify({ leftover: true }),
            },
            { inputKey },
        );

        // Purge-on-start opens the store, so adoption runs first and the input survives as a record —
        // the very thing the keep-list is expressed in.
        await storage.purge();

        const store = await storage.createKeyValueStoreBackend();
        expect((await store.listKeys()).items.map((item) => item.key)).toEqual(['INPUT', inputKey]);
        expect((await store.getValue('INPUT'))?.value.toString()).toBe(payload);
        expect(await readdir(resolve(storesDirectory(tmpLocation), 'default'))).not.toContain('leftover.json');
    });

    test('drops the input of a non-default store', async () => {
        const storage = await seedStore(tmpLocation, 'other', { 'INPUT.json': payload });
        await storage.createKeyValueStoreBackend({ alias: 'other' });

        await storage.purge();

        expect(await readdir(resolve(storesDirectory(tmpLocation), 'other'))).not.toContain('INPUT.json');
    });
});
