import { MemoryStorageBackend, RequestQueue, serviceLocator } from '@crawlee/core';
import {
    ThrottlingRequestManager,
    parseRetryAfterHeader,
} from '../../../packages/core/src/storages/throttling_request_manager.js';
import { sleep } from '@crawlee/utils';

describe('ThrottlingRequestManager', () => {
    beforeEach(() => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    async function createQueue(name = 'inner-queue') {
        return RequestQueue.open({ name });
    }

    /** Models the crawler's task loop: poll, and idle while the manager reports itself empty. */
    async function pollForNextRequest(manager: ThrottlingRequestManager, timeoutMs = 5000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const request = await manager.fetchNextRequest();
            if (request) {
                return request;
            }
            await sleep(20);
        }
        throw new Error('Timed out waiting for a request to become available');
    }

    test('parseRetryAfterHeader parsing seconds and date', () => {
        expect(parseRetryAfterHeader('120')).toBe(120_000);
        expect(parseRetryAfterHeader('  5  ')).toBe(5000);

        // date format
        const futureDate = new Date(Date.now() + 5000).toUTCString();
        const delay = parseRetryAfterHeader(futureDate);
        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeLessThanOrEqual(5500);

        expect(parseRetryAfterHeader(null)).toBeNull();
        expect(parseRetryAfterHeader('invalid')).toBeNull();
    });

    test('Routing: requests to configured domains route to sub-managers, others to inner queue', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({
            inner,
            domains: ['example.com'],
        });

        // Add request to inner domain
        await manager.addRequest({ url: 'https://other.com/a' });
        // Add request to throttled domain
        await manager.addRequest({ url: 'https://example.com/a' });

        expect(await inner.getTotalCount()).toBe(1);
        expect(await manager.getTotalCount()).toBe(2);

        // Fetching next request should yield them
        const req1 = await manager.fetchNextRequest();
        expect(req1!.url).toBe('https://example.com/a'); // Throttled domains checked first

        const req2 = await manager.fetchNextRequest();
        expect(req2!.url).toBe('https://other.com/a');

        expect(await manager.fetchNextRequest()).toBeNull();
    });

    test('addRequests routing', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({
            inner,
            domains: ['example.com', 'foo.com'],
        });

        await manager.addRequests([
            { url: 'https://example.com/1' },
            { url: 'https://other.com/1' },
            { url: 'https://foo.com/1' },
        ]);

        expect(await inner.getTotalCount()).toBe(1);
        expect(await manager.getTotalCount()).toBe(3);
    });

    test('recordDomainDelay enforces throttling and fair scheduling', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({
            inner,
            domains: ['example.com', 'foo.com'],
            baseDelayMs: 100,
        });

        await manager.addRequest({ url: 'https://example.com/1' });
        await manager.addRequest({ url: 'https://foo.com/1' });

        // Record a 500ms delay on example.com
        const recorded = manager.recordDomainDelay('https://example.com/1', 500);
        expect(recorded).toBe(true);

        // Record success reset check (does not reset delay, but resets consecutive count)
        manager.recordSuccess('https://example.com/1');

        // Fetch next request - should fetch foo.com since example.com is throttled
        const req1 = await manager.fetchNextRequest();
        expect(req1!.url).toBe('https://foo.com/1');

        // example.com is still throttled and inner is empty, so there is nothing to fetch right now -
        // and the manager must say so rather than block the caller.
        expect(await manager.fetchNextRequest()).toBeNull();
        expect(await manager.isEmpty()).toBe(true);
        // ...while still reporting the throttled request as outstanding work.
        expect(await manager.isFinished()).toBe(false);

        const start = Date.now();
        const req2 = await pollForNextRequest(manager);

        expect(Date.now() - start).toBeGreaterThanOrEqual(400);
        expect(req2.url).toBe('https://example.com/1');
    });

    test('fetchNextRequest does not block while a domain is throttled', async () => {
        const manager = new ThrottlingRequestManager({
            inner: await createQueue(),
            domains: ['example.com'],
            maxDelayMs: 60_000,
        });

        await manager.addRequest({ url: 'https://example.com/1' });
        manager.recordDomainDelay('https://example.com/1', 60_000);

        const start = Date.now();
        expect(await manager.fetchNextRequest()).toBeNull();

        expect(Date.now() - start).toBeLessThan(1000);
    });

    test('picks up requests left in per-domain sub-queues by a previous run', async () => {
        const domains = ['example.com'];

        const firstRun = new ThrottlingRequestManager({ inner: await createQueue(), domains });
        await firstRun.addRequest({ url: 'https://example.com/left-behind' });
        expect(await firstRun.getPendingCount()).toBe(1);

        // A restart builds a brand new manager over the same storage backend.
        const secondRun = new ThrottlingRequestManager({ inner: await createQueue(), domains });

        expect(await secondRun.isEmpty()).toBe(false);
        expect(await secondRun.isFinished()).toBe(false);
        expect(await secondRun.getPendingCount()).toBe(1);
        expect((await secondRun.fetchNextRequest())!.url).toBe('https://example.com/left-behind');
    });

    test('purge empties per-domain sub-queues it has not touched yet', async () => {
        const domains = ['example.com'];

        const firstRun = new ThrottlingRequestManager({ inner: await createQueue(), domains });
        await firstRun.addRequest({ url: 'https://example.com/stale' });

        const secondRun = new ThrottlingRequestManager({ inner: await createQueue(), domains });
        await secondRun.purge();

        const subQueue = await RequestQueue.open({ alias: 'throttled-example.com' });
        expect(await subQueue.getPendingCount()).toBe(0);
    });

    test('setCrawlDelay sets crawl-delay successfully', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({
            inner,
            domains: ['example.com'],
        });

        manager.setCrawlDelay('https://example.com/1', 0.2); // 0.2 seconds = 200ms

        await manager.addRequest({ url: 'https://example.com/1' });
        await manager.addRequest({ url: 'https://example.com/2' });

        const req1 = await manager.fetchNextRequest();
        expect(req1!.url).toBe('https://example.com/1');

        // Dispatching req1 pushes example.com's next slot 200ms out.
        const start = Date.now();
        const req2 = await pollForNextRequest(manager);

        expect(Date.now() - start).toBeGreaterThanOrEqual(150);
        expect(req2.url).toBe('https://example.com/2');
    });
});
