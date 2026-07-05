import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageBackend } from '@crawlee/fs-storage';

// The native client owns request-queue persistence; what this test exercises is the *adapter* wiring
// that drives it: `FileSystemStorageBackend.teardown()` must flush every opened queue's state via
// `persistState()`, and reopening through a fresh `FileSystemStorageBackend` over the same directory
// must restore the pending requests (with the adapter's request mapping intact).
describe('Request queue persists across reopen via teardown', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/req-queue-reload');

    afterEach(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('requests added and persisted are restored when the queue is reopened', async () => {
        const storage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation });
        const queue = await storage.createRequestQueueClient({ name: 'default' });

        await queue.addBatchOfRequests([
            { url: 'http://example.com/1', uniqueKey: '1' },
            { url: 'http://example.com/2', uniqueKey: '2' },
        ]);

        // `teardown` flushes the native client state to disk.
        await storage.teardown();

        // Reopen over the same directory, emulating a fresh process.
        const reopenedStorage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation });
        const reopenedQueue = await reopenedStorage.createRequestQueueClient({ name: 'default' });

        const metadata = await reopenedQueue.getMetadata();
        expect(metadata.pendingRequestCount).toBe(2);
        expect(metadata.totalRequestCount).toBe(2);

        const first = await reopenedQueue.fetchNextRequest();
        const second = await reopenedQueue.fetchNextRequest();

        expect([first?.url, second?.url].sort()).toStrictEqual(['http://example.com/1', 'http://example.com/2']);
        expect(await reopenedQueue.fetchNextRequest()).toBeUndefined();
    });
});
