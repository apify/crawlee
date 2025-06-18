import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RequestQueue } from '@crawlee/core';
import type { Source } from '@crawlee/core';

describe('RequestQueue iterable inputs', () => {
    let queue: RequestQueue;
    beforeEach(async () => {
        queue = await RequestQueue.open();
    });

    afterEach(async () => {
        await queue.drop();
    });
    

    beforeEach(async () => {
        // Open a new queue using the default local filesystem storage
        queue = await RequestQueue.open();
    });

    afterEach(async () => {
        // Clean up after each test
        await queue.drop();
    });

    it('addRequests() accepts Array.from(Set<Source>)', async () => {
        const sourcesSet = new Set<Source>([
            { url: 'http://a.com' },
            { url: 'http://b.com' },
        ]);
        const sources = Array.from(sourcesSet);

        const result = await queue.addRequests(sources);
        expect(result.processedRequests).toHaveLength(2);

        const info = await queue.getInfo();
        expect(info?.totalRequestCount).toBe(2);
        expect(info?.pendingRequestCount).toBe(2);
    });

    it('addRequestsBatched() accepts an array populated from an async generator', async () => {
        async function* genRequests() {
            yield 'http://x.com';
            yield { url: 'http://y.com' };
        }

        // Consume the generator into an array
        const arr: (string | Source)[] = [];
        for await (const req of genRequests()) {
            arr.push(req);
        }

        const { addedRequests, waitForAllRequestsToBeAdded } = await queue.addRequestsBatched(arr);
        expect(addedRequests).toHaveLength(2);
        await expect(waitForAllRequestsToBeAdded).resolves.toHaveLength(0);

        const info = await queue.getInfo();
        expect(info?.totalRequestCount).toBe(2);
    });

    it('addRequestsBatched() splits into multiple batches when batchSize < total', async () => {
        const urls = ['http://1.com', 'http://2.com', 'http://3.com', 'http://4.com'];
        const { addedRequests, waitForAllRequestsToBeAdded } = await queue.addRequestsBatched(
            urls,
            { batchSize: 2 },
        );

        // initial batch
        expect(addedRequests).toHaveLength(2);
        // the rest
        const remaining = await waitForAllRequestsToBeAdded;
        expect(remaining).toHaveLength(2);

        const info = await queue.getInfo();
        expect(info?.totalRequestCount).toBe(4);
    });

    it('addRequestsBatched() with waitForAllRequestsToBeAdded=true appends all items to addedRequests and returns remaining in waitForAllRequestsToBeAdded', async () => {
        const urls = ['http://foo.com', 'http://bar.com'];
        const { addedRequests, waitForAllRequestsToBeAdded } = await queue.addRequestsBatched(
            urls,
            { batchSize: 1, waitForAllRequestsToBeAdded: true },
        );

        // Both URLs should be present in addedRequests
        expect(addedRequests).toHaveLength(2);
        expect(addedRequests.map((r) => r.uniqueKey)).toEqual([
            'http://foo.com',
            'http://bar.com',
        ]);

        // The "remaining" batch promise resolves with just the second URL
        const rest = await waitForAllRequestsToBeAdded;
        expect(rest).toHaveLength(1);
        expect(rest[0].uniqueKey).toBe('http://bar.com');
    });

    it('addRequests() accepts a Set<Source> directly', async () => {
        const sourcesSet = new Set<Source>([
            { url: 'http://foo.com' },
            { url: 'http://bar.com' },
        ]);

        const result = await queue.addRequests(sourcesSet);
        expect(result.processedRequests).toHaveLength(2);

        const info = await queue.getInfo();
        expect(info?.totalRequestCount).toBe(2);
    });

    it('addRequests() accepts a (sync) generator of Source', async () => {
        function* gen() {
            yield { url: 'http://one.com' };
            yield { url: 'http://two.com' };
        }

        const result = await queue.addRequests(gen());
        expect(result.processedRequests).toHaveLength(2);
        const info = await queue.getInfo();
        expect(info?.totalRequestCount).toBe(2);
    });

    it('addRequestsBatched() accepts a sync generator directly', async () => {
        function* gen() {
            yield 'http://x.com';
            yield { url: 'http://y.com' };
        }

        const { addedRequests } = await queue.addRequestsBatched(gen(), { batchSize: 10 });
        expect(addedRequests).toHaveLength(2);

        const info = await queue.getInfo();
        expect(info?.totalRequestCount).toBe(2);
    });
});
