/* eslint-disable dot-notation */

import { MemoryStorageBackend, ProxyConfiguration, Request, RequestQueue, serviceLocator } from '@crawlee/core';
import { BaseHttpClient } from '@crawlee/http-client';
import { sleep } from '@crawlee/utils';

// `vitest.mockObject` clones the object and drops its prototype, so build the mock manually to
// keep it an `instanceof BaseHttpClient`.
const createMockHttpClient = () =>
    Object.assign(Object.create(BaseHttpClient.prototype) as BaseHttpClient, {
        sendRequest: vitest.fn(async (_request?: any, _options?: any) => new Response()),
        stream: vitest.fn(async () => new Response()),
    });

let mockHttpClient = createMockHttpClient();

beforeEach(async () => {
    mockHttpClient = createMockHttpClient();
});

describe('RequestQueue remote', () => {
    beforeEach(async () => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        vitest.clearAllMocks();
    });

    test('adding a request makes it fetchable; fetching again returns null while in progress', async () => {
        const queue = await RequestQueue.open();

        const info = await queue.addRequest({ url: 'http://example.com/a' });
        expect(info.wasAlreadyPresent).toBe(false);
        expect(info.wasAlreadyHandled).toBe(false);

        const fetched = await queue.fetchNextRequest();
        expect(fetched).not.toBeNull();
        expect(fetched!.url).toBe('http://example.com/a');
        expect(fetched!.uniqueKey).toBe(info.uniqueKey);

        // The request is now in progress, so there is nothing more to fetch.
        expect(await queue.fetchNextRequest()).toBeNull();
    });

    test('adding the same uniqueKey twice does not duplicate and is served from the local cache', async () => {
        const queue = await RequestQueue.open();

        const requestA = new Request({ url: 'http://example.com/a' });
        const requestB = new Request({ url: 'http://example.com/a' }); // Has the same uniqueKey as A.

        const first = await queue.addRequest(requestA);
        expect(first.wasAlreadyPresent).toBe(false);

        // Spy on the client only AFTER the first add so we can assert the cache prevents a second call.
        const addBatchSpy = vitest.spyOn(queue.backend, 'addBatchOfRequests');

        const second = await queue.addRequest(requestB);
        expect(second).toEqual({
            requestId: first.requestId,
            uniqueKey: requestA.uniqueKey,
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
            forefront: false,
        });

        // The local cache should have prevented a second client call.
        expect(addBatchSpy).not.toHaveBeenCalled();

        // And there is still only a single request in the queue.
        const fetched = await queue.fetchNextRequest();
        expect(fetched!.uniqueKey).toBe(requestA.uniqueKey);
        expect(await queue.fetchNextRequest()).toBeNull();
    });

    test('a handled request is not fetched again and checkReadiness() reports finished', async () => {
        const queue = await RequestQueue.open();

        await queue.addRequest({ url: 'http://example.com/a' });

        const fetched = await queue.fetchNextRequest();
        expect(fetched).not.toBeNull();

        await queue.markRequestAsHandled(fetched!);

        expect(await queue.fetchNextRequest()).toBeNull();
        expect((await queue.checkReadiness()).status).toBe('finished');
    });

    test('a reclaimed request is fetched again; reclaim with forefront returns it to the front', async () => {
        const queue = await RequestQueue.open();

        await queue.addRequest({ url: 'http://example.com/a' });
        await sleep(5);
        await queue.addRequest({ url: 'http://example.com/b' });

        // Fetch the first pending request (a) and reclaim it to the front.
        const first = await queue.fetchNextRequest();
        expect(first!.url).toBe('http://example.com/a');

        await queue.reclaimRequest(first!, { forefront: true });

        // The reclaimed request should now be served before the older pending request (b).
        const afterReclaim = await queue.fetchNextRequest();
        expect(afterReclaim!.url).toBe('http://example.com/a');
        expect(afterReclaim!.uniqueKey).toBe(first!.uniqueKey);
    });

    test('addRequests processes requests and reports processed/unprocessed', async () => {
        const queue = await RequestQueue.open();

        const result = await queue.addRequests([{ url: 'http://example.com/a' }, { url: 'http://example.com/b' }]);

        expect(result.processedRequests).toHaveLength(2);
        expect(result.unprocessedRequests).toHaveLength(0);
        expect(result.processedRequests.every((r) => !r.wasAlreadyPresent)).toBe(true);
        expect(result.processedRequests.map((r) => r.uniqueKey)).toEqual([
            'http://example.com/a',
            'http://example.com/b',
        ]);

        // Re-adding the same requests reports them as already present.
        const result2 = await queue.addRequests([{ url: 'http://example.com/a' }, { url: 'http://example.com/b' }]);
        expect(result2.processedRequests).toHaveLength(2);
        expect(result2.processedRequests.every((r) => r.wasAlreadyPresent)).toBe(true);

        // The queue still contains exactly the two distinct requests.
        const fetchedUrls: string[] = [];
        for (let req = await queue.fetchNextRequest(); req !== null; req = await queue.fetchNextRequest()) {
            fetchedUrls.push(req.url);
            await queue.markRequestAsHandled(req);
        }
        expect(fetchedUrls.sort()).toEqual(['http://example.com/a', 'http://example.com/b']);
    });

    test('addRequestsBatched warns about and skips requests the backend rejects, without retrying', async () => {
        const queue = await RequestQueue.open();
        const mockAddRequests = vitest.spyOn(queue.backend, 'addBatchOfRequests');

        const requestOptions = { url: 'http://example.com/bad' };
        const request = new Request(requestOptions);

        // Simulate the platform permanently rejecting the request (e.g. a 400 due to a malformed `userData` shape):
        // it is always reported back as unprocessed.
        mockAddRequests.mockResolvedValue({
            processedRequests: [],
            unprocessedRequests: [{ uniqueKey: request.uniqueKey, url: request.url, method: 'GET' }],
        });

        const logWarningSpy = vitest.spyOn(queue.log, 'warning');

        const result = await queue.addRequestsBatched([requestOptions], { waitBetweenBatchesMillis: 0 });

        // Retrying transient failures is the backend's own job: the frontend makes one attempt,
        // warns about the rejected requests, and moves on.
        expect(result.addedRequests).toHaveLength(0);
        expect(mockAddRequests).toHaveBeenCalledTimes(1);
        expect(logWarningSpy).toHaveBeenCalledTimes(1);
        expect(logWarningSpy.mock.calls[0][0]).toMatch(/rejected by the request queue/);
        expect(logWarningSpy.mock.calls[0][1]).toMatchObject({
            unprocessedRequests: [{ uniqueKey: request.uniqueKey, url: request.url, method: 'GET' }],
        });
    });

    test('addRequestsBatched does not re-submit already enqueued requests beyond the initial batch (#3120)', async () => {
        const queue = await RequestQueue.open();

        // The real memory backend already deduplicates server-side by `uniqueKey`; we only need to count
        // how many requests are actually submitted to it (calling through to the real implementation).
        let submittedCount = 0;
        const addBatchOfRequests = queue.backend.addBatchOfRequests.bind(queue.backend);
        vitest.spyOn(queue.backend, 'addBatchOfRequests').mockImplementation(async (requests, options) => {
            submittedCount += requests.length;
            return addBatchOfRequests(requests, options);
        });

        // More requests than a single batch, so the tail is added in background batches (the buggy path).
        const urls = Array.from({ length: 5 }, (_, i) => ({ url: `http://example.com/page-${i}` }));
        const options = { batchSize: 2, waitBetweenBatchesMillis: 0, waitForAllRequestsToBeAdded: true };

        // First pass: every request is new, so all are submitted once.
        await queue.addRequestsBatched(urls, options);
        expect(submittedCount).toBe(5);

        // Second pass with the same URLs: everything is already enqueued, so nothing is re-submitted.
        // Before the fix, the 3 requests outside the first batch would be sent again (submittedCount === 8).
        await queue.addRequestsBatched(urls, options);
        expect(submittedCount).toBe(5);
    });

    test('fetchNextRequest order respects forefront enqueues', async () => {
        const queue = await RequestQueue.open();

        // Add some non-forefront requests (sleep between adds to keep orderNo deterministic).
        await queue.addRequest({ url: 'http://example.com/1' });
        await sleep(5);
        await queue.addRequest({ url: 'http://example.com/5' });
        await sleep(5);
        await queue.addRequest({ url: 'http://example.com/6' });

        const retrievedUrls: string[] = [];

        // Fetch and handle the first request so it is removed from the queue.
        const first = await queue.fetchNextRequest();
        retrievedUrls.push(first!.url);
        await queue.markRequestAsHandled(first!);

        // Add more requests at the forefront.
        await queue.addRequest({ url: 'http://example.com/4' }, { forefront: true });
        await sleep(5);
        await queue.addRequest({ url: 'http://example.com/3' }, { forefront: true });
        await sleep(5);
        await queue.addRequest({ url: 'http://example.com/2' }, { forefront: true });

        // Drain the queue, marking each request handled before fetching the next so the
        // ordering is deterministic and no request is fetched twice.
        for (let req = await queue.fetchNextRequest(); req !== null; req = await queue.fetchNextRequest()) {
            retrievedUrls.push(req.url);
            await queue.markRequestAsHandled(req);
        }

        // Forefront requests (2, 3, 4) are served before the older pending ones (5, 6).
        expect(retrievedUrls.map((x) => new URL(x).pathname)).toEqual(['/1', '/2', '/3', '/4', '/5', '/6']);
    });

    test('checkReadiness() distinguishes a fetchable queue from an in-progress one', async () => {
        const queue = await RequestQueue.open();

        await queue.addRequest({ url: 'http://example.com/a' });
        expect((await queue.checkReadiness()).status).toBe('ready');

        const fetched = await queue.fetchNextRequest();
        // The in-progress request is locked, not handled, and might still be reclaimed - `waiting` rather than
        // `finished` is what keeps a crawler running while the request is processed.
        expect((await queue.checkReadiness()).status).toBe('waiting');

        await queue.markRequestAsHandled(fetched!);
        expect((await queue.checkReadiness()).status).toBe('finished');
    });

    test('recordPacingSignal() reports that a plain queue paces nothing', async () => {
        const queue = await RequestQueue.open();

        // Required on `IRequestManager`, so `false` never means "unsupported" - it means nothing here paces,
        // which is what lets a crawler warn that the signal had nowhere to go.
        expect(queue.recordPacingSignal({ url: 'http://example.com/a', reason: 'rateLimited', waitMs: 1_000 })).toBe(
            false,
        );
        expect(
            queue.recordPacingSignal({
                url: 'http://example.com/a',
                reason: 'minInterval',
                intervalMs: 1_000,
                scope: 'hostname',
            }),
        ).toBe(false);
        expect(
            queue.recordPacingSignal({
                reason: 'minIntervalEverywhere',
                intervalMs: 1_000,
                scope: 'registrableDomain',
            }),
        ).toBe(false);
    });

    test('should accept plain object in addRequest()', async () => {
        const queue = await RequestQueue.open();

        const requestOpts = { url: 'http://example.com/a' };
        const info = await queue.addRequest(requestOpts);

        const expectedUniqueKey = new Request(requestOpts).uniqueKey;
        expect(info.uniqueKey).toBe(expectedUniqueKey);
        expect(info.wasAlreadyPresent).toBe(false);

        // The request can be fetched back by its uniqueKey.
        const stored = await queue.getRequest(info.uniqueKey);
        expect(stored).not.toBeNull();
        expect(stored!.url).toBe('http://example.com/a');
        expect(stored!.uniqueKey).toBe(expectedUniqueKey);
    });

    test('should return correct handledCount', async () => {
        const queue = await RequestQueue.open();
        const getMock = vitest.spyOn(queue.backend, 'getMetadata');
        getMock.mockResolvedValueOnce({
            handledRequestCount: 33,
        } as never);
        const count = await queue.getHandledCount();
        expect(count).toBe(33);
        expect(getMock).toHaveBeenCalledTimes(1);
        expect(getMock).toHaveBeenLastCalledWith();
    });

    test('getInfo() should work', async () => {
        const queue = await RequestQueue.open();

        const expected = {
            id: 'WkzbQMuFYuamGv3YF',
            name: 'my-queue',
            userId: 'wRsJZtadYvn4mBZmm',
            createdAt: new Date('2015-12-12T07:34:14.202Z'),
            modifiedAt: new Date('2015-12-13T08:36:13.202Z'),
            accessedAt: new Date('2015-12-14T08:36:13.202Z'),
            totalRequestCount: 0,
            handledRequestCount: 0,
            pendingRequestCount: 0,
            stats: {},
            hadMultipleClients: false,
        };

        const getMock = vitest.spyOn(queue.backend, 'getMetadata').mockResolvedValueOnce(expected);

        const result = await queue.getInfo();
        expect(result).toEqual(expected);
        expect(getMock).toHaveBeenCalledTimes(1);
        expect(getMock).toHaveBeenLastCalledWith();
    });

    test('drop() works', async () => {
        const queue = await RequestQueue.open();
        const dropMock = vitest.spyOn(queue.backend, 'drop').mockResolvedValueOnce(undefined);

        await queue.drop();
        expect(dropMock).toHaveBeenCalledTimes(1);
        expect(dropMock).toHaveBeenLastCalledWith();
    });

    test('Request.userData.__crawlee internal object is non-enumerable and always defined', async () => {
        const url = 'http://example.com';
        const method = 'POST';
        const r1 = new Request({
            url,
            method,
            userData: { __crawlee: { skipNavigation: true, maxRetries: 10, foo: 123, bar: true, crawlDepth: 10 } },
        });
        const r2 = new Request({
            url,
            method,
            userData: {} as any,
        });
        const r3 = new Request({
            url,
            method,
        });
        const desc1 = Object.getOwnPropertyDescriptor(r1.userData, '__crawlee');
        expect(desc1!.enumerable).toBe(false);
        expect(r1.skipNavigation).toBe(true);
        expect(r1.maxRetries).toBe(10);
        expect(r1.crawlDepth).toBe(10);
        r1.maxRetries = 5;
        expect(r1.userData.__crawlee).toMatchObject({
            skipNavigation: true,
            maxRetries: 5,
            foo: 123,
            bar: true,
            crawlDepth: 10,
        });
        // Re-wrapping userData that comes from another Request instance (where `__crawlee` is
        // non-enumerable) must preserve the internal state instead of dropping it via the spread.
        const r4 = new Request({ url, method, userData: r1.userData });
        expect(r4.skipNavigation).toBe(true);
        expect(r4.maxRetries).toBe(5);
        expect(r4.crawlDepth).toBe(10);
        expect(r1.userData.__crawlee).toMatchObject({ skipNavigation: true, maxRetries: 5 });
        const desc2 = Object.getOwnPropertyDescriptor(r2.userData, '__crawlee');
        expect(desc2!.enumerable).toBe(false);
        expect(r2.maxRetries).toBeUndefined();
        expect(r2.userData.__crawlee).toEqual({});
        const desc3 = Object.getOwnPropertyDescriptor(r3.userData, '__crawlee');
        expect(desc3!.enumerable).toBe(false);
        expect(r3.maxRetries).toBeUndefined();
        expect(r3.userData.__crawlee).toEqual({});
        r3.maxRetries = 2;
        expect(r3.userData.__crawlee).toEqual({ maxRetries: 2 });
    });

    describe('setExpectedRequestProcessingTimeSecs', () => {
        test('forwards the value to the client, but only ever raises it', async () => {
            const queue = await RequestQueue.open();
            // The in-memory client does not implement this optional hint (it has no request locking to
            // tune), so attach a stub to verify the frontend's raise-only forwarding logic in isolation.
            const spy = vitest.fn();
            (queue.backend as any).setExpectedRequestProcessingTimeSecs = spy;

            // First hint is forwarded.
            await queue.setExpectedRequestProcessingTimeSecs(60);
            expect(spy).toHaveBeenLastCalledWith(60);

            // A larger hint is forwarded.
            await queue.setExpectedRequestProcessingTimeSecs(120);
            expect(spy).toHaveBeenLastCalledWith(120);

            // A smaller (or equal) hint must not shorten the reservation, so it is not forwarded.
            await queue.setExpectedRequestProcessingTimeSecs(30);
            await queue.setExpectedRequestProcessingTimeSecs(120);
            expect(spy).toHaveBeenCalledTimes(2);
        });
    });

    describe('stats', () => {
        test('start at zero', async () => {
            const queue = await RequestQueue.open();
            expect(queue.stats).toEqual({ writeCount: 0, headItemReadCount: 0 });
        });

        test('count writes on add, handle and reclaim', async () => {
            const queue = await RequestQueue.open();

            await queue.addRequest({ url: 'http://example.com/a' });
            expect(queue.stats.writeCount).toBe(1);

            const request = await queue.fetchNextRequest();
            expect(queue.stats.headItemReadCount).toBe(1);

            await queue.markRequestAsHandled(request!);
            expect(queue.stats.writeCount).toBe(2);
        });

        test('count head reads on fetchNextRequest', async () => {
            const queue = await RequestQueue.open();

            await queue.addRequest({ url: 'http://example.com/a' });

            const headReadsBefore = queue.stats.headItemReadCount;
            await queue.fetchNextRequest();
            expect(queue.stats.headItemReadCount).toBe(headReadsBefore + 1);
        });
    });
});

