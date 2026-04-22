import { MemoryStorage } from '@crawlee/memory-storage';
import type { RequestQueueClient } from '@crawlee/types';
import { RequestQueue, serviceLocator } from 'crawlee';

let rqClient: RequestQueueClient;

beforeEach(async () => {
    const storage = new MemoryStorage({ persistStorage: false, writeMetadata: false });
    serviceLocator.setStorageClient(storage);
    rqClient = await storage.createRequestQueueClient({ name: 'test-request-queue-not-called-on-cached-request' });
});

describe('RequestQueue#addRequest should not call the API if the request is already in the queue', () => {
    test('should not call the API if the request is already in the queue', async () => {
        const config = serviceLocator.getConfiguration();
        const rqInfo = await rqClient.getMetadata();
        const requestQueue = new RequestQueue({ id: rqInfo.id, client: rqClient }, config);

        const clientSpy = vitest.spyOn(requestQueue.client, 'addRequest');

        const requestData = await requestQueue.addRequest({ url: 'https://example.com' });

        expect(clientSpy).toHaveBeenCalledTimes(1);

        await requestQueue.markRequestHandled({
            id: requestData.requestId,
            url: 'https://example.com',
            uniqueKey: requestData.uniqueKey,
        } as any);

        await requestQueue.addRequest({ url: 'https://example.com' });

        expect(clientSpy).toHaveBeenCalledTimes(1);
    });
});

describe('RequestQueue#addRequests should not call the API if the request is already in the queue', () => {
    test('should not call the API if the request is already in the queue', async () => {
        const config = serviceLocator.getConfiguration();
        const rqInfo = await rqClient.getMetadata();
        const requestQueue = new RequestQueue({ id: rqInfo.id, client: rqClient }, config);

        const clientSpy = vitest.spyOn(requestQueue.client, 'batchAddRequests');

        const requestData = await requestQueue.addRequests([{ url: 'https://example2.com' }]);

        expect(clientSpy).toHaveBeenCalledTimes(1);

        await requestQueue.markRequestHandled({
            id: requestData.processedRequests[0].requestId,
            uniqueKey: requestData.processedRequests[0].uniqueKey,
            url: 'https://example2.com',
        } as any);

        await requestQueue.addRequests([{ url: 'https://example2.com' }]);

        expect(clientSpy).toHaveBeenCalledTimes(1);
    });
});
