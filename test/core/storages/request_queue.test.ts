/* eslint-disable dot-notation */

import {
    QUERY_HEAD_MIN_LENGTH,
    API_PROCESSED_REQUESTS_DELAY_MILLIS,
    STORAGE_CONSISTENCY_DELAY_MILLIS,
    RequestQueueV1 as RequestQueue,
    RequestQueueV2,
    Request,
    Configuration,
    ProxyConfiguration,
} from '@crawlee/core';
import { sleep } from '@crawlee/utils';
import type { gotScraping } from '@crawlee/utils';
import type { MockedFunction } from 'vitest';

import { MemoryStorageEmulator } from '../../shared/MemoryStorageEmulator';

vitest.mock('@crawlee/utils/src/internals/gotScraping', async () => {
    return {
        gotScraping: vitest.fn(),
    };
});

let gotScrapingSpy: MockedFunction<typeof gotScraping>;

beforeAll(async () => {
    // @ts-ignore for some reason, this fails when the project is not built :/
    const { gotScraping } = await import('@crawlee/utils');
    gotScrapingSpy = vitest.mocked(gotScraping);
});

describe('RequestQueue remote', () => {
    const storageClient = Configuration.getStorageClient();

    beforeEach(() => {
        vitest.clearAllMocks();
    });

    test('should work', async () => {
        const queue = new RequestQueue({ id: 'some-id', client: storageClient });
        const firstResolveValue = {
            requestId: 'a',
            wasAlreadyHandled: false,
            wasAlreadyPresent: false,
        };
        const mockAddRequest = vitest.spyOn(queue.client, 'addRequest').mockResolvedValueOnce(firstResolveValue);

        const requestOptions = { url: 'http://example.com/a' };
        const queueOperationInfo1 = await queue.addRequest(requestOptions);
        const requestA = new Request(requestOptions);
        expect(queueOperationInfo1).toMatchObject({
            ...firstResolveValue,
        });

        expect(queue['queueHeadIds'].length()).toBe(1);
        expect(mockAddRequest).toBeCalledTimes(1);
        expect(mockAddRequest).toBeCalledWith(requestA, { forefront: false });

        // Try to add again a request with the same URL
        const queueOperationInfo2 = await queue.addRequest(requestOptions);
        expect(queueOperationInfo2).toMatchObject({
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
            requestId: 'a',
        });

        expect(queue['queueHeadIds'].length()).toBe(1);

        const requestB = new Request({ url: 'http://example.com/b' });
        const secondResolveValue = {
            requestId: 'b',
            wasAlreadyHandled: false,
            wasAlreadyPresent: false,
        };
        mockAddRequest.mockResolvedValueOnce(secondResolveValue);

        await queue.addRequest(requestB, { forefront: true });
        expect(mockAddRequest).toBeCalledTimes(2);
        expect(mockAddRequest).toHaveBeenLastCalledWith(requestB, { forefront: true });

        expect(queue['queueHeadIds'].length()).toBe(2);
        expect(queue.inProgressCount()).toBe(0);

        // Forefronted request was added to the queue.
        const mockGetRequest = vitest.spyOn(queue.client, 'getRequest');
        mockGetRequest.mockResolvedValueOnce({ ...requestB, id: 'b' });

        const requestBFromQueue = await queue.fetchNextRequest();
        expect(mockGetRequest).toBeCalledTimes(1);
        expect(mockGetRequest).toHaveBeenLastCalledWith('b');
        expect(requestBFromQueue).toEqual({ ...requestB, id: 'b' });

        expect(queue['queueHeadIds'].length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);

        // Test validations
        await queue
            .addRequest(new Request({ id: 'id-already-set', url: 'https://example.com' }))
            .catch((err) =>
                expect(err.message).toMatch(
                    'Expected property `id` to be of type `undefined` but received type `string` in object',
                ),
            );

        // getRequest() returns undefined if object was not found.
        mockGetRequest.mockResolvedValueOnce(undefined);

        const requestXFromQueue = await queue.getRequest('non-existent');
        expect(mockGetRequest).toBeCalledTimes(2);
        expect(mockGetRequest).toHaveBeenLastCalledWith('non-existent');
        expect(requestXFromQueue).toBe(null);

        // Reclaim it.
        const mockUpdateRequest = vitest.spyOn(queue.client, 'updateRequest');
        mockUpdateRequest.mockResolvedValueOnce({
            requestId: 'b',
            wasAlreadyHandled: false,
            wasAlreadyPresent: true,
            // TODO: request is not defined in the types
            // @ts-expect-error
            request: requestBFromQueue,
        });

        await queue.reclaimRequest(requestBFromQueue!, { forefront: true });
        expect(mockUpdateRequest).toBeCalledTimes(1);
        expect(mockUpdateRequest).toHaveBeenLastCalledWith(requestBFromQueue, { forefront: true });

        expect(queue['queueHeadIds'].length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);
        await sleep(STORAGE_CONSISTENCY_DELAY_MILLIS + 10);

        expect(queue['queueHeadIds'].length()).toBe(2);
        expect(queue.inProgressCount()).toBe(0);

        // Fetch again.
        mockGetRequest.mockResolvedValueOnce(requestBFromQueue as never);

        const requestBFromQueue2 = await queue.fetchNextRequest();
        expect(mockGetRequest).toBeCalledTimes(3);
        expect(mockGetRequest).toHaveBeenLastCalledWith('b');
        expect(requestBFromQueue2).toEqual(requestBFromQueue);

        expect(queue['queueHeadIds'].length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);

        // Mark handled.
        mockUpdateRequest.mockResolvedValueOnce({
            requestId: 'b',
            wasAlreadyHandled: false,
            wasAlreadyPresent: true,
            // TODO: request is not defined in the types
            // @ts-expect-error
            request: requestBFromQueue,
        });

        await queue.markRequestHandled(requestBFromQueue!);
        expect(mockUpdateRequest).toBeCalledTimes(2);
        expect(mockUpdateRequest).toHaveBeenLastCalledWith(requestBFromQueue);

        expect(queue['queueHeadIds'].length()).toBe(1);
        expect(queue.inProgressCount()).toBe(0);

        // Emulate there are no cached items in queue

        queue['queueHeadIds'].clear();

        // Query queue head.
        const mockListHead = vitest.spyOn(queue.client, 'listHead');
        mockListHead.mockResolvedValueOnce({
            items: [
                { id: 'a', uniqueKey: 'aaa' },
                { id: 'c', uniqueKey: 'ccc' },
            ],
        } as never);
        mockGetRequest.mockResolvedValueOnce({ ...requestA, id: 'a' });

        const requestAFromQueue = await queue.fetchNextRequest();
        expect(mockGetRequest).toBeCalledTimes(4);
        expect(mockGetRequest).toHaveBeenLastCalledWith('a');
        expect(mockListHead).toBeCalledTimes(1);
        expect(mockListHead).toHaveBeenLastCalledWith({ limit: QUERY_HEAD_MIN_LENGTH });
        expect(requestAFromQueue).toEqual({ ...requestA, id: 'a' });

        expect(queue['queueHeadIds'].length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);

        // Drop queue.
        const mockDelete = vitest.spyOn(queue.client, 'delete');
        mockDelete.mockResolvedValueOnce(undefined);

        await queue.drop();
        expect(mockDelete).toBeCalledTimes(1);
        expect(mockDelete).toHaveBeenLastCalledWith();
    });

    test('addRequests', async () => {
        const queue = new RequestQueue({ id: 'batch-requests', client: storageClient });
        const mockAddRequests = vitest.spyOn(queue.client, 'batchAddRequests');

        const requestOptions = { url: 'http://example.com/a' };
        const requestA = new Request(requestOptions);

        // Test adding 1 request
        const firstRequestAdded = {
            requestId: 'a',
            wasAlreadyHandled: false,
            wasAlreadyPresent: false,
            uniqueKey: requestA.uniqueKey,
        };
        mockAddRequests.mockResolvedValueOnce({
            processedRequests: [firstRequestAdded],
            unprocessedRequests: [],
        });

        const addRequestsResult1 = await queue.addRequests([requestOptions]);

        expect(addRequestsResult1.processedRequests).toHaveLength(1);
        expect(addRequestsResult1.processedRequests[0]).toEqual({
            ...firstRequestAdded,
        });

        // Ensure the client method was actually called, and added

        expect(queue['queueHeadIds'].length()).toBe(1);
        expect(mockAddRequests).toBeCalledTimes(1);
        expect(mockAddRequests).toBeCalledWith([requestA], { forefront: false });

        // Try to add a request with the same URL again, expecting cached
        const addRequestsResult2 = await queue.addRequests([requestOptions]);
        expect(addRequestsResult2.processedRequests).toHaveLength(1);
        expect(addRequestsResult2.processedRequests[0]).toEqual({
            ...firstRequestAdded,
            wasAlreadyPresent: true,
        });

        expect(queue['queueHeadIds'].length()).toBe(1);

        // Adding more requests, forefront
        const requestB = new Request({ url: 'http://example.com/b' });
        const requestC = new Request({ url: 'http://example.com/c' });

        mockAddRequests.mockResolvedValueOnce({
            processedRequests: [
                {
                    requestId: 'b',
                    uniqueKey: requestB.uniqueKey,
                    wasAlreadyHandled: false,
                    wasAlreadyPresent: false,
                },
                {
                    requestId: 'c',
                    uniqueKey: requestC.uniqueKey,
                    wasAlreadyHandled: false,
                    wasAlreadyPresent: false,
                },
            ],
            unprocessedRequests: [],
        });

        const addRequestsResult3 = await queue.addRequests([requestB, requestC], { forefront: true });
        expect(addRequestsResult3.processedRequests).toHaveLength(2);
        expect(addRequestsResult3.processedRequests[0]).toEqual({
            requestId: 'b',
            uniqueKey: requestB.uniqueKey,
            wasAlreadyHandled: false,
            wasAlreadyPresent: false,
        });
        expect(addRequestsResult3.processedRequests[1]).toEqual({
            requestId: 'c',
            uniqueKey: requestC.uniqueKey,
            wasAlreadyHandled: false,
            wasAlreadyPresent: false,
        });

        expect(queue['queueHeadIds'].length()).toBe(3);
        expect(mockAddRequests).toHaveBeenCalled();
        expect(mockAddRequests).toBeCalledWith([requestB, requestC], { forefront: true });
    });

    test('should cache new requests locally', async () => {
        const queue = new RequestQueue({ id: 'some-id', client: storageClient });

        const requestA = new Request({ url: 'http://example.com/a' });
        const requestB = new Request({ url: 'http://example.com/a' }); // Has same uniqueKey as A

        // Add request A
        const addRequestMock = vitest.spyOn(queue.client, 'addRequest');
        addRequestMock.mockResolvedValueOnce({
            requestId: 'a',
            wasAlreadyHandled: false,
            wasAlreadyPresent: false,
        });

        await queue.addRequest(requestA);
        expect(addRequestMock).toBeCalledTimes(1);
        expect(addRequestMock).toHaveBeenLastCalledWith(requestA, { forefront: false });

        // Add request B that has same unique so that addRequest() is not called because it's already cached.
        // mock.expects('addRequest').never();
        const queueOperationInfo = await queue.addRequest(requestB);
        expect(addRequestMock).toBeCalledTimes(1);
        expect(queueOperationInfo).toEqual({
            requestId: 'a',
            uniqueKey: requestA.uniqueKey,
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
            forefront: false,
        });
    });

    test('should cache requests locally with info if request was already handled', async () => {
        const queue = new RequestQueue({ id: 'some-id', client: storageClient });

        const requestX = new Request({ url: 'http://example.com/x' });
        const requestY = new Request({ url: 'http://example.com/x' }); // Has same uniqueKey as X

        // Add request X.
        const addRequestMock = vitest.spyOn(queue.client, 'addRequest');
        addRequestMock.mockResolvedValueOnce({
            requestId: 'x',
            wasAlreadyHandled: true,
            wasAlreadyPresent: true,
        });

        await queue.addRequest(requestX);
        expect(addRequestMock).toBeCalledTimes(1);
        expect(addRequestMock).toHaveBeenLastCalledWith(requestX, { forefront: false });

        // Add request Y that has same unique so that addRequest() is not called because it's already cached.
        // mock.expects('addRequest').never();
        const queueOperationInfo = await queue.addRequest(requestY);
        expect(addRequestMock).toBeCalledTimes(1);
        expect(queueOperationInfo).toEqual({
            requestId: 'x',
            uniqueKey: requestX.uniqueKey,
            wasAlreadyPresent: true,
            wasAlreadyHandled: true,
            forefront: false,
        });
    });

    test('should cache requests from queue head', async () => {
        const queue = new RequestQueue({ id: 'some-id', client: storageClient });

        // Query queue head with request A
        const listHeadMock = vitest.spyOn(queue.client, 'listHead');
        listHeadMock.mockResolvedValueOnce({
            items: [{ id: 'a', uniqueKey: 'aaa' }],
        } as never);

        expect(await queue.isEmpty()).toBe(false);
        expect(listHeadMock).toBeCalledTimes(1);
        expect(listHeadMock).toHaveBeenLastCalledWith({ limit: QUERY_HEAD_MIN_LENGTH });

        // Add request A and addRequest is not called because was already cached.
        const requestA = new Request({ url: 'http://example.com/a', uniqueKey: 'aaa' });
        const addRequestMock = vitest.spyOn(queue.client, 'addRequest');

        const queueOperationInfo = await queue.addRequest(requestA);
        expect(addRequestMock).toBeCalledTimes(0);
        expect(queueOperationInfo).toEqual({
            requestId: 'a',
            uniqueKey: 'aaa',
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
            forefront: false,
        });
    });

    test('should handle situation when newly created request is not available yet', async () => {
        const queue = new RequestQueue({ id: 'some-id', name: 'some-queue', client: storageClient });
        const listHeadMock = vitest.spyOn(queue.client, 'listHead');

        const requestA = new Request({ url: 'http://example.com/a' });

        // Add request A
        const addRequestMock = vitest.spyOn(queue.client, 'addRequest');
        addRequestMock.mockResolvedValueOnce({
            requestId: 'a',
            wasAlreadyHandled: false,
            wasAlreadyPresent: false,
        });

        await queue.addRequest(requestA, { forefront: true });
        expect(addRequestMock).toBeCalledTimes(1);
        expect(addRequestMock).toHaveBeenLastCalledWith(requestA, { forefront: true });

        expect(queue['queueHeadIds'].length()).toBe(1);

        // Try to get requestA which is not available yet.
        const getRequestMock = vitest.spyOn(queue.client, 'getRequest');
        getRequestMock.mockResolvedValueOnce(undefined);

        const fetchedRequest = await queue.fetchNextRequest();
        expect(getRequestMock).toBeCalledTimes(1);
        expect(getRequestMock).toHaveBeenLastCalledWith('a');
        expect(fetchedRequest).toBe(null);

        // Give queue time to mark request 'a' as not in progress
        await sleep(STORAGE_CONSISTENCY_DELAY_MILLIS + 10);
        expect(listHeadMock).not.toBeCalled();

        // Should try it once again (the queue head is queried again)
        getRequestMock.mockResolvedValueOnce({
            ...requestA,
            id: 'a',
        });

        listHeadMock.mockResolvedValueOnce({
            items: [{ id: 'a', uniqueKey: 'aaa' }],
        } as never);

        const fetchedRequest2 = await queue.fetchNextRequest();
        expect(getRequestMock).toBeCalledTimes(2);
        expect(getRequestMock).toHaveBeenLastCalledWith('a');
        expect(listHeadMock).toBeCalledTimes(1);
        expect(listHeadMock).toHaveBeenLastCalledWith({ limit: QUERY_HEAD_MIN_LENGTH });
        expect(fetchedRequest2).toEqual({ ...requestA, id: 'a' });
    });

    test('should not add handled request to queue head dict', async () => {
        const queue = new RequestQueue({ id: 'some-id', client: storageClient });

        const requestA = new Request({ url: 'http://example.com/a' });

        const addRequestMock = vitest.spyOn(queue.client, 'addRequest');
        addRequestMock.mockResolvedValueOnce({
            requestId: 'a',
            wasAlreadyHandled: true,
            wasAlreadyPresent: true,
        });

        const getRequestMock = vitest.spyOn(queue.client, 'getRequest');

        const listHeadMock = vitest.spyOn(queue.client, 'listHead');
        listHeadMock.mockResolvedValueOnce({
            items: [],
        } as never);

        await queue.addRequest(requestA, { forefront: true });
        expect(addRequestMock).toBeCalledTimes(1);
        expect(addRequestMock).toHaveBeenLastCalledWith(requestA, { forefront: true });

        const fetchedRequest = await queue.fetchNextRequest();
        expect(getRequestMock).not.toBeCalled();
        expect(listHeadMock).toBeCalledTimes(1);
        expect(listHeadMock).toHaveBeenLastCalledWith({ limit: QUERY_HEAD_MIN_LENGTH });
        expect(fetchedRequest).toBe(null);
    });

    test('should accept plain object in addRequest()', async () => {
        const queue = new RequestQueue({ id: 'some-id', client: storageClient });
        const addRequestMock = vitest.spyOn(queue.client, 'addRequest');
        addRequestMock.mockResolvedValueOnce({
            requestId: 'xxx',
            wasAlreadyHandled: false,
            wasAlreadyPresent: false,
        });

        const requestOpts = { url: 'http://example.com/a' };
        await queue.addRequest(requestOpts);
        expect(addRequestMock).toBeCalledTimes(1);
        expect(addRequestMock).toHaveBeenLastCalledWith(new Request(requestOpts), { forefront: false });
    });

    test('should return correct handledCount', async () => {
        const queue = new RequestQueue({ id: 'id', client: storageClient });
        const getMock = vitest.spyOn(queue.client, 'get');
        getMock.mockResolvedValueOnce({
            handledRequestCount: 33,
        } as never);
        const count = await queue.handledCount();
        expect(count).toBe(33);
        expect(getMock).toBeCalledTimes(1);
        expect(getMock).toHaveBeenLastCalledWith();
    });

    test('should always wait for a queue head to become consistent before marking queue as finished (hadMultipleClients = true)', async () => {
        const queue = new RequestQueue({ id: 'some-id', name: 'some-name', client: storageClient });

        // Return head with modifiedAt = now so it will retry the call.
        const listHeadMock = vitest.spyOn(queue.client, 'listHead');
        listHeadMock.mockResolvedValueOnce({
            limit: 5,
            queueModifiedAt: new Date(Date.now() - API_PROCESSED_REQUESTS_DELAY_MILLIS * 0.75),
            items: [],
            hadMultipleClients: true,
        });
        listHeadMock.mockResolvedValueOnce({
            limit: 5,
            queueModifiedAt: new Date(Date.now() - API_PROCESSED_REQUESTS_DELAY_MILLIS),
            items: [],
            hadMultipleClients: true,
        });

        const isFinished = await queue.isFinished();
        expect(isFinished).toBe(true);
        expect(listHeadMock).toBeCalledTimes(2);
        expect(listHeadMock).toHaveBeenNthCalledWith(1, { limit: QUERY_HEAD_MIN_LENGTH });
        expect(listHeadMock).toHaveBeenNthCalledWith(2, { limit: QUERY_HEAD_MIN_LENGTH });
    });

    test('should always wait for a queue head to become consistent before marking queue as finished (hadMultipleClients = false)', async () => {
        const queueId = 'some-id';
        const queue = new RequestQueue({ id: queueId, name: 'some-name', client: storageClient });

        expect(queue.assumedTotalCount).toBe(0);
        expect(queue.assumedHandledCount).toBe(0);

        // Add some requests.
        const requestA = new Request({ url: 'http://example.com/a' });
        const requestAWithId = { ...requestA, id: 'a' } as Request;
        const requestB = new Request({ url: 'http://example.com/b' });
        const requestBWithId = { ...requestB, id: 'b' } as Request;
        const addRequestMock = vitest.spyOn(queue.client, 'addRequest');
        addRequestMock.mockResolvedValueOnce({ requestId: 'a', wasAlreadyHandled: false, wasAlreadyPresent: false });
        addRequestMock.mockResolvedValueOnce({ requestId: 'b', wasAlreadyHandled: false, wasAlreadyPresent: false });

        await queue.addRequest(requestA, { forefront: true });
        await queue.addRequest(requestB, { forefront: true });

        expect(queue['queueHeadIds'].length()).toBe(2);
        expect(queue.inProgressCount()).toBe(0);
        expect(queue.assumedTotalCount).toBe(2);
        expect(queue.assumedHandledCount).toBe(0);
        expect(addRequestMock).toBeCalledTimes(2);
        expect(addRequestMock).toHaveBeenNthCalledWith(1, requestA, { forefront: true });
        expect(addRequestMock).toHaveBeenNthCalledWith(2, requestB, { forefront: true });

        // It won't query the head as there is something in progress or pending.
        const listHeadMock = vitest.spyOn(queue.client, 'listHead');

        const isFinished = await queue.isFinished();
        expect(isFinished).toBe(false);
        expect(listHeadMock).not.toBeCalled();

        // Fetch them from queue.
        const getRequestMock = vitest.spyOn(queue.client, 'getRequest');
        getRequestMock.mockResolvedValueOnce({ ...requestB, id: 'b' });
        getRequestMock.mockResolvedValueOnce({ ...requestA, id: 'a' });

        const requestBFromQueue = await queue.fetchNextRequest();
        expect(requestBFromQueue).toEqual(requestBWithId);
        expect(getRequestMock).toBeCalledTimes(1);
        expect(getRequestMock).toHaveBeenLastCalledWith('b');
        const requestAFromQueue = await queue.fetchNextRequest();
        expect(requestAFromQueue).toEqual(requestAWithId);
        expect(getRequestMock).toBeCalledTimes(2);
        expect(getRequestMock).toHaveBeenLastCalledWith('a');

        expect(queue['queueHeadIds'].length()).toBe(0);
        expect(queue.inProgressCount()).toBe(2);
        expect(queue.assumedTotalCount).toBe(2);
        expect(queue.assumedHandledCount).toBe(0);

        // It won't query the head as there is something in progress or pending.
        expect(await queue.isFinished()).toBe(false);
        expect(listHeadMock).not.toBeCalled();

        // Reclaim one and mark another one handled.
        const updateRequestMock = vitest.spyOn(queue.client, 'updateRequest');
        updateRequestMock.mockResolvedValueOnce({ requestId: 'b', wasAlreadyHandled: false, wasAlreadyPresent: true });

        await queue.markRequestHandled(requestBWithId);
        expect(updateRequestMock).toBeCalledTimes(1);
        expect(updateRequestMock).toHaveBeenLastCalledWith(requestBWithId);

        updateRequestMock.mockResolvedValueOnce({ requestId: 'a', wasAlreadyHandled: false, wasAlreadyPresent: true });

        await queue.reclaimRequest(requestAWithId, { forefront: true });
        expect(updateRequestMock).toBeCalledTimes(2);
        expect(updateRequestMock).toHaveBeenLastCalledWith(requestAWithId, { forefront: true });

        expect(queue['queueHeadIds'].length()).toBe(0);
        expect(queue.inProgressCount()).toBe(1);
        expect(queue.assumedTotalCount).toBe(2);
        expect(queue.assumedHandledCount).toBe(1);
        await sleep(STORAGE_CONSISTENCY_DELAY_MILLIS + 10);

        expect(queue['queueHeadIds'].length()).toBe(1);
        expect(queue.inProgressCount()).toBe(0);
        expect(queue.assumedTotalCount).toBe(2);
        expect(queue.assumedHandledCount).toBe(1);

        // It won't query the head as there is something in progress or pending.
        expect(await queue.isFinished()).toBe(false);
        expect(listHeadMock).not.toBeCalled();

        // Fetch again.
        // @ts-expect-error Argument of type 'Request' is not assignable to parameter of type
        // 'RequestQueueClientGetRequestResult | Promise<RequestQueueClientGetRequestResult>'.
        getRequestMock.mockResolvedValueOnce(requestAWithId);

        const requestAFromQueue2 = await queue.fetchNextRequest();
        expect(requestAFromQueue2).toEqual(requestAWithId);
        expect(getRequestMock).toBeCalledTimes(3);
        expect(getRequestMock).toHaveBeenLastCalledWith('a');

        expect(queue['queueHeadIds'].length()).toBe(0);
        expect(queue.inProgressCount()).toBe(1);
        expect(queue.assumedTotalCount).toBe(2);
        expect(queue.assumedHandledCount).toBe(1);

        // It won't query the head as there is something in progress or pending.
        expect(await queue.isFinished()).toBe(false);
        expect(listHeadMock).not.toBeCalled();

        // Mark handled.
        updateRequestMock.mockResolvedValueOnce({ requestId: 'a', wasAlreadyHandled: false, wasAlreadyPresent: true });

        await queue.markRequestHandled(requestAWithId);
        expect(updateRequestMock).toBeCalledTimes(3);
        expect(updateRequestMock).toHaveBeenLastCalledWith(requestAWithId);

        expect(queue['queueHeadIds'].length()).toBe(0);
        expect(queue.inProgressCount()).toBe(0);
        expect(queue.assumedTotalCount).toBe(2);
        expect(queue.assumedHandledCount).toBe(2);

        // Return head with modifiedAt = now so it would retry the query for queue to become consistent but because hadMultipleClients=true
        // it will finish immediately.
        listHeadMock.mockResolvedValueOnce({
            limit: 5,
            queueModifiedAt: new Date(),
            items: [],
            hadMultipleClients: false,
        });

        expect(await queue.isFinished()).toBe(true);
        expect(listHeadMock).toBeCalledTimes(1);
        expect(listHeadMock).toHaveBeenLastCalledWith({ limit: QUERY_HEAD_MIN_LENGTH });
    });

    test('`fetchNextRequest` order respects `forefront` enqueues', async () => {
        const emulator = new MemoryStorageEmulator();

        await emulator.init();
        const queue = await RequestQueue.open();

        const retrievedUrls: string[] = [];

        await queue.addRequests([
            { url: 'http://example.com/1' },
            { url: 'http://example.com/5' },
            { url: 'http://example.com/6' },
        ]);

        retrievedUrls.push((await queue.fetchNextRequest())!.url);

        await queue.addRequest({ url: 'http://example.com/4' }, { forefront: true });
        await queue.addRequest({ url: 'http://example.com/3' }, { forefront: true });

        await queue.addRequest({ url: 'http://example.com/2' }, { forefront: true });

        let req = await queue.fetchNextRequest();

        expect(req!.url).toBe('http://example.com/2');

        await queue.reclaimRequest(req!, { forefront: true });

        while (req) {
            retrievedUrls.push(req!.url);
            req = await queue.fetchNextRequest();
        }

        expect(retrievedUrls.map((x) => new URL(x).pathname)).toEqual(['/1', '/2', '/3', '/4', '/5', '/6']);
        await emulator.destroy();
    });

    test('getInfo() should work', async () => {
        const queue = new RequestQueue({ id: 'some-id', name: 'some-name', client: storageClient });

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

        const getMock = vitest.spyOn(queue.client, 'get').mockResolvedValueOnce(expected);

        const result = await queue.getInfo();
        expect(result).toEqual(expected);
        expect(getMock).toBeCalledTimes(1);
        expect(getMock).toHaveBeenLastCalledWith();
    });

    test('drop() works', async () => {
        const queue = new RequestQueue({ id: 'some-id', name: 'some-name', client: storageClient });
        const deleteMock = vitest.spyOn(queue.client, 'delete').mockResolvedValueOnce(undefined);

        await queue.drop();
        expect(deleteMock).toBeCalledTimes(1);
        expect(deleteMock).toHaveBeenLastCalledWith();
    });

    test('Request.userData.__crawlee internal object is non-enumerable and always defined', async () => {
        const url = 'http://example.com';
        const method = 'POST';
        const r1 = new Request({
            url,
            method,
            userData: { __crawlee: { skipNavigation: true, maxRetries: 10, foo: 123, bar: true } },
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
        r1.maxRetries = 5;
        expect(r1.userData.__crawlee).toMatchObject({ skipNavigation: true, maxRetries: 5, foo: 123, bar: true });
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
        spy.mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve(list1) as any, 100)) as any);
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

        expect(spy).toBeCalledTimes(2);
        expect(spy).toBeCalledWith({ url: 'http://example.com/list-1', urlRegExp: undefined });
        expect(spy).toBeCalledWith({ url: 'http://example.com/list-2', urlRegExp: undefined });
    });

    test('should use regex parameter to parse urls', async () => {
        const listStr = 'kjnjkn"https://example.com/a/b/c?q=1#abc";,"HTTP://google.com/a/b/c";dgg:dd';
        const listArr = ['https://example.com', 'HTTP://google.com'];
        gotScrapingSpy.mockResolvedValue({ body: listStr } as any);

        const regex = /(https:\/\/example.com|HTTP:\/\/google.com)/g;
        const queue = await RequestQueue.open();
        await queue.addRequest({
            method: 'GET',
            requestsFromUrl: 'http://example.com/list-1',
            regex,
        });

        expect(await queue.fetchNextRequest()).toMatchObject({ method: 'GET', url: listArr[0] });
        expect(await queue.fetchNextRequest()).toMatchObject({ method: 'GET', url: listArr[1] });
        await queue.drop();

        expect(gotScrapingSpy).toBeCalledWith({ url: 'http://example.com/list-1', encoding: 'utf8' });
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

        gotScrapingSpy.mockResolvedValue({ body: JSON.stringify(list) } as any);

        const queue = await RequestQueue.open();
        await queue.addRequests(wrongUrls.map((requestsFromUrl) => ({ requestsFromUrl })));

        expect(await queue.fetchNextRequest()).toMatchObject({ method: 'GET', url: list[0] });
        expect(await queue.fetchNextRequest()).toMatchObject({ method: 'GET', url: list[1] });
        expect(await queue.fetchNextRequest()).toMatchObject({ method: 'GET', url: list[2] });

        expect(gotScrapingSpy).toBeCalledWith({ url: correctUrl, encoding: 'utf8' });
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

        expect(spy).toBeCalledTimes(1);
        expect(spy).toBeCalledWith({ url: 'http://example.com/list-1', urlRegExp: undefined });
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

        expect(spy).not.toBeCalledWith(expect.not.objectContaining({ proxyUrl: expect.any(String) }));
    });
});

