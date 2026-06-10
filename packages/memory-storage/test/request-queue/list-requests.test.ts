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
        const r1 = await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' });
        const r2 = await requestQueue.addRequest({ url: 'http://example.com/2', uniqueKey: '2' });

        const result = await requestQueue.listRequests();

        expect(result.items).toHaveLength(2);
        expect(result.limit).toBe(100);
        expect(result.exclusiveStartId).toBeUndefined();
        expect(result.cursor).toBeUndefined();

        const expectedIds = [r1.requestId, r2.requestId].sort();
        expect(result.items.map((x) => x.id)).toEqual(expectedIds);
    });

    test('respects limit', async () => {
        const r1 = await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' });
        const r2 = await requestQueue.addRequest({ url: 'http://example.com/2', uniqueKey: '2' });
        const r3 = await requestQueue.addRequest({ url: 'http://example.com/3', uniqueKey: '3' });

        const result = await requestQueue.listRequests({ limit: 2 });

        expect(result.items).toHaveLength(2);
        expect(result.limit).toBe(2);

        const expectedIds = [r1.requestId, r2.requestId, r3.requestId].sort().slice(0, 2);
        expect(result.items.map((x) => x.id)).toEqual(expectedIds);
    });

    test('respects exclusiveStartId', async () => {
        const r1 = await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' });
        const r2 = await requestQueue.addRequest({ url: 'http://example.com/2', uniqueKey: '2' });
        const r3 = await requestQueue.addRequest({ url: 'http://example.com/3', uniqueKey: '3' });

        const expectedIds = [r1.requestId, r2.requestId, r3.requestId].sort();
        const startId = expectedIds[0];

        const result = await requestQueue.listRequests({ cursor: startId });

        expect(result.items).toHaveLength(2);
        expect(result.exclusiveStartId).toBe(startId);
        expect(result.cursor).toBe(startId);
        expect(result.items.map((x) => x.id)).toEqual(expectedIds.slice(1));
    });

    test('pagination works correctly', async () => {
        const reqs = [];
        for (let i = 1; i <= 5; i++) {
            reqs.push(await requestQueue.addRequest({ url: `http://example.com/${i}`, uniqueKey: `${i}` }));
        }

        const expectedIds = reqs.map((r) => r.requestId).sort();

        const page1 = await requestQueue.listRequests({ limit: 2 });
        expect(page1.items).toHaveLength(2);
        expect(page1.items.map((x) => x.id)).toEqual(expectedIds.slice(0, 2));

        const page2 = await requestQueue.listRequests({
            limit: 2,
            cursor: page1.items[page1.items.length - 1].id,
        });
        expect(page2.items).toHaveLength(2);
        expect(page2.items.map((x) => x.id)).toEqual(expectedIds.slice(2, 4));

        const page3 = await requestQueue.listRequests({
            limit: 2,
            cursor: page2.items[page2.items.length - 1].id,
        });
        expect(page3.items).toHaveLength(1);
        expect(page3.items.map((x) => x.id)).toEqual(expectedIds.slice(4, 5));
    });
});
