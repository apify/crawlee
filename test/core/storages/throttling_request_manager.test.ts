import { Request, RequestQueue, serviceLocator } from '@crawlee/core';
import {
    ThrottlingRequestManager,
    parseRetryAfterHeader,
} from '../../../packages/core/src/storages/throttling_request_manager.js';
import { MemoryStorageEmulator } from '../../shared/MemoryStorageEmulator.js';

describe('ThrottlingRequestManager', () => {
    const emulator = new MemoryStorageEmulator();

    beforeEach(async () => {
        await emulator.init();
    });

    afterEach(async () => {
        await emulator.destroy();
    });

    async function createQueue(id = 'inner-queue') {
        const client = await serviceLocator.getStorageClient().createRequestQueueClient({ id });
        return new RequestQueue({ id, client }, serviceLocator.getConfiguration());
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

        // Since example.com is still throttled, and inner is empty, calling fetchNextRequest
        // should wait and then return the request once the throttle expires.
        const start = Date.now();
        const req2 = await manager.fetchNextRequest();
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(400);
        expect(req2!.url).toBe('https://example.com/1');
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

        // After fetching req1, the crawl-delay of 200ms is applied to example.com.
        // So fetching next request immediately should sleep/wait.
        const start = Date.now();
        const req2 = await manager.fetchNextRequest();
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(150);
        expect(req2!.url).toBe('https://example.com/2');
    });
});
