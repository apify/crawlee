import { MemoryStorage } from '@crawlee/memory-storage';
import type { RequestQueueInfo } from '@crawlee/types';
import { Configuration, RequestQueue } from 'crawlee';

const originalClient = Configuration.getStorageClient();
Configuration.useStorageClient(new MemoryStorage({ persistStorage: false, writeMetadata: false }));

afterAll(() => {
    Configuration.useStorageClient(originalClient);
});

let requestQueueInfo: RequestQueueInfo;

beforeAll(async () => {
    requestQueueInfo = await Configuration.getStorageClient().requestQueues().getOrCreate('test-request-queue-not-called-on-cached-request');
});

describe('RequestQueue#addRequest should not call the API if the request is already in the queue', () => {
    test('should not call the API if the request is already in the queue', async () => {
        const requestQueue = new RequestQueue({ id: requestQueueInfo.id, client: Configuration.getStorageClient() });

        const clientSpy = vitest.spyOn(requestQueue.client, 'addRequest');

        const requestData = await requestQueue.addRequest({ url: 'https://example.com' });

        expect(clientSpy).toHaveBeenCalledTimes(1);

        await requestQueue.markRequestHandled({ id: requestData.requestId, uniqueKey: requestData.uniqueKey } as any);

        await requestQueue.addRequest({ url: 'https://example.com' });

        expect(clientSpy).toHaveBeenCalledTimes(1);
    });
});

describe('RequestQueue#addRequests should not call the API if the request is already in the queue', () => {
    test('should not call the API if the request is already in the queue', async () => {
        const requestQueue = new RequestQueue({ id: requestQueueInfo.id, client: Configuration.getStorageClient() });

        const clientSpy = vitest.spyOn(requestQueue.client, 'batchAddRequests');

        const requestData = await requestQueue.addRequests([{ url: 'https://example2.com' }]);

        expect(clientSpy).toHaveBeenCalledTimes(1);

        await requestQueue.markRequestHandled({ id: requestData.processedRequests[0].requestId, uniqueKey: requestData.processedRequests[0].uniqueKey } as any);

        await requestQueue.addRequests([{ url: 'https://example2.com' }]);

        expect(clientSpy).toHaveBeenCalledTimes(1);
    });
});
