import { resolve } from 'node:path';

import { KeyValueStore, MemoryStorageBackend, serviceLocator, withStorageTransaction } from '@crawlee/core';
import { FileSystemStorageBackend } from '@crawlee/fs-storage';
import { ensureDir, rm } from 'fs-extra';

import { cryptoRandomObjectId } from '@apify/utilities';

/**
 * `KeyValueStore.getValue()`/`getRecord()`/`recordExists()` read through the active transaction's
 * journal, so a record written earlier in the same transaction is visible before commit. Prior to
 * the fix `getPublicUrl()` delegated straight to the backend, bypassing the journal, so it returned
 * `undefined` for a record buffered but not yet committed (apify/crawlee#4075).
 *
 * These tests wire the real frontend to the real fs-storage backend (the only in-repo backend that
 * exposes a file URL) and assert read-your-own-writes for URLs, matching the sibling read methods.
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

    test('returns the same URL for a record written earlier in the same transaction', async () => {
        const store = await KeyValueStore.open();

        let urlInside: string | undefined;
        await withStorageTransaction(async () => {
            await store.setValue('record', { hello: 'world' });
            urlInside = await store.getPublicUrl('record');
        });

        const urlAfterCommit = await store.getPublicUrl('record');

        expect(urlAfterCommit).toBeDefined();
        expect(urlInside).toBeDefined();
        expect(urlInside).toBe(urlAfterCommit);
    });

    // The buffered URL is derived from the key, so a key with percent-encoded characters (`!'()`) must
    // still match the committed URL — a plain alphanumeric key would not exercise the encoder.
    test('returns the same URL for a special-character key written earlier in the same transaction', async () => {
        const store = await KeyValueStore.open();
        const key = "re-cord_1.v2!'()";

        let urlInside: string | undefined;
        await withStorageTransaction(async () => {
            await store.setValue(key, { hello: 'world' });
            urlInside = await store.getPublicUrl(key);
        });

        const urlAfterCommit = await store.getPublicUrl(key);

        expect(urlAfterCommit).toBeDefined();
        expect(urlInside).toBeDefined();
        expect(urlInside).toBe(urlAfterCommit);
    });

    // The URL is built from the storage directory path, which native leaves unencoded; a space (or
    // other URL-significant character) in that path must be reproduced verbatim, not percent-encoded.
    test('matches the committed URL when the storage directory path contains a space', async () => {
        serviceLocator.reset();
        const dirWithSpace = resolve(localStorageDir, 'with space');
        await ensureDir(dirWithSpace);
        serviceLocator.setStorageBackend(new FileSystemStorageBackend({ localDataDirectory: dirWithSpace }));

        const store = await KeyValueStore.open();

        let urlInside: string | undefined;
        await withStorageTransaction(async () => {
            await store.setValue('record', { hello: 'world' });
            urlInside = await store.getPublicUrl('record');
        });

        const urlAfterCommit = await store.getPublicUrl('record');

        expect(urlAfterCommit).toBeDefined();
        expect(urlInside).toBe(urlAfterCommit);
    });

    // An in-transaction tombstone hides a still-committed backend record.
    test('returns undefined for a record tombstoned earlier in the same transaction', async () => {
        const store = await KeyValueStore.open();
        await store.setValue('record', { hello: 'world' });

        expect(await store.getPublicUrl('record')).toBeDefined();

        let urlInside: string | undefined = 'sentinel';
        await withStorageTransaction(async () => {
            await store.setValue('record', null);
            urlInside = await store.getPublicUrl('record');
        });

        expect(urlInside).toBeUndefined();
        expect(await store.getPublicUrl('record')).toBeUndefined();
    });
});

// A URL-less backend (in-memory) omits `getPublicUrlForKey`, so a buffered record must stay URL-less
// rather than fabricate a URL or throw on the missing method.
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
