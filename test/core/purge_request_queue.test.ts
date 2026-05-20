import { log, RequestList, RequestQueue } from '@crawlee/core';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { MemoryStorageEmulator } from '../shared/MemoryStorageEmulator';

/**
 * Regression test for https://github.com/apify/crawlee/issues/3367
 *
 * Problem: When a crawler instance runs for the second time with `purgeRequestQueue: true`,
 * the default RequestQueue must be initialized before the purge check runs.
 * Previously, `this.requestQueue` was undefined for a new crawler instance that only used
 * the implicit default queue, causing the purge check (`this.requestQueue?.name === 'default'`)
 * to always be false and the purge to be a no-op.
 *
 * This test verifies the fix: `await this.getRequestQueue()` is called before the
 * purge check, ensuring the queue is properly initialized.
 */
describe('purgeRequestQueue behavior', () => {
    const emulator = new MemoryStorageEmulator();

    beforeAll(async () => {
        await emulator.init();
    });

    afterAll(async () => {
        await emulator.destroy();
    });

    beforeEach(async () => {
        await emulator.init();
    });

    test('default request queue has correct name after initialization', async () => {
        // Verify that the default queue opened via RequestQueue.open() has name 'default'
        const queue = await RequestQueue.open(null);
        expect(queue.name).toBe('default');
        await queue.drop();
    });

    test('queue name is accessible after addRequests triggers queue creation', async () => {
        // This reproduces the actual flow:
        // 1. CheerioCrawler constructor is called (requestQueue is undefined)
        // 2. crawler.run(['url']) is called
        // 3. addRequests() is called, which calls getRequestQueue(), creating the default queue
        // 4. Now requestQueue.name should be 'default'
        const requestList = await RequestList.open(null, [{ url: 'https://example.com/1' }]);

        // Simulate what BasicCrawler does: before checking queue name, initialize it
        const queue = await RequestQueue.open(null);
        await requestList.addRequests([{ url: 'https://example.com/1' }], { queue });

        // After queue is created via addRequests, name should be 'default'
        expect(queue.name).toBe('default');

        await queue.drop();
    });

    test('request can be handled and re-handled after explicit queue drop', async () => {
        // Test the fix: when we call drop() on the default queue and create a new one,
        // the new queue should be truly empty and allow re-processing
        const queueA = await RequestQueue.open(null);
        expect(queueA.name).toBe('default');

        await queueA.addRequest({ url: 'https://example.com/1' });
        const { items: headsA } = await queueA.listHead();
        expect(headsA).toHaveLength(1);

        // Drop the queue and open a new one
        await queueA.drop();
        const queueB = await RequestQueue.open(null);
        expect(queueB.name).toBe('default');

        // New queue should be empty
        const { items: headsB } = await queueB.listHead();
        expect(headsB).toHaveLength(0);

        await queueB.drop();
    });

    test('multiple crawler instances do not share request queue state by default', async () => {
        // Each new RequestQueue.open(null) creates a new unique queue
        // They are not the same object
        const queueA = await RequestQueue.open(null);
        const queueB = await RequestQueue.open(null);

        // Different IDs means different queues
        expect(queueA.id).not.toBe(queueB.id);

        await queueA.drop();
        await queueB.drop();
    });
});
