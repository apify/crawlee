import { MemoryStorage } from '@crawlee/memory-storage';
import type { RequestQueueClient } from '@crawlee/types';
import { setTimeout as sleep } from 'node:timers/promises';

describe('RequestQueue forefront should be respected when listing head', () => {
    const storage = new MemoryStorage({
        persistStorage: false,
    });

    let requestQueue: RequestQueueClient;

    beforeEach(async () => {
        const { id } = await storage.requestQueues().getOrCreate('forefront');
        requestQueue = storage.requestQueue(id);
    });

    afterEach(async () => {
        await requestQueue.delete();
    });

    test('adding two requests without one being in the forefront should be added in sequential order', async () => {
        await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' });
        // Waiting a few ms is required since we use Date.now() to compute orderNo
        await sleep(2);
        await requestQueue.addRequest({ url: 'http://example.com/2', uniqueKey: '2' });

        const { items } = await requestQueue.listHead();

        expect(items).toHaveLength(2);
        expect(items[0].url).toBe('http://example.com/1');
        expect(items[1].url).toBe('http://example.com/2');
    });

    test('adding two requests with one being in the forefront should ensure the forefront request is first', async () => {
        await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' });
        // Waiting a few ms is required since we use Date.now() to compute orderNo
        await sleep(2);
        await requestQueue.addRequest({ url: 'http://example.com/2', uniqueKey: '2' }, { forefront: true });

        const { items } = await requestQueue.listHead();

        expect(items).toHaveLength(2);
        expect(items[0].url).toBe('http://example.com/2');
        expect(items[1].url).toBe('http://example.com/1');
    });

    test('adding two requests where both are in the forefront should ensure the latest one is added first', async () => {
        await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' }, { forefront: true });
        // Waiting a few ms is required since we use Date.now() to compute orderNo
        await sleep(2);
        await requestQueue.addRequest({ url: 'http://example.com/2', uniqueKey: '2' }, { forefront: true });

        const { items } = await requestQueue.listHead();

        expect(items).toHaveLength(2);
        expect(items[0].url).toBe('http://example.com/2');
        expect(items[1].url).toBe('http://example.com/1');
    });
});