describe('RequestQueue with requestsFromUrl', () => {
    beforeEach(async () => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        vitest.restoreAllMocks();
    });

    test('should correctly load list from hosted files in correct order', async () => {
        const spy = vitest.spyOn(RequestQueue.prototype as any, 'downloadListOfUrls');
        const list1 = ['https://example.com', 'https://google.com', 'https://wired.com'];
        const list2 = ['https://another.com', 'https://page.com'];
        spy.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(list1) as any, 100)) as any);
        spy.mockResolvedValueOnce(list2);

        const queue = await RequestQueue.open();
        await queue.addRequests([
            { method: 'GET', requestsFromUrl: 'http://example.com/list-1' },
            { method: 'POST', requestsFromUrl: 'http://example.com/list-2' },
        ]);

        expect(await queue.fetchNextRequest()).toMatchObject({ method: 'GET', url: list1[0] });
        expect(await queue.fetchNextRequest()).toMatchObject({ method: 'GET', url: list1[1] });
        expect(await queue.fetchNextRequest()).toMatchObject({ method: 'GET', url: list1[2] });
        expect(await queue.fetchNextRequest()).toMatchObject({ method: 'POST', url: list2[0] });
        expect(await queue.fetchNextRequest()).toMatchObject({ method: 'POST', url: list2[1] });

        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy).toHaveBeenCalledWith({ url: 'http://example.com/list-1', urlRegExp: undefined });
        expect(spy).toHaveBeenCalledWith({ url: 'http://example.com/list-2', urlRegExp: undefined });
    });

    test('should use regex parameter to parse urls', async () => {
        const listStr = 'kjnjkn"https://example.com/a/b/c?q=1#abc";,"HTTP://google.com/a/b/c";dgg:dd';
        const listArr = ['https://example.com', 'HTTP://google.com'];

        mockHttpClient.sendRequest.mockResolvedValueOnce(new Response(listStr));

        const regex = /(https:\/\/example.com|HTTP:\/\/google.com)/g;
        const queue = await RequestQueue.open(null, {
            httpClient: mockHttpClient,
        });
        await queue.addRequest({
            method: 'GET',
            requestsFromUrl: 'http://example.com/list-1',
            regex,
        });

        expect(await queue.fetchNextRequest()).toMatchObject({ method: 'GET', url: listArr[0] });
        expect(await queue.fetchNextRequest()).toMatchObject({ method: 'GET', url: listArr[1] });
        await queue.drop();

        expect(mockHttpClient.sendRequest).toHaveBeenCalled();
        expect(mockHttpClient.sendRequest.mock.calls[0][0].url).toBe('http://example.com/list-1');
    });

    test('should fix gdoc sharing url in `requestsFromUrl` automatically (GH issue #639)', async () => {
        const list = ['https://example.com', 'https://google.com', 'https://wired.com'];
        const wrongUrls = [
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU',
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/',
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/edit?usp=sharing',
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/123123132',
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/?q=blablabla',
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/edit#gid=0',
        ];
        const correctUrl =
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/gviz/tq?tqx=out:csv';

        mockHttpClient.sendRequest.mockImplementation(async () => new Response(list.join('\n'), { status: 200 }));

        const queue = await RequestQueue.open(null, {
            httpClient: mockHttpClient,
        });
        await queue.addRequests(wrongUrls.map((requestsFromUrl) => ({ requestsFromUrl })));

        expect(await queue.fetchNextRequest()).toMatchObject({ method: 'GET', url: list[0] });
        expect(await queue.fetchNextRequest()).toMatchObject({ method: 'GET', url: list[1] });
        expect(await queue.fetchNextRequest()).toMatchObject({ method: 'GET', url: list[2] });

        expect(mockHttpClient.sendRequest.mock.calls[0][0].url).toBe(correctUrl);
        await queue.drop();
    });

    test('should handle requestsFromUrl with no URLs', async () => {
        const spy = vitest.spyOn(RequestQueue.prototype as any, 'downloadListOfUrls');
        spy.mockResolvedValueOnce([]);

        const queue = await RequestQueue.open();
        await queue.addRequest({
            method: 'GET',
            requestsFromUrl: 'http://example.com/list-1',
        });

        expect(await queue.fetchNextRequest()).toBe(null);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith({ url: 'http://example.com/list-1', urlRegExp: undefined });
    });

    test('should use the defined proxy server when using `requestsFromUrl`', async () => {
        const proxyUrls = ['http://proxyurl.usedforthe.download', 'http://another.proxy.url'];

        const spy = vitest.spyOn(RequestQueue.prototype as any, 'downloadListOfUrls');
        spy.mockResolvedValue([]);

        const proxyConfiguration = new ProxyConfiguration({
            proxyUrls,
        });

        const queue = await RequestQueue.open(null, { proxyConfiguration });
        await queue.addRequests([
            { requestsFromUrl: 'http://example.com/list-1' },
            { requestsFromUrl: 'http://example.com/list-2' },
            { requestsFromUrl: 'http://example.com/list-3' },
        ]);

        expect(spy).not.toHaveBeenCalledWith(expect.not.objectContaining({ proxyUrl: expect.any(String) }));
    });
});

