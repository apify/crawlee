import { setTimeout as sleep } from 'node:timers/promises';

import { MemoryStorage } from '@crawlee/memory-storage';
import type { RequestQueueClient } from '@crawlee/types';

describe('RequestQueueV1 respects `forefront` in `listHead`', () => {
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

    test('requests without `forefront` respect sequential order', async () => {
        await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' });
        // Waiting a few ms is required since we use Date.now() to compute orderNo
        await sleep(2);
        await requestQueue.addRequest({ url: 'http://example.com/2', uniqueKey: '2' });

        const { items } = await requestQueue.listHead();

        expect(items).toHaveLength(2);
        expect(items.map((x) => new URL(x.url).pathname)).toEqual(['/1', '/2']);
    });

    test('`forefront` requests are prioritized', async () => {
        await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' });
        // Waiting a few ms is required since we use Date.now() to compute orderNo
        await sleep(2);
        await requestQueue.addRequest({ url: 'http://example.com/2', uniqueKey: '2' }, { forefront: true });

        const { items } = await requestQueue.listHead();

        expect(items).toHaveLength(2);
        expect(items.map((x) => new URL(x.url).pathname)).toEqual(['/2', '/1']);
    });

    test('`limit` retains the global `forefront` ordering', async () => {
        await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' });
        await sleep(2);
        await requestQueue.addRequest({ url: 'http://example.com/2', uniqueKey: '2' }, { forefront: true });
        await sleep(2);
        await requestQueue.addRequest({ url: 'http://example.com/3', uniqueKey: '3' }, { forefront: true });

        // List only 2 items (smaller than the total queue size)
        const { items } = await requestQueue.listHead({ limit: 2 });

        expect(items).toHaveLength(2);
        expect(items.map((x) => new URL(x.url).pathname)).toEqual(['/3', '/2']);
    });

    test('`batchAddRequests` respects `forefront`', async () => {
        await requestQueue.addRequest({ url: 'http://example.com/3', uniqueKey: '3' });

        await sleep(2);

        await requestQueue.batchAddRequests(
            [
                { url: 'http://example.com/1', uniqueKey: '1' },
                { url: 'http://example.com/2', uniqueKey: '2' },
            ],
            { forefront: true },
        );

        const { items } = await requestQueue.listHead();

        expect(items).toHaveLength(3);
        expect([
            ['/2', '/1', '/3'],
            ['/1', '/2', '/3'],
        ]).toContainEqual(items.map((x) => new URL(x.url).pathname));
    });

    test('`batchAddRequests` respects `forefront` (with `limit`)', async () => {
        await requestQueue.addRequest({ url: 'http://example.com/3', uniqueKey: '3' });

        await sleep(2);

        await requestQueue.batchAddRequests(
            [
                { url: 'http://example.com/1', uniqueKey: '1' },
                { url: 'http://example.com/2', uniqueKey: '2' },
            ],
            { forefront: true },
        );

        const { items } = await requestQueue.listHead({ limit: 2 });

        expect(items).toHaveLength(2);
        expect([
            ['/2', '/1'],
            ['/1', '/2'],
        ]).toContainEqual(items.map((x) => new URL(x.url).pathname));
    });
});

describe('RequestQueueV2 respects `forefront` in `listAndLockHead`', () => {
    const storage = new MemoryStorage({
        persistStorage: false,
    });

    let requestQueue: RequestQueueClient;

    beforeEach(async () => {
        const { id } = await storage.requestQueues().getOrCreate('forefront-v2');
        requestQueue = storage.requestQueue(id);
    });

    afterEach(async () => {
        await requestQueue.delete();
    });

    test('requests without `forefront` respect sequential order', async () => {
        await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' });
        // Waiting a few ms is required since we use Date.now() to compute orderNo
        await sleep(2);
        await requestQueue.addRequest({ url: 'http://example.com/2', uniqueKey: '2' });

        const { items } = await requestQueue.listAndLockHead({ lockSecs: 10 });

        expect(items).toHaveLength(2);
        expect(items.map((x) => new URL(x.url).pathname)).toEqual(['/1', '/2']);
    });

    test('`forefront` requests are prioritized', async () => {
        await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' });
        // Waiting a few ms is required since we use Date.now() to compute orderNo
        await sleep(2);
        await requestQueue.addRequest({ url: 'http://example.com/2', uniqueKey: '2' }, { forefront: true });

        const { items } = await requestQueue.listAndLockHead({ lockSecs: 10 });

        expect(items).toHaveLength(2);
        expect(items.map((x) => new URL(x.url).pathname)).toEqual(['/2', '/1']);
    });

    test('`limit` retains the global `forefront` ordering', async () => {
        await requestQueue.addRequest({ url: 'http://example.com/1', uniqueKey: '1' });
        await sleep(2);
        await requestQueue.addRequest({ url: 'http://example.com/2', uniqueKey: '2' }, { forefront: true });
        await sleep(2);
        await requestQueue.addRequest({ url: 'http://example.com/3', uniqueKey: '3' }, { forefront: true });

        // List only 2 items (smaller than the total queue size)
        const { items } = await requestQueue.listAndLockHead({ limit: 2, lockSecs: 10 });

        expect(items).toHaveLength(2);
        expect(items.map((x) => new URL(x.url).pathname)).toEqual(['/3', '/2']);
    });

    test('`batchAddRequests` respects `forefront`', async () => {
        await requestQueue.addRequest({ url: 'http://example.com/3', uniqueKey: '3' });

        await sleep(2);

        await requestQueue.batchAddRequests(
            [
                { url: 'http://example.com/1', uniqueKey: '1' },
                { url: 'http://example.com/2', uniqueKey: '2' },
            ],
            { forefront: true },
        );

        const { items } = await requestQueue.listAndLockHead({ lockSecs: 10 });

        expect(items).toHaveLength(3);
        expect([
            ['/2', '/1', '/3'],
            ['/1', '/2', '/3'],
        ]).toContainEqual(items.map((x) => new URL(x.url).pathname));
    });

    test('`batchAddRequests` respects `forefront` (with `limit`)', async () => {
        await requestQueue.addRequest({ url: 'http://example.com/3', uniqueKey: '3' });

        await sleep(2);

        await requestQueue.batchAddRequests(
            [
                { url: 'http://example.com/1', uniqueKey: '1' },
                { url: 'http://example.com/2', uniqueKey: '2' },
            ],
            { forefront: true },
        );

        const { items } = await requestQueue.listAndLockHead({ limit: 2, lockSecs: 10 });

        expect(items).toHaveLength(2);
        expect([
            ['/2', '/1'],
            ['/1', '/2'],
        ]).toContainEqual(items.map((x) => new URL(x.url).pathname));
    });
});
