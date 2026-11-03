import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { KeyValueStore, MemoryStorageBackend, serviceLocator, withStorageTransaction } from '@crawlee/core';
import { FileSystemStorageBackend } from '@crawlee/fs-storage';
import { ensureDir, rm } from 'fs-extra';

import { cryptoRandomObjectId } from '@apify/utilities';

/**
 * `getPublicUrl()` derives the URL from the key without checking that the record exists, so a record
 * written earlier in an uncommitted transaction — buffered in the journal, absent from the backend —
 * already resolves to the URL it will have after commit (apify/crawlee#4075).
 *
 * Each test asserts that the in-transaction URL equals the committed one *and* that its path is the
 * value file on disk, which is what makes the derived URL more than a plausible-looking string.
 */
describe('KeyValueStore.getPublicUrl() inside a storage transaction (fs-storage)', () => {
    // A fresh directory per test keeps the suite order-independent.
    let localStorageDir: string;

    beforeEach(async () => {
        serviceLocator.reset();
        localStorageDir = resolve(import.meta.dirname, '..', 'tmp', 'fs-kvs-public-url-txn', cryptoRandomObjectId(10));
        await ensureDir(localStorageDir);
        serviceLocator.setStorageBackend(new FileSystemStorageBackend({ localDataDirectory: localStorageDir }));
    });

    afterEach(async () => {
        serviceLocator.getStorageInstanceManager().clearCache();
        await rm(localStorageDir, { force: true, recursive: true });
    });

    // The storage directory is spliced into the URL unencoded and the file is named by the *encoded*
    // key, so the URL's path is a literal filesystem path — not a percent-decoded one.
    const pathOf = (url: string) => url.slice('file://'.length);

    const writeInTransaction = async (store: KeyValueStore, key: string) => {
        let urlInside: string | undefined;
        await withStorageTransaction(async () => {
            await store.setValue(key, { hello: 'world' });
            urlInside = await store.getPublicUrl(key);
        });

        const urlAfterCommit = await store.getPublicUrl(key);
        expect(urlAfterCommit).toBeDefined();
        expect(urlInside).toBe(urlAfterCommit);

        return urlAfterCommit!;
    };

    test('returns the committed URL for a record written earlier in the same transaction', async () => {
        const store = await KeyValueStore.open();
        const url = await writeInTransaction(store, 'record');

        expect(JSON.parse(await readFile(pathOf(url), 'utf8'))).toStrictEqual({ hello: 'world' });
    });

    // A key with characters `encodeURIComponent` leaves alone (`!'()`) exercises the extra encoding pass;
    // a plain alphanumeric key would not.
    test('encodes a special-character key the way the value file is named', async () => {
        const store = await KeyValueStore.open();
        const url = await writeInTransaction(store, "re-cord_1.v2!'()");

        expect(url).toContain('re-cord_1.v2%21%27%28%29');
        expect(JSON.parse(await readFile(pathOf(url), 'utf8'))).toStrictEqual({ hello: 'world' });
    });

    // The directory path is spliced in unencoded, so a space in it must be reproduced verbatim rather
    // than percent-encoded.
    test('resolves to the value file when the storage directory path contains a space', async () => {
        serviceLocator.reset();
        const dirWithSpace = resolve(localStorageDir, 'with space');
        await ensureDir(dirWithSpace);
        serviceLocator.setStorageBackend(new FileSystemStorageBackend({ localDataDirectory: dirWithSpace }));

        const store = await KeyValueStore.open();
        const url = await writeInTransaction(store, 'record');

        expect(pathOf(url)).toContain('with space');
        expect(JSON.parse(await readFile(pathOf(url), 'utf8'))).toStrictEqual({ hello: 'world' });
    });

    // The flip side of deriving URLs from keys: they never imply existence, not even for a record
    // tombstoned in the current transaction. Callers that need existence ask `recordExists()`.
    test('returns a URL for a record that does not exist', async () => {
        const store = await KeyValueStore.open();
        await store.setValue('record', { hello: 'world' });

        const committedUrl = await store.getPublicUrl('record');
        expect(await store.getPublicUrl('never-written')).toBeDefined();

        await withStorageTransaction(async () => {
            await store.setValue('record', null);
            expect(await store.getPublicUrl('record')).toBe(committedUrl);
        });

        expect(await store.recordExists('record')).toBe(false);
        expect(await store.getPublicUrl('record')).toBe(committedUrl);
    });
});

// A URL-less backend must stay URL-less: nothing about the key-derived contract makes the in-memory
// storage fabricate a file URL for a buffered record.
describe('KeyValueStore.getPublicUrl() inside a storage transaction (memory-storage)', () => {
    beforeEach(() => {
        serviceLocator.reset();
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    afterEach(() => {
        serviceLocator.getStorageInstanceManager().clearCache();
    });

    test('returns undefined for a record buffered in a transaction on a URL-less backend', async () => {
        const store = await KeyValueStore.open();

        let urlInside: string | undefined = 'sentinel';
        await withStorageTransaction(async () => {
            await store.setValue('record', { hello: 'world' });
            urlInside = await store.getPublicUrl('record');
        });

        expect(urlInside).toBeUndefined();
        expect(await store.getPublicUrl('record')).toBeUndefined();
    });
});
