import type { RequestLoaderStatus } from '@crawlee/core';
import {
    log,
    MemoryStorageBackend,
    Request,
    RequestList,
    RequestManagerTandem,
    RequestQueue,
    serviceLocator,
    ThrottlingRequestManager,
} from '@crawlee/core';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

describe('RequestManagerTandem', () => {
    let logLevel: number;

    beforeAll(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    beforeEach(async () => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        vi.restoreAllMocks();
    });

    afterAll(async () => {
        log.setLevel(logLevel);
    });

    test('fetchNextRequest transfers from list to queue when queue is empty', async () => {
        // Create sources with 3 URLs
        const requestList = await RequestList.open(null, [
            { url: 'https://example.com/1' },
            { url: 'https://example.com/2' },
            { url: 'https://example.com/3' },
        ]);
        const requestQueue = await RequestQueue.open();

        // Mock the addRequest function of requestQueue to verify it's called
        const addRequestSpy = vi.spyOn(requestQueue, 'addRequest');

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        // First fetch should trigger transfer from list to queue
        const request1 = await tandem.fetchNextRequest();

        // Verify the request was transferred from list to queue
        expect(addRequestSpy).toHaveBeenCalled();
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

    test('markRequestAsHandled properly marks request as handled in the queue', async () => {
        const requestList = await RequestList.open(null, [{ url: 'https://example.com/1' }]);
        const requestQueue = await RequestQueue.open();

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        // Mock markRequestAsHandled in requestQueue
        const markHandledSpy = vi.spyOn(requestQueue, 'markRequestAsHandled');

        // First fetch a request
        const request = await tandem.fetchNextRequest();
        expect(request).not.toBeNull();

        // Mark it as handled
        await tandem.markRequestAsHandled(request!);

        // Verify the queue's markRequestAsHandled was called
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

    test('getHandledCount returns the queue getHandledCount', async () => {
        const requestList = await RequestList.open(null, [
            { url: 'https://example.com/1' },
            { url: 'https://example.com/2' },
        ]);
        const requestQueue = await RequestQueue.open();

        // Mock getHandledCount methods to return fixed values
        vi.spyOn(requestList, 'getHandledCount').mockResolvedValue(3);
        vi.spyOn(requestQueue, 'getHandledCount').mockResolvedValue(2);

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        // Only the request queue counts
        await expect(tandem.getHandledCount()).resolves.toBe(2);
    });

    test('getTotalCount returns correct count', async () => {
        const requestList = await RequestList.open(null, [
            { url: 'https://example.com/1' },
            { url: 'https://example.com/2' },
        ]);
        const requestQueue = await RequestQueue.open();
        const tandem = new RequestManagerTandem(requestList, requestQueue);

        await expect(tandem.getTotalCount()).resolves.toBe(2);

        const req = await tandem.fetchNextRequest();

        await expect(tandem.getTotalCount()).resolves.toBe(2);

        await tandem.reclaimRequest(req!);

        await expect(tandem.getTotalCount()).resolves.toBe(2);

        await tandem.addRequest({ url: 'https://example.com/3' });

        await expect(tandem.getTotalCount()).resolves.toBe(3);
    });

    test('readiness joins the loader and the manager, and the manager never masks the loader', async () => {
        const requestList = await RequestList.open(null, [{ url: 'https://example.com/1' }]);
        const requestQueue = await RequestQueue.open();

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        const listReadiness = vi.spyOn(requestList, 'checkReadiness');
        const queueReadiness = vi.spyOn(requestQueue, 'checkReadiness');

        const readiness = async (list: RequestLoaderStatus, queue: RequestLoaderStatus) => {
            listReadiness.mockResolvedValue(list);
            queueReadiness.mockResolvedValue(queue);
            return tandem.checkReadiness();
        };

        await expect(readiness({ status: 'ready' }, { status: 'finished' })).resolves.toEqual({ status: 'ready' });
        await expect(readiness({ status: 'finished' }, { status: 'ready' })).resolves.toEqual({ status: 'ready' });

        // A backoff on the manager side must not freeze the loader's unrelated requests for the length of it.
        await expect(readiness({ status: 'ready' }, { status: 'waiting', readyAt: 42 })).resolves.toEqual({
            status: 'ready',
        });

        await expect(readiness({ status: 'waiting' }, { status: 'finished' })).resolves.toEqual({ status: 'waiting' });
        await expect(readiness({ status: 'finished' }, { status: 'waiting', readyAt: 42 })).resolves.toEqual({
            status: 'waiting',
            readyAt: 42,
        });

        await expect(readiness({ status: 'finished' }, { status: 'finished' })).resolves.toEqual({
            status: 'finished',
        });
    });

    test('drops the request and marks it handled on the loader when transfer fails', async () => {
        const requestList = await RequestList.open(null, [
            { url: 'https://example.com/1' },
            { url: 'https://example.com/2' },
        ]);
        const requestQueue = await RequestQueue.open();

        // Mock the queue's addRequest to simulate failure
        vi.spyOn(requestQueue, 'addRequest').mockRejectedValue(new Error('Add failed'));

        // The loader is read-only and can no longer reclaim. The failed request must be marked as
        // handled on the loader so it doesn't get stuck in the loader's in-progress state
        // (matching crawlee-python behaviour).
        const markHandledSpy = vi.spyOn(requestList, 'markRequestAsHandled');

        // The queue should never be fetched from on a failed transfer round.
        const queueFetchSpy = vi.spyOn(requestQueue, 'fetchNextRequest');

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        // Attempt to fetch which should trigger the transfer
        const request = await tandem.fetchNextRequest();

        expect(markHandledSpy).toHaveBeenCalled();
        // The dropped request results in `null` this round; we do not fall through to the manager
        // (matching crawlee-python behaviour). The next call will pick up the following request.
        expect(request).toBeNull();
        expect(queueFetchSpy).not.toHaveBeenCalled();
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
        await requestQueue.addRequest({ url: 'https://example.com/3' });

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        // Iterate through all requests
        const urls: string[] = [];
        for await (const request of tandem) {
            urls.push(request.url);
        }

        // Verify we got both URLs
        expect(urls).toEqual(['https://example.com/1', 'https://example.com/2', 'https://example.com/3']);
    });

    test('opens the queue lazily from a factory only on first use', async () => {
        const requestList = await RequestList.open(null, [{ url: 'https://example.com/1' }]);

        const factory = vi.fn(async () => RequestQueue.open());
        const tandem = new RequestManagerTandem(requestList, factory);

        // Constructing the tandem must not open the queue yet.
        expect(factory).not.toHaveBeenCalled();

        await tandem.fetchNextRequest();
        expect(factory).toHaveBeenCalledTimes(1);

        // Subsequent operations reuse the same memoized queue.
        await tandem.checkReadiness();
        expect(factory).toHaveBeenCalledTimes(1);
    });

    test('forwards the pacing signals to the manager it wraps', async () => {
        const requestList = await RequestList.open(null, [{ url: 'https://example.com/1' }]);
        const throttler = new ThrottlingRequestManager({
            inner: await RequestQueue.open(),
            domains: ['example.com'],
        });

        const tandem = new RequestManagerTandem(requestList, throttler);

        expect(
            tandem.recordPacingSignal({
                url: 'https://example.com/1',
                reason: 'minInterval',
                intervalMs: 5_000,
                scope: 'hostname',
            }),
        ).toBe(true);
        expect(tandem.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited', waitMs: 1_000 })).toBe(
            true,
        );

        // A domain the pacer does not cover comes back as unpaced rather than silently swallowed, so the
        // crawler can warn about it.
        expect(
            tandem.recordPacingSignal({
                url: 'https://other.com/1',
                reason: 'minInterval',
                intervalMs: 5_000,
                scope: 'hostname',
            }),
        ).toBe(false);
        expect(tandem.recordPacingSignal({ url: 'https://other.com/1', reason: 'rateLimited', waitMs: 1_000 })).toBe(
            false,
        );

        // ...and the pacer acted on the signals rather than merely accepting them.
        await expect(throttler.checkReadiness()).resolves.toMatchObject({ status: 'waiting' });

        // A floor covering every domain reaches it the same way, and this pacer covers only `example.com`.
        expect(() =>
            tandem.recordPacingSignal({ reason: 'minIntervalEverywhere', intervalMs: 5_000, scope: 'hostname' }),
        ).toThrow(/domains: 'all'/);
    });

    test('reports the pacing signals as unhandled when the manager cannot pace', async () => {
        const requestList = await RequestList.open(null, [{ url: 'https://example.com/1' }]);
        const tandem = new RequestManagerTandem(requestList, await RequestQueue.open());

        expect(tandem.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited', waitMs: 1_000 })).toBe(
            false,
        );
        expect(
            tandem.recordPacingSignal({
                url: 'https://example.com/1',
                reason: 'minInterval',
                intervalMs: 5_000,
                scope: 'hostname',
            }),
        ).toBe(false);
        expect(
            tandem.recordPacingSignal({
                reason: 'minIntervalEverywhere',
                intervalMs: 5_000,
                scope: 'registrableDomain',
            }),
        ).toBe(false);
    });

    test('persistState forwards to the read-only loader', async () => {
        const requestList = await RequestList.open(null, [{ url: 'https://example.com/1' }]);
        const requestQueue = await RequestQueue.open();

        const persistSpy = vi.spyOn(requestList, 'persistState').mockResolvedValue();

        const tandem = new RequestManagerTandem(requestList, requestQueue);
        await tandem.persistState();

        expect(persistSpy).toHaveBeenCalledTimes(1);
    });

    test('setExpectedRequestProcessingTimeSecs forwards to an already-resolved manager', async () => {
        const requestList = await RequestList.open(null, [{ url: 'https://example.com/1' }]);
        const requestQueue = await RequestQueue.open();
        const hintSpy = vi.spyOn(requestQueue, 'setExpectedRequestProcessingTimeSecs');

        const tandem = new RequestManagerTandem(requestList, requestQueue);

        // Resolve the manager first (the queue was passed eagerly, but make the dependency explicit).
        await tandem.fetchNextRequest();

        await tandem.setExpectedRequestProcessingTimeSecs(600);
        expect(hintSpy).toHaveBeenCalledWith(600);
    });

    test('setExpectedRequestProcessingTimeSecs applies a hint set before the manager is lazily resolved', async () => {
        const requestList = await RequestList.open(null, [{ url: 'https://example.com/1' }]);
        const requestQueue = await RequestQueue.open();
        const hintSpy = vi.spyOn(requestQueue, 'setExpectedRequestProcessingTimeSecs');

        // Provide the manager lazily so it is not resolved at construction time.
        const tandem = new RequestManagerTandem(requestList, () => requestQueue);

        // Hint arrives before anything resolves the manager — nothing forwarded yet.
        await tandem.setExpectedRequestProcessingTimeSecs(600);
        expect(hintSpy).not.toHaveBeenCalled();

        // Resolving the manager (via any operation) applies the remembered hint.
        await tandem.fetchNextRequest();
        expect(hintSpy).toHaveBeenCalledWith(600);
    });
});
