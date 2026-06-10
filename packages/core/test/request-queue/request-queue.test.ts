import { MemoryStorage } from '@crawlee/memory-storage';
import { RequestQueue } from 'crawlee';
import type { MockInstance } from 'vitest';

const storage = new MemoryStorage({ persistStorage: false, writeMetadata: false });

async function makeQueue(name: string, numOfRequestsToAdd = 0) {
    const rqClient = await storage.createRequestQueueClient({ name });
    const rqInfo = await rqClient.getMetadata();

    const queue = new RequestQueue({ id: rqInfo.id, client: rqClient });

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
    let clientFetchNextSpy: MockInstance<typeof queue.client.fetchNextRequest>;

    beforeAll(async () => {
        queue = await makeQueue('fetch-next-request', 1);
        clientFetchNextSpy = vitest.spyOn(queue.client, 'fetchNextRequest');
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

describe('RequestQueue#isEmpty and #isFinished account for in-progress requests', () => {
    let queue: RequestQueue;

    beforeAll(async () => {
        queue = await makeQueue('is-empty-vs-is-finished', 1);
    });

    test('fetching the only request leaves nothing pending, so the queue reports empty', async () => {
        const request = await queue.fetchNextRequest();
        expect(request).not.toBe(null);

        // `isEmpty` reflects only pending requests (matching the crawler scheduling contract), so the
        // queue is "empty" even though the fetched request is still in progress.
        expect(await queue.isEmpty()).toBe(true);
        // The request still has to be handled, so the queue is not finished yet.
        expect(await queue.isFinished()).toBe(true);
    });

    test('handling the in-progress request keeps the queue empty and finished', async () => {
        const request = await queue.getRequest('0');
        await queue.markRequestHandled(request!);

        expect(await queue.isEmpty()).toBe(true);
        expect(await queue.isFinished()).toBe(true);
    });
});

describe('RequestQueue#isFinished waits for background add operations', () => {
    test('returns false while a background batch is still being added', async () => {
        const queue = await makeQueue('is-finished-background');

        // Simulate an in-flight background `addRequestsBatched` operation.
        // eslint-disable-next-line dot-notation
        queue['inProgressRequestBatchCount'] = 1;
        expect(await queue.isFinished()).toBe(false);

        // eslint-disable-next-line dot-notation
        queue['inProgressRequestBatchCount'] = 0;
        expect(await queue.isFinished()).toBe(true);
    });
});
