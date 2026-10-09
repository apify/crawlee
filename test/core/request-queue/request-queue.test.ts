import { MemoryStorageBackend } from '@crawlee/core';
import { RequestQueue } from 'crawlee';
import type { MockInstance } from 'vitest';

const storage = new MemoryStorageBackend();

async function makeQueue(name: string, numOfRequestsToAdd = 0) {
    const rqClient = await storage.createRequestQueueBackend({ name });
    const rqInfo = await rqClient.getMetadata();

    const queue = new RequestQueue({ metadata: rqInfo, backend: rqClient });

    if (numOfRequestsToAdd) {
        await queue.addRequests(
            Array.from({ length: numOfRequestsToAdd }, (_, i) => ({ url: 'https://example.com', uniqueKey: `${i}` })),
        );
    }

    return queue;
}

vitest.setConfig({ restoreMocks: false });

describe('RequestQueue#fetchNextRequest delegates to the client', () => {
    let queue: RequestQueue;
    let clientFetchNextSpy: MockInstance<typeof queue.backend.fetchNextRequest>;

    beforeAll(async () => {
        queue = await makeQueue('fetch-next-request', 1);
        clientFetchNextSpy = vitest.spyOn(queue.backend, 'fetchNextRequest');
    });

    test('returns the first request via the client', async () => {
        expect(await queue.fetchNextRequest()).not.toBe(null);
        expect(clientFetchNextSpy).toHaveBeenCalled();
    });

    test('returns null once all requests are in progress', async () => {
        // The single request was already fetched (and is in progress) above.
        expect(await queue.fetchNextRequest()).toBe(null);
    });
});

describe('RequestQueue#checkReadiness treats in-progress requests differently from handled ones', () => {
    let queue: RequestQueue;

    beforeAll(async () => {
        queue = await makeQueue('is-empty-vs-is-finished', 1);
    });

    test('a fetched (in-progress) request leaves the queue waiting rather than finished', async () => {
        const request = await queue.fetchNextRequest();
        expect(request).not.toBe(null);

        // The in-progress request is locked, not handled, and might still be reclaimed — reporting `waiting`
        // rather than `finished` is what prevents a crawler from shutting down while it is being processed.
        expect((await queue.checkReadiness()).status).toBe('waiting');
    });

    test('handling the in-progress request finishes the queue', async () => {
        const request = await queue.getRequest('0');
        await queue.markRequestAsHandled(request!);

        expect((await queue.checkReadiness()).status).toBe('finished');
    });
});

describe('RequestQueue#checkReadiness waits for background add operations', () => {
    test('reports waiting while a background batch is still being added', async () => {
        const queue = await makeQueue('is-finished-background');

        expect((await queue.checkReadiness()).status).toBe('finished');

        let callCount = 0;
        let resolveBatch!: () => void;
        const batchBlocked = new Promise<void>((resolve) => {
            resolveBatch = resolve;
        });

        const originalAddRequests = queue.addRequests.bind(queue);
        vitest.spyOn(queue, 'addRequests').mockImplementation(async (...args) => {
            callCount++;
            if (callCount > 1) {
                await batchBlocked;
            }
            return originalAddRequests(...args);
        });

        const result = await queue.addRequestsBatched(
            [{ url: 'https://example.com/1' }, { url: 'https://example.com/2' }],
            { batchSize: 1, waitBetweenBatchesMillis: 0 },
        );

        const req1 = await queue.fetchNextRequest();
        expect(req1).toBeDefined();
        await queue.markRequestAsHandled(req1!);

        // The 2nd batch is still in flight in the background.
        expect((await queue.checkReadiness()).status).toBe('waiting');

        // Unblock the background batch and wait for it to complete.
        resolveBatch();
        await result.waitForAllRequestsToBeAdded;

        const req2 = await queue.fetchNextRequest();
        expect(req2).toBeDefined();
        await queue.markRequestAsHandled(req2!);

        expect((await queue.checkReadiness()).status).toBe('finished');
    });
});
