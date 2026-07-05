import { MemoryStorageBackend } from '@crawlee/core';
import type { RequestQueueClient } from '@crawlee/types';

describe('RequestQueue handledRequestCount should update', () => {
    const storage = new MemoryStorageBackend();

    let requestQueue: RequestQueueClient;

    beforeAll(async () => {
        requestQueue = await storage.createRequestQueueClient({ name: 'handledRequestCount' });
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
