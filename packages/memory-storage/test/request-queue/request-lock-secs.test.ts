import { MemoryStorage } from '@crawlee/memory-storage';
import type { RequestQueueClient } from '@crawlee/types';

describe('RequestQueue request lock duration', () => {
    beforeEach(() => {
        vitest.useFakeTimers();
    });

    afterEach(() => {
        vitest.useRealTimers();
    });

    test('a fetched request stays locked for the default 3 minutes, then becomes fetchable again', async () => {
        const storage = new MemoryStorage({ persistStorage: false });
        const queue: RequestQueueClient = await storage.createRequestQueueClient({ name: 'default-lock' });

        await queue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

        const fetched = await queue.fetchNextRequest();
        expect(fetched).not.toBeNull();

        // While the lock is held, the request must not be handed out again.
        expect(await queue.fetchNextRequest()).toBeNull();
        expect(await queue.isEmpty()).toBe(false);

        // Just before the default lock expires, it is still locked.
        vitest.advanceTimersByTime(3 * 60 * 1000 - 1000);
        expect(await queue.fetchNextRequest()).toBeNull();

        // Once the lock expires, the same request is fetchable again.
        vitest.advanceTimersByTime(2 * 1000);
        const refetched = await queue.fetchNextRequest();
        expect(refetched).not.toBeNull();
        expect(refetched!.uniqueKey).toBe('1');
    });

    test('setExpectedRequestProcessingTime changes how long a fetched request stays locked', async () => {
        const storage = new MemoryStorage({ persistStorage: false });
        const queue: RequestQueueClient = await storage.createRequestQueueClient({ name: 'set-lock-secs' });

        // Raise the lock well above the 3-minute default — expect requests to stay locked for 10 minutes.
        queue.setExpectedRequestProcessingTime!(600);

        await queue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);
        expect(await queue.fetchNextRequest()).not.toBeNull();

        // After the default 3-minute lock would have expired, the request is still locked.
        vitest.advanceTimersByTime(4 * 60 * 1000);
        expect(await queue.fetchNextRequest()).toBeNull();

        // Only after the configured 10-minute lock expires is it fetchable again.
        vitest.advanceTimersByTime(6 * 60 * 1000 + 1000);
        expect((await queue.fetchNextRequest())?.uniqueKey).toBe('1');
    });

    test('a request can still be marked as handled after its lock has expired', async () => {
        const storage = new MemoryStorage({ persistStorage: false });
        const queue: RequestQueueClient = await storage.createRequestQueueClient({ name: 'handle-after-expiry' });

        await queue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

        const fetched = await queue.fetchNextRequest();
        expect(fetched).not.toBeNull();

        // The consumer takes longer than the lock duration to process the request.
        vitest.advanceTimersByTime(3 * 60 * 1000 + 1000);

        // Marking it handled must still succeed — a slow consumer should not be penalized.
        const result = await queue.markRequestAsHandled({ ...fetched!, id: fetched!.id as string });
        expect(result).not.toBeNull();

        // The request must be counted as handled and never handed out again.
        const metadata = await queue.getMetadata();
        expect(metadata.handledRequestCount).toBe(1);
        expect(metadata.pendingRequestCount).toBe(0);
        expect(await queue.isEmpty()).toBe(true);
        expect(await queue.fetchNextRequest()).toBeNull();
    });

    test('a request can still be reclaimed after its lock has expired', async () => {
        const storage = new MemoryStorage({ persistStorage: false });
        const queue: RequestQueueClient = await storage.createRequestQueueClient({ name: 'reclaim-after-expiry' });

        await queue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

        const fetched = await queue.fetchNextRequest();
        expect(fetched).not.toBeNull();

        // The consumer fails after holding the request longer than the lock duration.
        vitest.advanceTimersByTime(3 * 60 * 1000 + 1000);

        const result = await queue.reclaimRequest({ ...fetched!, id: fetched!.id as string }, { forefront: true });
        expect(result).not.toBeNull();

        // The reclaimed request is still pending and fetchable again.
        expect(await queue.isEmpty()).toBe(false);
        expect((await queue.fetchNextRequest())?.uniqueKey).toBe('1');
    });
});