describe('RequestQueue (request lifecycle)', () => {
    const totalRequestsPerTest = 50;

    function calculateHistogram(requests: { uniqueKey: string }[]): number[] {
        const histogram: number[] = [];
        for (const item of requests) {
            const key = item.uniqueKey;
            const index = parseInt(key, 10);
            histogram[index] = histogram[index] ? histogram[index] + 1 : 1;
        }

        return histogram;
    }

    async function getEmptyQueue(name: string) {
        const queue = await RequestQueue.open({ name });
        await queue.drop();
        return RequestQueue.open({ name });
    }

    function getUniqueRequests(count: number) {
        return new Array(count)
            .fill(0)
            .map((_, i) => new Request({ url: `http://example.com/${i}`, uniqueKey: String(i) }));
    }

    test('each request is fetched for processing exactly once', async () => {
        const queue = await getEmptyQueue('fetch-each-once');
        await queue.addRequests(getUniqueRequests(totalRequestsPerTest));

        const fetched: { uniqueKey: string }[] = [];
        for (let req = await queue.fetchNextRequest(); req !== null; req = await queue.fetchNextRequest()) {
            fetched.push(req);
        }

        const histogram = calculateHistogram(fetched);
        expect(histogram).toEqual(Array(totalRequestsPerTest).fill(1));
    });

    test('a fetched request is not served again until it is reclaimed', async () => {
        const queue = await getEmptyQueue('fetch-in-progress');
        await queue.addRequests(getUniqueRequests(1));

        const first = await queue.fetchNextRequest();
        expect(first).not.toBeNull();

        // The only request is now in progress, so there is nothing more to fetch.
        expect(await queue.fetchNextRequest()).toBeNull();

        // Reclaiming returns it to the queue so it can be fetched again.
        await queue.reclaimRequest(first!);

        const second = await queue.fetchNextRequest();
        expect(second!.uniqueKey).toBe(first!.uniqueKey);
    });

    test('a handled request is never served again', async () => {
        const queue = await getEmptyQueue('handled-not-served');
        await queue.addRequests(getUniqueRequests(1));

        const first = await queue.fetchNextRequest();
        await queue.markRequestAsHandled(first!);

        expect(await queue.fetchNextRequest()).toBeNull();
        expect((await queue.checkReadiness()).status).toBe('finished');
    });

    test('`fetchNextRequest` order respects `forefront` enqueues', async () => {
        const queue = await getEmptyQueue('fetch-next-request-order');

        const retrievedUrls: string[] = [];

        await queue.addRequests([
            { url: 'http://example.com/1' },
            ...Array.from({ length: 25 }, (_, i) => ({ url: `http://example.com/${i + 4}` })),
        ]);

        retrievedUrls.push((await queue.fetchNextRequest())!.url);

        await queue.addRequest({ url: 'http://example.com/3' }, { forefront: true });
        await queue.addRequest({ url: 'http://example.com/2' }, { forefront: true });

        let req = await queue.fetchNextRequest();

        while (req) {
            retrievedUrls.push(req!.url);
            req = await queue.fetchNextRequest();
        }

        // 28 requests exceed the RQv2 batch size limit of 25, so we can examine the request ordering
        expect(retrievedUrls.map((x) => new URL(x).pathname)).toEqual(
            Array.from({ length: 28 }, (_, i) => `/${i + 1}`),
        );
    });

    test('`reclaimRequest` with `forefront` respects the request ordering', async () => {
        const queue = await getEmptyQueue('fetch-next-request-order-reclaim');

        const retrievedUrls: string[] = [];

        await queue.addRequests([
            { url: 'http://example.com/1' },
            { url: 'http://example.com/4' },
            { url: 'http://example.com/5' },
        ]);

        retrievedUrls.push((await queue.fetchNextRequest())!.url);

        await queue.addRequest({ url: 'http://example.com/3' }, { forefront: true });
        await queue.addRequest({ url: 'http://example.com/2' }, { forefront: true });

        let req = await queue.fetchNextRequest();

        expect(req!.url).toBe('http://example.com/2');

        await queue.reclaimRequest(req!, { forefront: true });

        req = await queue.fetchNextRequest();

        while (req) {
            retrievedUrls.push(req!.url);
            req = await queue.fetchNextRequest();
        }

        expect(retrievedUrls.map((x) => new URL(x).pathname)).toEqual(Array.from({ length: 5 }, (_, i) => `/${i + 1}`));
    });
});

