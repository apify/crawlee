import { MemoryStorage } from '@crawlee/memory-storage';
import type { RequestQueueClient } from '@crawlee/types';

describe('RequestQueue handledRequestCount should update', () => {
    const storage = new MemoryStorage({
        persistStorage: false,
    });

    let requestQueue: RequestQueueClient;

    beforeAll(async () => {
        const { id } = await storage.requestQueues().getOrCreate('handledRequestCount');
        requestQueue = storage.requestQueue(id);
    });

    test('after updating the request, it should increment the handledRequestCount', async () => {
        const { requestId } = await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' });

        await requestQueue.updateRequest({
            url: 'http://example.com/1',
            uniqueKey: '1',
            id: requestId,
            handledAt: new Date().toISOString(),
        });

        const updatedStatistics = await requestQueue.get();
        expect(updatedStatistics?.handledRequestCount).toEqual(1);
    });
});
