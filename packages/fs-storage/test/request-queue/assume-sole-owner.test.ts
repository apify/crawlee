import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageClient } from '@crawlee/fs-storage';

// `assumeSoleOwner` controls how the native `@crawlee/fs-storage-native` extension treats requests
// left *in progress* by a previous run (a dangling `orderNo` lock on disk) when a queue is reopened.
// The reclaim/respect-peer-lock semantics are owned by the native extension; these tests verify the
// adapter's contract on top of it: the option defaults to `true`, is honored when set, and that the
// resulting behavior reaches all the way down to the native queue.
describe('FileSystemStorageClient assumeSoleOwner', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/assume-sole-owner');

    afterEach(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('defaults to true', () => {
        const storage = new FileSystemStorageClient({ localDataDirectory: tmpLocation });
        expect(storage.assumeSoleOwner).toBe(true);
    });

    test('respects an explicit false', () => {
        const storage = new FileSystemStorageClient({ localDataDirectory: tmpLocation, assumeSoleOwner: false });
        expect(storage.assumeSoleOwner).toBe(false);
    });

    // Seed a queue with two requests, fetch (lock) one without handling it or tearing down — leaving a
    // dangling in-progress lock on disk, exactly the "process died mid-flight" situation.
    async function seedQueueWithDanglingLock(dir: string) {
        const storage = new FileSystemStorageClient({ localDataDirectory: dir });
        const queue = await storage.createRequestQueueClient({ name: 'default' });
        await queue.addBatchOfRequests([
            { url: 'http://example.com/1', uniqueKey: '1' },
            { url: 'http://example.com/2', uniqueKey: '2' },
        ]);
        const locked = await queue.fetchNextRequest();
        expect(locked).not.toBeNull();
        // Intentionally NO markRequestAsHandled and NO teardown/persistState — the lock is left dangling.
        return locked!;
    }

    test('true (default): reopening preserves contents but relinquishes the dangling lock', async () => {
        const dir = resolve(tmpLocation, 'sole-owner-true');
        const locked = await seedQueueWithDanglingLock(dir);

        // Reopen the same directory as sole owner, without purging.
        const reopened = new FileSystemStorageClient({ localDataDirectory: dir, assumeSoleOwner: true });
        const queue = await reopened.createRequestQueueClient({ name: 'default' });

        // Contents preserved: both requests still present, none handled.
        const metadata = await queue.getMetadata();
        expect(metadata.totalRequestCount).toBe(2);
        expect(metadata.handledRequestCount).toBe(0);
        expect(metadata.pendingRequestCount).toBe(2);

        // Lock relinquished: BOTH requests are fetchable again, including the one locked before.
        const a = await queue.fetchNextRequest();
        const b = await queue.fetchNextRequest();
        expect([a?.uniqueKey, b?.uniqueKey].sort()).toStrictEqual(['1', '2']);
        // The previously-locked request survived with its data intact.
        const reFetched = await queue.getRequest(locked.uniqueKey);
        expect(reFetched?.url).toBe(locked.url);
    });

    test('false: reopening keeps the dangling lock (concurrency-safe mode)', async () => {
        const dir = resolve(tmpLocation, 'sole-owner-false');
        await seedQueueWithDanglingLock(dir);

        // Reopen in concurrency-safe mode: an in-progress request is treated as a potential live peer's
        // lock and is NOT reclaimed until it expires.
        const reopened = new FileSystemStorageClient({ localDataDirectory: dir, assumeSoleOwner: false });
        const queue = await reopened.createRequestQueueClient({ name: 'default' });

        // Contents are still preserved...
        const metadata = await queue.getMetadata();
        expect(metadata.totalRequestCount).toBe(2);
        expect(metadata.pendingRequestCount).toBe(2);

        // ...but only the un-locked request is handed out; the locked one stays in progress.
        const a = await queue.fetchNextRequest();
        expect(a?.uniqueKey).toBe('2');
        expect(await queue.fetchNextRequest()).toBeNull();
    });
});
