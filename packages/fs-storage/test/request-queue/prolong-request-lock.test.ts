import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageBackend } from '@crawlee/fs-storage';

// The native `@crawlee/fs-storage-native` extension owns the in-progress locks it hands out with
// `fetchNextRequest`. These tests verify the adapter forwards `prolongRequestLock` — the hook
// `context.extendTimeout` reaches through `RequestQueue` — down to those locks: a fetched
// (locked) request can be extended, and an id the queue holds no lock for reports `false`.
describe('FileSystemStorageBackend prolongRequestLock', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/prolong-request-lock');

    afterEach(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('extends the lock on a fetched request, false for one never locked', async () => {
        const storage = new FileSystemStorageBackend({
            localDataDirectory: tmpLocation,
        });
        const queue = await storage.createRequestQueueBackend({
            name: 'default',
        });
        await queue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

        const locked = await queue.fetchNextRequest();
        expect(locked).toBeDefined();

        expect(await queue.prolongRequestLock(locked!.id!, 30)).toBe(true);
        expect(await queue.prolongRequestLock('no-such-request', 30)).toBe(false);

        await queue.drop();
    });
});
