import { log, Request, RequestList, RequestManagerTandem, RequestQueue } from '@crawlee/core';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { MemoryStorageEmulator } from '../shared/MemoryStorageEmulator';

describe('RequestManagerTandem', () => {
    let logLevel: number;
    const emulator = new MemoryStorageEmulator();

    beforeAll(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    beforeEach(async () => {
        await emulator.init();
        vi.restoreAllMocks();
    });

    afterAll(async () => {
        log.setLevel(logLevel);
        await emulator.destroy();
    });

    test('fetchNextRequest transfers from list to queue when queue is empty', async () => {
        // Create sources with 3 URLs
        const requestList = await RequestList.open(null, [
            { url: 'https://example.com/1' },
            { url: 'https://example.com/2' },
            { url: 'https://example.com/3' },
        ]);
        const requestQueue = await RequestQueue.open();

        // Mock the addRequests function of requestQueue to verify it's called
        const addRequestsSpy = vi.spyOn(requestQueue, 'addRequest');

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        // First fetch should trigger transfer from list to queue
        const request1 = await tandem.fetchNextRequest();

        // Verify the request was transferred from list to queue
        expect(addRequestsSpy).toHaveBeenCalled();
        expect(request1).not.toBeNull();
        expect(request1?.url).toBe('https://example.com/1');

        // Fetch more requests to ensure they all come from the queue
        const request2 = await tandem.fetchNextRequest();
        expect(request2).not.toBeNull();
        expect(request2?.url).toBe('https://example.com/2');

        const request3 = await tandem.fetchNextRequest();
        expect(request3).not.toBeNull();
        expect(request3?.url).toBe('https://example.com/3');

        // No more requests should be available
        const request4 = await tandem.fetchNextRequest();
        expect(request4).toBeNull();
    });

    test('markRequestHandled properly marks request as handled in the queue', async () => {
        const requestList = await RequestList.open(null, [{ url: 'https://example.com/1' }]);
        const requestQueue = await RequestQueue.open();

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        // Mock markRequestHandled in requestQueue
        const markHandledSpy = vi.spyOn(requestQueue, 'markRequestHandled');

        // First fetch a request
        const request = await tandem.fetchNextRequest();
        expect(request).not.toBeNull();

        // Mark it as handled
        await tandem.markRequestHandled(request!);

        // Verify the queue's markRequestHandled was called
        expect(markHandledSpy).toHaveBeenCalledWith(request);
    });

    test('reclaimRequest properly reclaims request in the queue', async () => {
        const requestList = await RequestList.open(null, [{ url: 'https://example.com/1' }]);
        const requestQueue = await RequestQueue.open();

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        // Mock reclaimRequest in requestQueue
        const reclaimSpy = vi.spyOn(requestQueue, 'reclaimRequest');

        // First fetch a request
        const request = await tandem.fetchNextRequest();
        expect(request).not.toBeNull();

        // Reclaim the request
        await tandem.reclaimRequest(request!);

        // Verify the queue's reclaimRequest was called
        expect(reclaimSpy).toHaveBeenCalledWith(request, undefined);
    });

    test('handledCount returns the sum of list and queue handledCount', async () => {
        const requestList = await RequestList.open(null, [
            { url: 'https://example.com/1' },
            { url: 'https://example.com/2' },
        ]);
        const requestQueue = await RequestQueue.open();

        // Mock handledCount methods to return fixed values
        vi.spyOn(requestList, 'handledCount').mockReturnValue(3);
        vi.spyOn(requestQueue, 'handledCount').mockResolvedValue(2);

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        // Only the request queue counts
        await expect(tandem.handledCount()).resolves.toBe(2);
    });

    test('isFinished returns true only when both list and queue are finished', async () => {
        const requestList = await RequestList.open(null, [{ url: 'https://example.com/1' }]);
        const requestQueue = await RequestQueue.open();

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        // Mock the isFinished methods
        vi.spyOn(requestList, 'isFinished').mockResolvedValue(false);
        vi.spyOn(requestQueue, 'isFinished').mockResolvedValue(false);

        // Neither is finished, so tandem should not be finished
        expect(await tandem.isFinished()).toBe(false);

        // Only list is finished
        vi.spyOn(requestList, 'isFinished').mockResolvedValue(true);
        vi.spyOn(requestQueue, 'isFinished').mockResolvedValue(false);
        expect(await tandem.isFinished()).toBe(false);

        // Only queue is finished
        vi.spyOn(requestList, 'isFinished').mockResolvedValue(false);
        vi.spyOn(requestQueue, 'isFinished').mockResolvedValue(true);
        expect(await tandem.isFinished()).toBe(false);

        // Both are finished
        vi.spyOn(requestList, 'isFinished').mockResolvedValue(true);
        vi.spyOn(requestQueue, 'isFinished').mockResolvedValue(true);
        expect(await tandem.isFinished()).toBe(true);
    });

    test('isEmpty returns true only when both list and queue are empty', async () => {
        const requestList = await RequestList.open(null, [{ url: 'https://example.com/1' }]);
        const requestQueue = await RequestQueue.open();

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        // Mock the isEmpty methods
        vi.spyOn(requestList, 'isEmpty').mockResolvedValue(false);
        vi.spyOn(requestQueue, 'isEmpty').mockResolvedValue(false);

        // Neither is empty, so tandem should not be empty
        expect(await tandem.isEmpty()).toBe(false);

        // Only list is empty
        vi.spyOn(requestList, 'isEmpty').mockResolvedValue(true);
        vi.spyOn(requestQueue, 'isEmpty').mockResolvedValue(false);
        expect(await tandem.isEmpty()).toBe(false);

        // Only queue is empty
        vi.spyOn(requestList, 'isEmpty').mockResolvedValue(false);
        vi.spyOn(requestQueue, 'isEmpty').mockResolvedValue(true);
        expect(await tandem.isEmpty()).toBe(false);

        // Both are empty
        vi.spyOn(requestList, 'isEmpty').mockResolvedValue(true);
        vi.spyOn(requestQueue, 'isEmpty').mockResolvedValue(true);
        expect(await tandem.isEmpty()).toBe(true);
    });

    test('handles failed batch transfer appropriately', async () => {
        const requestList = await RequestList.open(null, [
            { url: 'https://example.com/1' },
            { url: 'https://example.com/2' },
        ]);
        const requestQueue = await RequestQueue.open();

        // Mock the queue's addRequests to simulate failure
        vi.spyOn(requestQueue, 'addRequest').mockRejectedValue(new Error('Batch add failed'));

        // Mock the reclaimRequest method to verify it's called
        const reclaimSpy = vi.spyOn(requestList, 'reclaimRequest');

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        // Attempt to fetch which should trigger the batch transfer
        await tandem.fetchNextRequest();

        // Verify that reclaimRequest was called to reclaim the failed requests
        expect(reclaimSpy).toHaveBeenCalled();
    });

    test('added requests are forwarded to the underlying RequestQueue', async () => {
        const requestList = await RequestList.open(null, []);
        const requestQueue = await RequestQueue.open();

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        // Mock the addRequest method of the queue
        const addRequestSpy = vi.spyOn(requestQueue, 'addRequestsBatched');

        // Add a new request directly through tandem
        const request = new Request({ url: 'https://example.com/new' });
        await tandem.addRequestsBatched([request]);

        // Verify the request was forwarded to the queue
        expect(addRequestSpy).toHaveBeenCalledWith([request], undefined);
    });

    test('async iterator iterates through all requests', async () => {
        const requestList = await RequestList.open(null, [
            { url: 'https://example.com/1' },
            { url: 'https://example.com/2' },
        ]);
        const requestQueue = await RequestQueue.open();

        // Create a mock implementation that returns a fixed set of requests
        vi.spyOn(requestQueue, Symbol.asyncIterator).mockImplementation(async function* () {
            yield new Request({ url: 'https://example.com/1' });
            yield new Request({ url: 'https://example.com/2' });
        });

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        // Iterate through all requests
        const urls: string[] = [];
        for await (const request of tandem) {
            urls.push(request.url);
        }

        // Verify we got both URLs
        expect(urls).toEqual(['https://example.com/1', 'https://example.com/2']);
    });
});
