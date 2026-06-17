import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageClient } from '@crawlee/fs-storage';
import type { RequestQueueClient } from '@crawlee/types';

describe('RequestQueue handledRequestCount should update', () => {
    // Use an isolated storage directory so persisted request files from a previous run cannot leak
    // into this one (a handled request surviving on disk would be deduplicated on the next add).
    const localDataDirectory = resolve(import.meta.dirname, './tmp/handled-request-count');
    const storage = new FileSystemStorageClient({ localDataDirectory });

    let requestQueue: RequestQueueClient;

    beforeAll(async () => {
        requestQueue = await storage.createRequestQueueClient({ name: 'handledRequestCount' });
    });

    afterAll(async () => {
        await rm(localDataDirectory, { force: true, recursive: true });
    });

    test('after marking a request as handled, it should increment the handledRequestCount', async () => {
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

        const request = await requestQueue.fetchNextRequest();
        expect(request).not.toBeNull();

        await requestQueue.markRequestAsHandled({
            url: 'http://example.com/1',
            uniqueKey: '1',
            id: request!.id!,
        });

        const updatedStatistics = await requestQueue.getMetadata();
        expect(updatedStatistics.handledRequestCount).toEqual(1);
    });

    test('adding an already handled request should increment the handledRequestCount', async () => {
        await requestQueue.addBatchOfRequests([
            {
                url: 'http://example.com/2',
                uniqueKey: '2',
                handledAt: new Date().toISOString(),
            },
        ]);

        const updatedStatistics = await requestQueue.getMetadata();
        expect(updatedStatistics.handledRequestCount).toEqual(2);
    });
});
