import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageBackend } from '@crawlee/fs-storage';
import { MemoryStorageBackend, RequestQueue, purgeDefaultStorages, serviceLocator } from '@crawlee/core';
import type { KeyValueStoreBackend, RequestQueueBackend, StorageBackend } from '@crawlee/types';

import { cryptoRandomObjectId } from '@apify/utilities';

const temporaryRoot = resolve(import.meta.dirname, '..', 'tmp', 'storage-purge');

const temporaryDirectory = () => resolve(temporaryRoot, cryptoRandomObjectId(10));

const requestOf = (url: string) => ({ url, uniqueKey: url });

const pendingCount = async (queue: RequestQueueBackend) => (await queue.getMetadata()).pendingRequestCount;

const readInput = async (store: KeyValueStoreBackend) => (await store.getValue('INPUT'))?.value.toString();

const input = { key: 'INPUT', value: '{"run":"input"}', contentType: 'application/json; charset=utf-8' };

afterAll(async () => {
    await rm(temporaryRoot, { force: true, recursive: true });
});

// A `purgeOnStart` purge wipes the storages that belong to a single run: the default one and any
// alias-keyed one. Named storages are the opt-in "keep this across runs" mechanism and must survive.
describe.each([
    ['MemoryStorageBackend', (): StorageBackend => new MemoryStorageBackend()],
    [
        'FileSystemStorageBackend',
        (): StorageBackend => new FileSystemStorageBackend({ localDataDirectory: temporaryDirectory() }),
    ],
])('%s.purge', (_backendName, createBackend) => {
    test('empties alias-keyed storages along with the default one', async () => {
        const backend = createBackend();

        const defaultQueue = await backend.createRequestQueueBackend();
        const aliasQueue = await backend.createRequestQueueBackend({ alias: 'run-scoped' });
        const defaultDataset = await backend.createDatasetBackend();
        const aliasDataset = await backend.createDatasetBackend({ alias: 'run-scoped' });

        await defaultQueue.addBatchOfRequests([requestOf('https://example.com/default')]);
        await aliasQueue.addBatchOfRequests([requestOf('https://example.com/alias')]);
        await defaultDataset.pushData([{ from: 'default' }]);
        await aliasDataset.pushData([{ from: 'alias' }]);

        await backend.purge!();

        expect(await pendingCount(defaultQueue)).toBe(0);
        expect(await pendingCount(aliasQueue)).toBe(0);
        await expect(defaultDataset.getData()).resolves.toMatchObject({ items: [] });
        await expect(aliasDataset.getData()).resolves.toMatchObject({ items: [] });
    });

    test('keeps named storages', async () => {
        const backend = createBackend();

        const namedQueue = await backend.createRequestQueueBackend({ name: 'persistent' });
        const namedDataset = await backend.createDatasetBackend({ name: 'persistent' });

        await namedQueue.addBatchOfRequests([requestOf('https://example.com/named')]);
        await namedDataset.pushData([{ from: 'named' }]);

        await backend.purge!();

        expect(await pendingCount(namedQueue)).toBe(1);
        await expect(namedDataset.getData()).resolves.toMatchObject({ items: [{ from: 'named' }] });
    });

    // The run input lives in the default key-value store, so that one store keeps its `INPUT` key.
    // An alias-keyed store is just another run-scoped storage — nothing there is the run input.
    test('keeps INPUT in the default key-value store but not in an alias-keyed one', async () => {
        const backend = createBackend();

        const defaultStore = await backend.createKeyValueStoreBackend();
        const aliasStore = await backend.createKeyValueStoreBackend({ alias: 'run-scoped' });

        await defaultStore.setValue(input);
        await aliasStore.setValue(input);

        await backend.purge!();

        expect(await readInput(defaultStore)).toBe(input.value);
        expect(await readInput(aliasStore)).toBeUndefined();
    });
});

