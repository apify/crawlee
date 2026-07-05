import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { MemoryStorageClient } from '@crawlee/core';
import type { RequestQueueClient } from '@crawlee/types';

/**
 * Drains the queue via `fetchNextRequest`, marking each request as handled, and returns the
 * pathnames in the order they were served.
 */
async function fetchOrder(client: RequestQueueClient): Promise<string[]> {
    const order: string[] = [];

    for (let request = await client.fetchNextRequest(); request != null; request = await client.fetchNextRequest()) {
        order.push(new URL(request.url).pathname);
        await client.markRequestAsHandled({ ...request, id: request.id! });
    }

    return order;
}

describe('RequestQueue respects `forefront` when fetching requests', () => {
    const storage = new MemoryStorageClient();

    let requestQueue: RequestQueueClient;

    beforeEach(async () => {
        requestQueue = await storage.createRequestQueueClient({ name: 'forefront' });
    });

    afterEach(async () => {
        await requestQueue.drop();
    });

    test('requests without `forefront` respect sequential order', async () => {
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);
        // Waiting a few ms is required since we use Date.now() to compute orderNo
        await sleep(2);
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/2', uniqueKey: '2' }]);

        expect(await fetchOrder(requestQueue)).toEqual(['/1', '/2']);
    });

    test('`forefront` requests are prioritized', async () => {
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);
        // Waiting a few ms is required since we use Date.now() to compute orderNo
        await sleep(2);
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/2', uniqueKey: '2' }], { forefront: true });

        expect(await fetchOrder(requestQueue)).toEqual(['/2', '/1']);
    });

    test('global `forefront` ordering is preserved across several inserts', async () => {
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);
        await sleep(2);
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/2', uniqueKey: '2' }], { forefront: true });
        await sleep(2);
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/3', uniqueKey: '3' }], { forefront: true });

        expect(await fetchOrder(requestQueue)).toEqual(['/3', '/2', '/1']);
    });

    test('`addBatchOfRequests` respects `forefront`', async () => {
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/3', uniqueKey: '3' }]);

        await sleep(2);

        await requestQueue.addBatchOfRequests(
            [
                { url: 'http://example.com/1', uniqueKey: '1' },
                { url: 'http://example.com/2', uniqueKey: '2' },
            ],
            { forefront: true },
        );

        const order = await fetchOrder(requestQueue);
        expect(order).toHaveLength(3);
        // Both forefront requests come before the original; their relative order is arbitrary.
        expect(order[2]).toEqual('/3');
        expect([
            ['/2', '/1', '/3'],
            ['/1', '/2', '/3'],
        ]).toContainEqual(order);
    });

    test('a reclaimed request is served again', async () => {
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

        const first = await requestQueue.fetchNextRequest();
        expect(first!.url).toEqual('http://example.com/1');

        // Reclaiming a fetched (in-progress) request returns it to the queue.
        await requestQueue.reclaimRequest({ ...first!, id: first!.id! });

        const second = await requestQueue.fetchNextRequest();
        expect(second!.url).toEqual('http://example.com/1');
    });

    test('a reclaimed `forefront` request jumps to the front', async () => {
        await requestQueue.addBatchOfRequests([
            { url: 'http://example.com/1', uniqueKey: '1' },
            { url: 'http://example.com/2', uniqueKey: '2' },
        ]);

        const first = await requestQueue.fetchNextRequest();
        expect(first!.url).toEqual('http://example.com/1');

        await requestQueue.reclaimRequest({ ...first!, id: first!.id! }, { forefront: true });

        const next = await requestQueue.fetchNextRequest();
        expect(next!.url).toEqual('http://example.com/1');
    });

    test('handling all requests empties the queue', async () => {
        await requestQueue.addBatchOfRequests([
            { url: 'http://example.com/1', uniqueKey: '1' },
            { url: 'http://example.com/2', uniqueKey: '2' },
            { url: 'http://example.com/3', uniqueKey: '3' },
        ]);

        expect(await requestQueue.isEmpty()).toBe(false);

        await fetchOrder(requestQueue);

        expect(await requestQueue.isEmpty()).toBe(true);
        expect(await requestQueue.fetchNextRequest()).toBeUndefined();
    });

    test('a fetched (locked) request leaves the queue empty but unfinished until it is handled', async () => {
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

        const request = await requestQueue.fetchNextRequest();
        expect(request).not.toBeNull();

        // The request is locked (in progress), not handled. There is nothing left to fetch, so the
        // queue is empty — but it is not finished. The "not finished" signal is what stops a crawler
        // from shutting down while a request is still being processed by some consumer.
        expect(await requestQueue.isEmpty()).toBe(true);
        expect(await requestQueue.isFinished()).toBe(false);

        await requestQueue.markRequestAsHandled({ ...request!, id: request!.id! });
        expect(await requestQueue.isEmpty()).toBe(true);
        expect(await requestQueue.isFinished()).toBe(true);
    });
});

describe('RequestQueue holds fetched requests in progress', () => {
    const storage = new MemoryStorageClient();

    let requestQueue: RequestQueueClient;

    beforeEach(async () => {
        requestQueue = await storage.createRequestQueueClient({ name: 'in-progress' });
    });

    afterEach(async () => {
        await requestQueue.drop();
    });

    test('a fetched request stays in progress and is only fetchable again once reclaimed', async () => {
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

        const first = await requestQueue.fetchNextRequest();
        expect(first!.uniqueKey).toBe('1');

        // While in progress, the request is not handed out again. The in-memory queue lives in a single
        // process, so there is no lock expiry — the request stays in progress until it is explicitly
        // reclaimed (or handled).
        expect(await requestQueue.fetchNextRequest()).toBeUndefined();

        await requestQueue.reclaimRequest({ ...first!, id: first!.id as string });

        const retried = await requestQueue.fetchNextRequest();
        expect(retried!.uniqueKey).toBe('1');
    });
});
