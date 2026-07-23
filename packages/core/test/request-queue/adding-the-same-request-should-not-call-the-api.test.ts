import { MemoryStorageBackend } from '@crawlee/core';
import type { RequestQueueBackend } from '@crawlee/types';
import { RequestQueue, serviceLocator } from 'crawlee';

let rqClient: RequestQueueBackend;

beforeEach(async () => {
    const storage = new MemoryStorageBackend();
    serviceLocator.setStorageBackend(storage);
    rqClient = await storage.createRequestQueueBackend({ name: 'test-request-queue-not-called-on-cached-request' });
});

describe('RequestQueue#addRequest should not call the API if the request is already in the queue', () => {
    test('should not call the API if the request is already in the queue', async () => {
        const config = serviceLocator.getConfiguration();
        const rqInfo = await rqClient.getMetadata();
        const requestQueue = new RequestQueue({ metadata: rqInfo, backend: rqClient }, config);

        const clientSpy = vitest.spyOn(requestQueue.backend, 'addBatchOfRequests');

        await requestQueue.addRequest({ url: 'https://example.com' });

        expect(clientSpy).toHaveBeenCalledTimes(1);

        // Fetch and handle the request so it leaves the pending queue.
        const fetched = await requestQueue.fetchNextRequest();
        await requestQueue.markRequestAsHandled(fetched!);

        // Adding the same request again is served from the local cache and must not hit the client.
        await requestQueue.addRequest({ url: 'https://example.com' });

        expect(clientSpy).toHaveBeenCalledTimes(1);
    });
});

describe('RequestQueue#addRequests should not call the API if the request is already in the queue', () => {
    test('should not call the API if the request is already in the queue', async () => {
        const config = serviceLocator.getConfiguration();
        const rqInfo = await rqClient.getMetadata();
        const requestQueue = new RequestQueue({ metadata: rqInfo, backend: rqClient }, config);

        const clientSpy = vitest.spyOn(requestQueue.backend, 'addBatchOfRequests');

        await requestQueue.addRequests([{ url: 'https://example2.com' }]);

        expect(clientSpy).toHaveBeenCalledTimes(1);

        // Fetch and handle the request so it leaves the pending queue.
        const fetched = await requestQueue.fetchNextRequest();
        await requestQueue.markRequestAsHandled(fetched!);

        // Adding the same request again is served from the local cache and must not hit the client.
        await requestQueue.addRequests([{ url: 'https://example2.com' }]);

        expect(clientSpy).toHaveBeenCalledTimes(1);
    });
});
