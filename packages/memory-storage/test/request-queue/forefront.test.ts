import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { MemoryStorage } from '@crawlee/memory-storage';
import type { RequestQueueClient } from '@crawlee/types';

/**
 * Drains the queue via `fetchNextRequest`, marking each request as handled, and returns the
 * pathnames in the order they were served.
 */
async function fetchOrder(client: RequestQueueClient): Promise<string[]> {
    const order: string[] = [];

    for (let request = await client.fetchNextRequest(); request !== null; request = await client.fetchNextRequest()) {
        order.push(new URL(request.url).pathname);
        await client.markRequestAsHandled({ ...request, id: request.id! });
    }

    return order;
}

describe('RequestQueue respects `forefront` when fetching requests', () => {
    const storage = new MemoryStorage({
        persistStorage: false,
    });

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
        expect(await requestQueue.fetchNextRequest()).toBeNull();
    });

    test('a fetched request leaves nothing pending, so the queue reports empty', async () => {
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

        const request = await requestQueue.fetchNextRequest();
        expect(request).not.toBeNull();

        // `isEmpty` reflects only pending requests, so an in-progress request still reports empty.
        expect(await requestQueue.isEmpty()).toBe(true);

        await requestQueue.markRequestAsHandled({ ...request!, id: request!.id! });
        expect(await requestQueue.isEmpty()).toBe(true);
    });
});

describe('RequestQueue locks fetched requests', () => {
    const storage = new MemoryStorage({ persistStorage: false });

    let requestQueue: RequestQueueClient;

    beforeEach(async () => {
        requestQueue = await storage.createRequestQueueClient({ name: 'locking' });
    });

    afterEach(async () => {
        await requestQueue.drop();
    });

    test('a fetched request becomes available again after its lock expires', async () => {
        vitest.useFakeTimers();

        try {
            await requestQueue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

            const first = await requestQueue.fetchNextRequest();
            expect(first!.uniqueKey).toBe('1');

            // While locked, the request is not handed out again.
            expect(await requestQueue.fetchNextRequest()).toBeNull();

            // After the lock expires (default 3 minutes), the request is fetchable again — this is what
            // prevents a crashed consumer from blocking its requests forever.
            vitest.advanceTimersByTime(3 * 60 * 1000 + 1000);

            const retried = await requestQueue.fetchNextRequest();
            expect(retried!.uniqueKey).toBe('1');
        } finally {
            vitest.useRealTimers();
        }
    });
});

describe('RequestQueue locking is visible across clients sharing on-disk storage', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/req-queue-cross-process');
    // Two independent storage instances over the same directory emulate two separate processes.
    const storageA = new MemoryStorage({ localDataDirectory: tmpLocation, persistStorage: true });
    const storageB = new MemoryStorage({ localDataDirectory: tmpLocation, persistStorage: true });

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('two clients on the same queue never fetch the same request', async () => {
        const clientA = await storageA.createRequestQueueClient({ name: 'shared' });
        await clientA.addBatchOfRequests([
            { url: 'http://example.com/1', uniqueKey: '1' },
            { url: 'http://example.com/2', uniqueKey: '2' },
        ]);

        const clientB = await storageB.createRequestQueueClient({ name: 'shared' });

        const fromA = await clientA.fetchNextRequest();
        const fromB = await clientB.fetchNextRequest();

        expect(fromA).not.toBeNull();
        expect(fromB).not.toBeNull();
        // The lock written by one client is observed by the other, so they get distinct requests.
        expect(fromA!.uniqueKey).not.toBe(fromB!.uniqueKey);

        // Both requests are now locked, so neither client can fetch anything more.
        expect(await clientA.fetchNextRequest()).toBeNull();
        expect(await clientB.fetchNextRequest()).toBeNull();

        await clientA.drop();
    });

    test('teardown releases this client locks so another client can fetch immediately', async () => {
        const clientA = await storageA.createRequestQueueClient({ name: 'shared-teardown' });
        await clientA.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

        // Client A fetches (locks) the request, then the process tears down without handling it.
        const fromA = await clientA.fetchNextRequest();
        expect(fromA).not.toBeNull();

        const clientB = await storageB.createRequestQueueClient({ name: 'shared-teardown' });
        // While A holds the lock, B cannot fetch the request.
        expect(await clientB.fetchNextRequest()).toBeNull();

        // Tearing down A's storage releases its locks (instead of leaving them until the 3-minute
        // expiry), so B can pick the request up right away.
        await storageA.teardown();

        const fromB = await clientB.fetchNextRequest();
        expect(fromB).not.toBeNull();
        expect(fromB!.uniqueKey).toBe('1');

        await clientB.drop();
    });
});