// The file system backend has to find leftovers on disk, since a fresh process starts with an empty
// backend cache and knows nothing about the storages the previous run opened.
describe('FileSystemStorageBackend.purge over a pre-existing storage directory', () => {
    const localDataDirectory = temporaryDirectory();

    test('empties an alias-keyed queue left behind by a previous process', async () => {
        const firstRun = new FileSystemStorageBackend({ localDataDirectory });
        const queue = await firstRun.createRequestQueueBackend({ alias: 'throttled-example.com' });
        await queue.addBatchOfRequests([requestOf('https://example.com/left-behind')]);
        await firstRun.teardown();

        const secondRun = new FileSystemStorageBackend({ localDataDirectory });
        await secondRun.purge();

        const reopened = await secondRun.createRequestQueueBackend({ alias: 'throttled-example.com' });
        expect(await pendingCount(reopened)).toBe(0);
    });

    test('keeps a named queue left behind by a previous process', async () => {
        const firstRun = new FileSystemStorageBackend({ localDataDirectory });
        const queue = await firstRun.createRequestQueueBackend({ name: 'persistent-across-runs' });
        await queue.addBatchOfRequests([requestOf('https://example.com/keep-me')]);
        await firstRun.teardown();

        const secondRun = new FileSystemStorageBackend({ localDataDirectory });
        await secondRun.purge();

        const reopened = await secondRun.createRequestQueueBackend({ name: 'persistent-across-runs' });
        expect(await pendingCount(reopened)).toBe(1);
    });

    // A directory without `__metadata__.json` was not created by Crawlee — most likely a hand-placed
    // input directory. Purging it would delete data we never wrote.
    test('leaves a storage directory it did not create alone', async () => {
        const foreignDirectory = temporaryDirectory();
        const backend = new FileSystemStorageBackend({ localDataDirectory: foreignDirectory });
        await mkdir(resolve(backend.keyValueStoresDirectory, 'hand-placed'), { recursive: true });
        await writeFile(resolve(backend.keyValueStoresDirectory, 'hand-placed', 'INPUT.json'), '{"hand":"placed"}');

        await backend.purge();

        const store = await backend.createKeyValueStoreBackend({ name: 'hand-placed' });
        expect(await readInput(store)).toBe('{"hand":"placed"}');
    });

    // An unnamed storage whose directory is named after its own id can only be reached through
    // `{ id }` — not a run-scoped identifier, so it is not ours to empty.
    test('leaves an unnamed storage directory named after its own id alone', async () => {
        const ownDirectory = temporaryDirectory();
        const firstRun = new FileSystemStorageBackend({ localDataDirectory: ownDirectory });
        const dataset = await firstRun.createDatasetBackend({ name: 'seed' });
        await dataset.pushData([{ from: 'another-tool' }]);
        await firstRun.teardown();

        // Turn the fixture into an unnamed storage living in an id-named directory.
        const metadataPath = resolve(firstRun.datasetsDirectory, 'seed', '__metadata__.json');
        const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as { id: string };
        const { id } = metadata;
        await writeFile(metadataPath, JSON.stringify({ ...metadata, name: null }));
        await rename(resolve(firstRun.datasetsDirectory, 'seed'), resolve(firstRun.datasetsDirectory, id));

        const secondRun = new FileSystemStorageBackend({ localDataDirectory: ownDirectory });
        await secondRun.purge();

        const reopened = await secondRun.createDatasetBackend({ id });
        await expect(reopened.getData()).resolves.toMatchObject({ items: [{ from: 'another-tool' }] });
    });
});

// Every crawler instance past the first gets an `__default_<id>__` queue from `openOwnedRequestQueue`,
// so leaking those across runs makes a second crawler silently resume the previous run's requests even
// with `purgeOnStart` enabled.
describe('purgeDefaultStorages', () => {
    afterEach(() => {
        serviceLocator.reset();
    });

    test('clears the default queue', async () => {
        serviceLocator.setStorageBackend(new FileSystemStorageBackend({ localDataDirectory: temporaryDirectory() }));

        const defaultQueue = await RequestQueue.open();
        await defaultQueue.addRequest({ url: 'https://example.com/stale' });
        await purgeDefaultStorages();

        expect((await defaultQueue.checkReadiness()).status).toBe('finished');
    });

    test('clears a crawler-owned alias queue left behind by a previous run', async () => {
        const localDataDirectory = temporaryDirectory();
        serviceLocator.setStorageBackend(new FileSystemStorageBackend({ localDataDirectory }));
        const firstRun = await RequestQueue.open({ alias: '__default_1__' });
        await firstRun.addRequest({ url: 'https://example.com/left-behind' });
        await serviceLocator.getStorageBackend().teardown!();

        serviceLocator.reset();
        serviceLocator.setStorageBackend(new FileSystemStorageBackend({ localDataDirectory }));
        await purgeDefaultStorages();

        const secondRun = await RequestQueue.open({ alias: '__default_1__' });
        expect((await secondRun.checkReadiness()).status).toBe('finished');
    });
});
