import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageBackend } from '@crawlee/fs-storage';

describe('FileSystemStorageBackend extendRequestProcessingTimeSecs', () => {
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

        expect(await queue.extendRequestProcessingTimeSecs(locked!.id!, 30)).toBe(true);
        expect(await queue.extendRequestProcessingTimeSecs('no-such-request', 30)).toBe(false);

        await queue.drop();
    });
});
