import { MemoryStorageBackend } from '@crawlee/core';
import type { RequestQueueBackend } from '@crawlee/types';

describe('RequestQueue in-progress requests', () => {
    test('a fetched request stays in progress until it is handled or reclaimed', async () => {
        const storage = new MemoryStorageBackend();
        const queue: RequestQueueBackend = await storage.createRequestQueueBackend({ name: 'in-progress' });

        await queue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

        const fetched = await queue.fetchNextRequest();
        expect(fetched).not.toBeNull();

        // While in progress, the request must not be handed out again. There is nothing fetchable, so the
        // queue is empty — but the in-progress request means it is not yet finished. Unlike the previous
        // disk-backed implementation, there is no lock expiry: the request never becomes fetchable again
        // on its own.
        expect(await queue.fetchNextRequest()).toBeUndefined();
        expect(await queue.isEmpty()).toBe(true);
        expect(await queue.isFinished()).toBe(false);
    });

    test('a fetched request becomes fetchable again once reclaimed', async () => {
        const storage = new MemoryStorageBackend();
        const queue: RequestQueueBackend = await storage.createRequestQueueBackend({ name: 'reclaim' });

        await queue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

        const fetched = await queue.fetchNextRequest();
        expect(fetched).not.toBeNull();

        const result = await queue.reclaimRequest({ ...fetched!, id: fetched!.id as string }, { forefront: true });
        expect(result).not.toBeNull();

        // The reclaimed request is no longer in progress, so it is pending and fetchable again.
        expect(await queue.isEmpty()).toBe(false);
        expect((await queue.fetchNextRequest())?.uniqueKey).toBe('1');
    });

    test('an in-progress request can be marked as handled', async () => {
        const storage = new MemoryStorageBackend();
        const queue: RequestQueueBackend = await storage.createRequestQueueBackend({ name: 'handle' });

        await queue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

        const fetched = await queue.fetchNextRequest();
        expect(fetched).not.toBeNull();

        const result = await queue.markRequestAsHandled({ ...fetched!, id: fetched!.id as string });
        expect(result).not.toBeNull();

        // The request must be counted as handled and never handed out again.
        const metadata = await queue.getMetadata();
        expect(metadata.handledRequestCount).toBe(1);
        expect(metadata.pendingRequestCount).toBe(0);
        expect(await queue.isEmpty()).toBe(true);
        expect(await queue.isFinished()).toBe(true);
        expect(await queue.fetchNextRequest()).toBeUndefined();
    });

    test('multiple requests are each handed out only once while in progress', async () => {
        const storage = new MemoryStorageBackend();
        const queue: RequestQueueBackend = await storage.createRequestQueueBackend({ name: 'multi' });

        await queue.addBatchOfRequests([
            { url: 'http://example.com/1', uniqueKey: '1' },
            { url: 'http://example.com/2', uniqueKey: '2' },
        ]);

        const first = await queue.fetchNextRequest();
        const second = await queue.fetchNextRequest();

        expect(first).not.toBeNull();
        expect(second).not.toBeNull();
        // The two fetches return distinct requests; neither is handed out twice.
        expect(first!.uniqueKey).not.toBe(second!.uniqueKey);

        // Both are now in progress, so nothing more is fetchable.
        expect(await queue.fetchNextRequest()).toBeUndefined();
        expect(await queue.isFinished()).toBe(false);
    });

    test('dropping a queue with a pending forefront request does not corrupt later head scans', async () => {
        const storage = new MemoryStorageBackend();
        const queue: RequestQueueBackend = await storage.createRequestQueueBackend({ name: 'drop-forefront' });

        // A forefront request leaves an id in `forefrontRequestIds`. `drop` must clear that alongside the
        // `requests` map, otherwise a later head scan would resolve the dangling id to a missing request
        // and dereference `undefined`.
        await queue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }], { forefront: true });

        await queue.drop();

        // A head scan on the dropped client must not throw and must report an empty, finished queue.
        await expect(queue.isEmpty()).resolves.toBe(true);
        await expect(queue.isFinished()).resolves.toBe(true);
        await expect(queue.fetchNextRequest()).resolves.toBeUndefined();
    });
});
