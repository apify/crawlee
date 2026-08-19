import { resolve } from 'node:path';

import { KeyValueStore, serviceLocator } from '@crawlee/core';
import { FileSystemStorageBackend } from '@crawlee/fs-storage';
import { ensureDir, rm } from 'fs-extra';

import { cryptoRandomObjectId } from '@apify/utilities';

/**
 * Regression guard for the "centralize KVS value semantics" refactor.
 *
 * The core unit tests run against {@link MemoryStorageBackend}, so they never exercise the
 * default {@link FileSystemStorageBackend} backend. After moving serialize/parse into the
 * `KeyValueStore` frontend, the backend must be a pure byte transport — if a backend still parses
 * the body itself, the frontend would double-parse (`JSON5.parse("[object Object]")`) and throw.
 *
 * These tests wire the real frontend to the real fs-storage backend and assert a clean round-trip.
 */
describe('KeyValueStore frontend over FileSystemStorageBackend (byte-transport contract)', () => {
    const localStorageDir = resolve(import.meta.dirname, '..', 'tmp', 'fs-kvs-roundtrip', cryptoRandomObjectId(10));

    beforeEach(async () => {
        serviceLocator.reset();
        await ensureDir(localStorageDir);
        serviceLocator.setStorageBackend(new FileSystemStorageBackend({ localDataDirectory: localStorageDir }));
    });

    afterAll(async () => {
        await rm(localStorageDir, { force: true, recursive: true });
        serviceLocator.getStorageInstanceManager().clearCache();
    });

    test('round-trips a JSON object without double-parsing', async () => {
        const store = await KeyValueStore.open();
        await store.setValue('OUTPUT', { foo: 'bar', nested: { count: 42 } });

        await expect(store.getValue('OUTPUT')).resolves.toEqual({ foo: 'bar', nested: { count: 42 } });
    });

    test('round-trips a string with an explicit content type', async () => {
        const store = await KeyValueStore.open();
        await store.setValue('TEXT', 'hello world', { contentType: 'text/plain; charset=utf-8' });

        await expect(store.getValue('TEXT')).resolves.toBe('hello world');
    });

    test('round-trips a Buffer verbatim', async () => {
        const store = await KeyValueStore.open();
        const bytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
        await store.setValue('BYTES', bytes, { contentType: 'application/octet-stream' });

        await expect(store.getValue('BYTES')).resolves.toStrictEqual(bytes);
    });

    test('round-trips a typed array (with byteOffset) as the correct bytes', async () => {
        const store = await KeyValueStore.open();
        // A view into a larger buffer, so byteOffset / byteLength matter.
        const backing = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44]).buffer;
        const view = new Uint8Array(backing, 1, 3); // -> [0x11, 0x22, 0x33]
        await store.setValue('VIEW', view, { contentType: 'application/octet-stream' });

        await expect(store.getValue('VIEW')).resolves.toStrictEqual(Buffer.from([0x11, 0x22, 0x33]));
    });

    test('round-trips an ArrayBuffer as the correct bytes', async () => {
        const store = await KeyValueStore.open();
        const buf = new Uint8Array([0x01, 0x02, 0x03]).buffer;
        await store.setValue('AB', buf, { contentType: 'application/octet-stream' });

        await expect(store.getValue('AB')).resolves.toStrictEqual(Buffer.from([0x01, 0x02, 0x03]));
    });

    test('getRecord returns the raw bytes, not a parsed object', async () => {
        const store = await KeyValueStore.open();
        await store.setValue('OUTPUT', { foo: 'bar' });

        const record = await store.getRecord('OUTPUT');
        expect(record).not.toBeNull();
        expect(Buffer.isBuffer(record!.value) || record!.value instanceof ArrayBuffer).toBe(true);
        expect(JSON.parse(Buffer.from(record!.value as Buffer).toString('utf-8'))).toEqual({ foo: 'bar' });
        expect(record!.contentType).toMatch(/application\/json/);
    });

    test('iterates JSON records via forEachKey without double-parsing', async () => {
        const store = await KeyValueStore.open();
        await store.setValue('a', { idx: 1 });
        await store.setValue('b', { idx: 2 });

        const seen: Record<string, unknown> = {};
        await store.forEachKey(async (key) => {
            seen[key] = await store.getValue(key);
        });

        expect(seen).toEqual({ a: { idx: 1 }, b: { idx: 2 } });
    });
});