describe('RequestQueue v2', () => {
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
        const queue = await RequestQueueV2.open(name);
        await queue.drop();
        return RequestQueueV2.open(name);
    }

    function getUniqueRequests(count: number) {
        return new Array(count)
            .fill(0)
            .map((_, i) => new Request({ url: `http://example.com/${i}`, uniqueKey: String(i) }));
    }

    test('listAndLockHead works as expected', async () => {
        const queue = await getEmptyQueue('list-and-lock-head');
        await queue.addRequests(getUniqueRequests(totalRequestsPerTest));

        const [{ items: firstFetch }, { items: secondFetch }] = await Promise.all([
            queue.client.listAndLockHead({ limit: totalRequestsPerTest / 2, lockSecs: 60 }),
            queue.client.listAndLockHead({ limit: totalRequestsPerTest / 2, lockSecs: 60 }),
        ]);

        const histogram = calculateHistogram([...firstFetch, ...secondFetch]);
        expect(histogram).toEqual(Array(totalRequestsPerTest).fill(1));
    });

    test('lock timers work as expected (timeout unlocks)', async () => {
        vitest.useFakeTimers();
        const queue = await getEmptyQueue('lock-timers');
        await queue.addRequests(getUniqueRequests(totalRequestsPerTest));

        const { items: firstFetch } = await queue.client.listAndLockHead({
            limit: totalRequestsPerTest / 2,
            lockSecs: 60,
        });

        vitest.advanceTimersByTime(65000);

        const { items: secondFetch } = await queue.client.listAndLockHead({
            limit: totalRequestsPerTest / 2,
            lockSecs: 60,
        });

        const histogram = calculateHistogram([...firstFetch, ...secondFetch]);
        expect(histogram).toEqual(Array(totalRequestsPerTest / 2).fill(2));
        vitest.useRealTimers();
    });

    test('prolongRequestLock works as expected ', async () => {
        vitest.useFakeTimers();
        const queue = await getEmptyQueue('prolong-request-lock');
        await queue.addRequests(getUniqueRequests(1));

        const { items: firstFetch } = await queue.client.listAndLockHead({ limit: 1, lockSecs: 60 });
        await queue.client.prolongRequestLock(firstFetch[0].id, { lockSecs: 60 });
        expect(firstFetch).toHaveLength(1);

        vitest.advanceTimersByTime(65000);
        const { items: secondFetch } = await queue.client.listAndLockHead({ limit: 1, lockSecs: 60 });
        expect(secondFetch).toHaveLength(0);

        vitest.advanceTimersByTime(65000);
        const { items: thirdFetch } = await queue.client.listAndLockHead({ limit: 1, lockSecs: 60 });

        expect(thirdFetch).toHaveLength(1);
        vitest.useRealTimers();
    });

    test('deleteRequestLock works as expected', async () => {
        const queue = await getEmptyQueue('delete-request-lock');
        await queue.addRequests(getUniqueRequests(1));

        const { items: firstFetch } = await queue.client.listAndLockHead({ limit: 1, lockSecs: 60 });
        await queue.client.deleteRequestLock(firstFetch[0].id);

        const { items: secondFetch } = await queue.client.listAndLockHead({ limit: 1, lockSecs: 60 });

        expect(secondFetch[0]).toEqual(firstFetch[0]);
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
