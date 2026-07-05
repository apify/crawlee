import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageBackend } from '@crawlee/fs-storage';

// `requestQueueAccess` controls how the native `@crawlee/fs-storage-native` extension treats requests
// left *in progress* by a previous run (a dangling `orderNo` lock on disk) when a queue is reopened.
// The reclaim/respect-peer-lock semantics are owned by the native extension; these tests verify the
// adapter's contract on top of it: the option defaults to `'single'`, is honored when set to
// `'shared'`, and that the resulting behavior reaches all the way down to the native queue.
describe('FileSystemStorageBackend requestQueueAccess', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/request-queue-access');

    afterEach(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test("defaults to 'single'", () => {
        const storage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation });
        expect(storage.requestQueueAccess).toBe('single');
    });

    test("respects an explicit 'shared'", () => {
        const storage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation, requestQueueAccess: 'shared' });
        expect(storage.requestQueueAccess).toBe('shared');
    });

    // Seed a queue with two requests, fetch (lock) one without handling it or tearing down — leaving a
    // dangling in-progress lock on disk, exactly the "process died mid-flight" situation.
    async function seedQueueWithDanglingLock(dir: string) {
        const storage = new FileSystemStorageBackend({ localDataDirectory: dir });
        const queue = await storage.createRequestQueueClient({ name: 'default' });
        await queue.addBatchOfRequests([
            { url: 'http://example.com/1', uniqueKey: '1' },
            { url: 'http://example.com/2', uniqueKey: '2' },
        ]);
        const locked = await queue.fetchNextRequest();
        expect(locked).toBeDefined();
        // Intentionally NO markRequestAsHandled and NO teardown/persistState — the lock is left dangling.
        return locked!;
    }

    test("'single' (default): reopening preserves contents but relinquishes the dangling lock", async () => {
        const dir = resolve(tmpLocation, 'single');
        const locked = await seedQueueWithDanglingLock(dir);

        // Reopen the same directory as sole owner, without purging.
        const reopened = new FileSystemStorageBackend({ localDataDirectory: dir, requestQueueAccess: 'single' });
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

    test("'shared': reopening keeps the dangling lock (concurrency-safe mode)", async () => {
        const dir = resolve(tmpLocation, 'shared');
        await seedQueueWithDanglingLock(dir);

        // Reopen in concurrency-safe mode: an in-progress request is treated as a potential live peer's
        // lock and is NOT reclaimed until it expires.
        const reopened = new FileSystemStorageBackend({ localDataDirectory: dir, requestQueueAccess: 'shared' });
        const queue = await reopened.createRequestQueueClient({ name: 'default' });

        // Contents are still preserved...
        const metadata = await queue.getMetadata();
        expect(metadata.totalRequestCount).toBe(2);
        expect(metadata.pendingRequestCount).toBe(2);

        // ...but only the un-locked request is handed out; the locked one stays in progress.
        const a = await queue.fetchNextRequest();
        expect(a?.uniqueKey).toBe('2');
        expect(await queue.fetchNextRequest()).toBeUndefined();
    });
});
