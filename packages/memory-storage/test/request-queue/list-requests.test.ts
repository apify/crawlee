import { MemoryStorage } from '@crawlee/memory-storage';
import type { RequestQueueClient } from '@crawlee/types';

describe('RequestQueue listRequests', () => {
    const storage = new MemoryStorage({
        persistStorage: false,
    });

    let requestQueue: RequestQueueClient;

    beforeEach(async () => {
        const { id } = await storage.requestQueues().getOrCreate('list-requests');
        requestQueue = storage.requestQueue(id);
    });

    afterEach(async () => {
        await requestQueue.delete();
    });

    test('lists requests with default options', async () => {
        await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' });
        await requestQueue.addRequest({ url: 'http://example.com/2', uniqueKey: '2' });

        const result = await requestQueue.listRequests();

        expect(result.items).toHaveLength(2);
        expect(result.limit).toBe(100);
        expect(result.exclusiveStartId).toBeUndefined();
        expect(result.items.map((x) => new URL(x.url).pathname)).toEqual(['/1', '/2']);
    });

    test('respects limit', async () => {
        await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' });
        await requestQueue.addRequest({ url: 'http://example.com/2', uniqueKey: '2' });
        await requestQueue.addRequest({ url: 'http://example.com/3', uniqueKey: '3' });

        const result = await requestQueue.listRequests({ limit: 2 });

        expect(result.items).toHaveLength(2);
        expect(result.limit).toBe(2);
        expect(result.items.map((x) => new URL(x.url).pathname)).toEqual(['/1', '/2']);
    });

    test('respects exclusiveStartId', async () => {
        const req1 = await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' });
        await requestQueue.addRequest({ url: 'http://example.com/2', uniqueKey: '2' });
        await requestQueue.addRequest({ url: 'http://example.com/3', uniqueKey: '3' });

        const result = await requestQueue.listRequests({ exclusiveStartId: req1.requestId });

        expect(result.items).toHaveLength(2);
        expect(result.exclusiveStartId).toBe(req1.requestId);
        expect(result.items.map((x) => new URL(x.url).pathname)).toEqual(['/2', '/3']);
    });

    test('pagination works correctly', async () => {
        for (let i = 1; i <= 5; i++) {
            await requestQueue.addRequest({ url: `http://example.com/${i}`, uniqueKey: `${i}` });
        }

        const page1 = await requestQueue.listRequests({ limit: 2 });
        expect(page1.items).toHaveLength(2);
        expect(page1.items.map((x) => new URL(x.url).pathname)).toEqual(['/1', '/2']);

        const page2 = await requestQueue.listRequests({
            limit: 2,
            exclusiveStartId: page1.items[page1.items.length - 1].id,
        });
        expect(page2.items).toHaveLength(2);
        expect(page2.items.map((x) => new URL(x.url).pathname)).toEqual(['/3', '/4']);

        const page3 = await requestQueue.listRequests({
            limit: 2,
            exclusiveStartId: page2.items[page2.items.length - 1].id,
        });
        expect(page3.items).toHaveLength(1);
        expect(page3.items.map((x) => new URL(x.url).pathname)).toEqual(['/5']);
    });
});