describe('RequestQueue background batches', () => {
    beforeEach(async () => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    test('a failing background batch rejects instead of hanging, and stops blocking checkReadiness()', async () => {
        const queue = await RequestQueue.open();

        let batches = 0;
        const original = queue.addRequests.bind(queue);
        vitest.spyOn(queue, 'addRequests').mockImplementation(async (requests, options) => {
            if (++batches > 1) throw new Error('backend exploded');
            return original(requests, options);
        });

        const result = await queue.addRequestsBatched(
            [{ url: 'https://example.com/1' }, { url: 'https://example.com/2' }],
            { batchSize: 1, waitBetweenBatchesMillis: 0 },
        );

        // Previously the async promise executor swallowed the throw: this promise never settled at all.
        await expect(result.waitForAllRequestsToBeAdded).rejects.toThrow('backend exploded');

        // ...and the in-flight batch counter was reset so the queue can finish once handled.
        const req = await queue.fetchNextRequest();
        expect(req).toBeDefined();
        await queue.markRequestAsHandled(req!);
        expect((await queue.checkReadiness()).status).toBe('finished');
    }, 10_000);
});

describe('MemoryStorageBackend request queue', () => {
    test('head operations do not scan already-handled requests', async () => {
        const backend = new MemoryStorageBackend();
        const queue = await backend.createRequestQueueBackend({ name: 'handled-scan' });

        // Simulate a crawl nearing its end: a large number of handled requests and few pending ones.
        const handledAt = new Date().toISOString();
        const handledCount = 200_000;
        for (let i = 0; i < handledCount; i += 1_000) {
            await queue.addBatchOfRequests(
                Array.from({ length: 1_000 }, (_, j) => ({
                    url: `http://example.com/${i + j}`,
                    uniqueKey: `handled-${i + j}`,
                    handledAt,
                })),
            );
        }
        expect((await queue.getMetadata()).handledRequestCount).toBe(handledCount);

        // Each call used to walk the whole map (O(handled)): ~8s for this loop vs ~5ms once only pending
        // requests are scanned. The loose budget only separates those two regimes, well above CI noise.
        const start = performance.now();
        for (let i = 0; i < 200; i++) {
            await queue.addBatchOfRequests([{ url: `http://example.com/new-${i}`, uniqueKey: `new-${i}` }]);
            expect(await queue.isEmpty()).toBe(false);
            const request = await queue.fetchNextRequest();
            expect(request!.uniqueKey).toBe(`new-${i}`);
            expect(await queue.isFinished()).toBe(false);
            await queue.markRequestAsHandled({ ...request!, handledAt });
        }
        expect(await queue.isEmpty()).toBe(true);
        expect(await queue.isFinished()).toBe(true);
        expect(performance.now() - start).toBeLessThan(500);
    }, 60_000);
});
