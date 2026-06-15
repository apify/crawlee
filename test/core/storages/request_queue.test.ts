/* eslint-disable dot-notation */

import { ProxyConfiguration, Request, RequestQueue, serviceLocator } from '@crawlee/core';
import { sleep } from '@crawlee/utils';

import { MemoryStorageEmulator } from '../../shared/MemoryStorageEmulator.js';

let mockHttpClient = vitest.mockObject({
    async sendRequest(_request: any, _options?: any) {
        return new Response();
    },
    async stream() {
        return new Response();
    },
});

beforeEach(async () => {
    mockHttpClient = vitest.mockObject({
        async sendRequest() {
            return new Response();
        },
        async stream() {
            return new Response();
        },
    });
});

describe('RequestQueue remote', () => {
    const emulator = new MemoryStorageEmulator();

    beforeEach(async () => {
        await emulator.init();
        vitest.clearAllMocks();
    });

    afterEach(async () => {
        await emulator.destroy();
    });

    async function createRequestQueue(id = 'some-id', name?: string) {
        const client = await serviceLocator.getStorageClient().createRequestQueueClient(name ? { name } : { id });
        return new RequestQueue({ id, name, client }, serviceLocator.getConfiguration());
    }

    test('adding a request makes it fetchable; fetching again returns null while in progress', async () => {
        const queue = await createRequestQueue();

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
        const queue = await createRequestQueue();

        const requestA = new Request({ url: 'http://example.com/a' });
        const requestB = new Request({ url: 'http://example.com/a' }); // Has the same uniqueKey as A.

        const first = await queue.addRequest(requestA);
        expect(first.wasAlreadyPresent).toBe(false);

        // Spy on the client only AFTER the first add so we can assert the cache prevents a second call.
        const addBatchSpy = vitest.spyOn(queue.client, 'addBatchOfRequests');

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

    test('a handled request is not fetched again and isFinished() becomes true', async () => {
        const queue = await createRequestQueue();

        await queue.addRequest({ url: 'http://example.com/a' });

        const fetched = await queue.fetchNextRequest();
        expect(fetched).not.toBeNull();

        await queue.markRequestAsHandled(fetched!);

        expect(await queue.fetchNextRequest()).toBeNull();
        expect(await queue.isFinished()).toBe(true);
    });

    test('a reclaimed request is fetched again; reclaim with forefront returns it to the front', async () => {
        const queue = await createRequestQueue();

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
        const queue = await createRequestQueue('batch-requests');

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

    test('addRequestsBatched does not retry permanently unprocessed requests forever', async () => {
        const queue = new RequestQueue({ id: 'unprocessed-requests', client: storageClient });
        const mockAddRequests = vitest.spyOn(queue.client, 'batchAddRequests');

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

        // Must not hang: it gives up after a bounded number of attempts and warns about the skipped requests.
        expect(result.addedRequests).toHaveLength(0);
        expect(logWarningSpy).toHaveBeenCalled();
        expect(mockAddRequests.mock.calls.length).toBeLessThan(20);
    });

    test('addRequestsBatched does not re-submit already enqueued requests beyond the initial batch (#3120)', async () => {
        const queue = new RequestQueue({ id: 'dedup-across-batches', client: storageClient });
        const mockAddRequests = vitest.spyOn(queue.client, 'batchAddRequests');

        // Fake platform: deduplicates server-side by `uniqueKey` and counts every submitted request as a write.
        const serverSeen = new Set<string>();
        let submittedCount = 0;
        mockAddRequests.mockImplementation(async (requests) => {
            submittedCount += requests.length;
            return {
                processedRequests: requests.map((r) => {
                    const wasAlreadyPresent = serverSeen.has(r.uniqueKey);
                    serverSeen.add(r.uniqueKey);
                    return {
                        requestId: `id-${r.uniqueKey}`,
                        uniqueKey: r.uniqueKey,
                        wasAlreadyPresent,
                        wasAlreadyHandled: false,
                    };
                }),
                unprocessedRequests: [],
            };
        });

        // More requests than a single batch, so the tail is added in background batches (the buggy path).
        const urls = Array.from({ length: 5 }, (_, i) => ({ url: `http://example.com/page-${i}` }));
        const options = { batchSize: 2, waitBetweenBatchesMillis: 0, waitForAllRequestsToBeAdded: true };

        // First pass: every request is new, so all are submitted once.
        await queue.addRequestsBatched(urls, options);
        expect(submittedCount).toBe(5);
        // The heavy `requestCache` still only remembers the first batch; the background batches are
        // deduplicated by the lightweight cache instead.
        expect(queue['requestCache'].length()).toBe(2);

        // Second pass with the same URLs: everything is already enqueued, so nothing is re-submitted.
        // Before the fix, the 3 requests outside the first batch would be sent again (submittedCount === 8).
        await queue.addRequestsBatched(urls, options);
        expect(submittedCount).toBe(5);
    });

    test('fetchNextRequest order respects forefront enqueues', async () => {
        const queue = await createRequestQueue('forefront-order');

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

    test('isEmpty() reflects fetchable requests while isFinished() accounts for in-progress ones', async () => {
        const queue = await createRequestQueue();

        await queue.addRequest({ url: 'http://example.com/a' });
        // There is a pending request, so the queue is neither empty nor finished.
        expect(await queue.isEmpty()).toBe(false);
        expect(await queue.isFinished()).toBe(false);

        const fetched = await queue.fetchNextRequest();
        // The request is now in progress (locked), not handled. There is nothing left to fetch, so the
        // queue is empty — but it is not finished, since the in-progress request might still be
        // reclaimed. That "not finished" signal keeps a crawler running while the request is processed.
        expect(await queue.isEmpty()).toBe(true);
        expect(await queue.isFinished()).toBe(false);

        await queue.markRequestAsHandled(fetched!);
        // Now the request is handled and gone, so the queue is both empty and finished.
        expect(await queue.isEmpty()).toBe(true);
        expect(await queue.isFinished()).toBe(true);
    });

    test('should accept plain object in addRequest()', async () => {
        const queue = await createRequestQueue();

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
        const queue = await createRequestQueue('id');
        const getMock = vitest.spyOn(queue.client, 'getMetadata');
        getMock.mockResolvedValueOnce({
            handledRequestCount: 33,
        } as never);
        const count = await queue.getHandledCount();
        expect(count).toBe(33);
        expect(getMock).toHaveBeenCalledTimes(1);
        expect(getMock).toHaveBeenLastCalledWith();
    });

    test('getInfo() should work', async () => {
        const queue = await createRequestQueue('some-id', 'some-name');

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

        const getMock = vitest.spyOn(queue.client, 'getMetadata').mockResolvedValueOnce(expected);

        const result = await queue.getInfo();
        expect(result).toEqual(expected);
        expect(getMock).toHaveBeenCalledTimes(1);
        expect(getMock).toHaveBeenLastCalledWith();
    });

    test('drop() works', async () => {
        const queue = await createRequestQueue('some-id', 'some-name');
        const dropMock = vitest.spyOn(queue.client, 'drop').mockResolvedValueOnce(undefined);

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
            const queue = await createRequestQueue();
            const spy = vitest.spyOn(queue.client, 'setExpectedRequestProcessingTimeSecs');

            // First hint is forwarded.
            queue.setExpectedRequestProcessingTimeSecs(60);
            expect(spy).toHaveBeenLastCalledWith(60);

            // A larger hint is forwarded.
            queue.setExpectedRequestProcessingTimeSecs(120);
            expect(spy).toHaveBeenLastCalledWith(120);

            // A smaller (or equal) hint must not shorten the reservation, so it is not forwarded.
            queue.setExpectedRequestProcessingTimeSecs(30);
            queue.setExpectedRequestProcessingTimeSecs(120);
            expect(spy).toHaveBeenCalledTimes(2);
        });
    });
});

describe('RequestQueue with requestsFromUrl', () => {
    const emulator = new MemoryStorageEmulator();

    beforeEach(async () => {
        await emulator.init();
        vitest.restoreAllMocks();
    });

    afterAll(async () => {
        await emulator.destroy();
    });

    test('should correctly load list from hosted files in correct order', async () => {
        const spy = vitest.spyOn(RequestQueue.prototype as any, '_downloadListOfUrls');
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
        const spy = vitest.spyOn(RequestQueue.prototype as any, '_downloadListOfUrls');
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

        const spy = vitest.spyOn(RequestQueue.prototype as any, '_downloadListOfUrls');
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
        expect(await queue.isFinished()).toBe(true);
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
