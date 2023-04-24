import {
    QUERY_HEAD_MIN_LENGTH,
    API_PROCESSED_REQUESTS_DELAY_MILLIS,
    STORAGE_CONSISTENCY_DELAY_MILLIS,
    RequestQueue,
    Request,
    Configuration,
} from '@crawlee/core';
import { sleep } from '@crawlee/utils';

describe('RequestQueue remote', () => {
    const storageClient = Configuration.getStorageClient();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should work', async () => {
        const queue = new RequestQueue({ id: 'some-id', client: storageClient });
        const firstResolveValue = {
            requestId: 'a',
            wasAlreadyHandled: false,
            wasAlreadyPresent: false,
        };
        const mockAddRequest = jest
            .spyOn(queue.client, 'addRequest')
            .mockResolvedValueOnce(firstResolveValue);

        const requestOptions = { url: 'http://example.com/a' };
        const queueOperationInfo1 = await queue.addRequest(requestOptions);
        const requestA = new Request(requestOptions);
        expect(queueOperationInfo1).toMatchObject({
            ...firstResolveValue,
        });
        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(mockAddRequest).toBeCalledTimes(1);
        expect(mockAddRequest).toBeCalledWith(requestA, { forefront: false });

        // Try to add again a request with the same URL
        const queueOperationInfo2 = await queue.addRequest(requestOptions);
        expect(queueOperationInfo2).toMatchObject({
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
            requestId: 'a',
        });
        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(1);

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
        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(2);
        expect(queue.inProgressCount()).toBe(0);

        // Forefronted request was added to the queue.
        const mockGetRequest = jest.spyOn(queue.client, 'getRequest');
        mockGetRequest.mockResolvedValueOnce({ ...requestB, id: 'b' });

        const requestBFromQueue = await queue.fetchNextRequest();
        expect(mockGetRequest).toBeCalledTimes(1);
        expect(mockGetRequest).toHaveBeenLastCalledWith('b');
        expect(requestBFromQueue).toEqual({ ...requestB, id: 'b' });
        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);

        // Test validations
        await queue.markRequestHandled(new Request({ id: 'XXX', url: 'https://example.com' }))
            .catch((err) => expect(err.message).toMatch(/Cannot mark request XXX as handled, because it is not in progress/));
        await queue.reclaimRequest(new Request({ id: 'XXX', url: 'https://example.com' }))
            .catch((err) => expect(err.message).toMatch(/Cannot reclaim request XXX, because it is not in progress/));
        await queue.addRequest(new Request({ id: 'id-already-set', url: 'https://example.com' }))
            .catch((err) => expect(err.message).toMatch(
                'Expected property `id` to be of type `undefined` but received type `string` in object',
            ));

        // getRequest() returns null if object was not found.
        mockGetRequest.mockResolvedValueOnce(null);

        const requestXFromQueue = await queue.getRequest('non-existent');
        expect(mockGetRequest).toBeCalledTimes(2);
        expect(mockGetRequest).toHaveBeenLastCalledWith('non-existent');
        expect(requestXFromQueue).toBe(null);

        // Reclaim it.
        const mockUpdateRequest = jest.spyOn(queue.client, 'updateRequest');
        mockUpdateRequest.mockResolvedValueOnce({
            requestId: 'b',
            wasAlreadyHandled: false,
            wasAlreadyPresent: true,
            // TODO: request is not defined in the types
            // @ts-expect-error
            request: requestBFromQueue,
        });

        await queue.reclaimRequest(requestBFromQueue, { forefront: true });
        expect(mockUpdateRequest).toBeCalledTimes(1);
        expect(mockUpdateRequest).toHaveBeenLastCalledWith(requestBFromQueue, { forefront: true });
        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);
        await sleep(STORAGE_CONSISTENCY_DELAY_MILLIS + 10);
        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(2);
        expect(queue.inProgressCount()).toBe(0);

        // Fetch again.
        mockGetRequest.mockResolvedValueOnce(requestBFromQueue as never);

        const requestBFromQueue2 = await queue.fetchNextRequest();
        expect(mockGetRequest).toBeCalledTimes(3);
        expect(mockGetRequest).toHaveBeenLastCalledWith('b');
        expect(requestBFromQueue2).toEqual(requestBFromQueue);
        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(1);
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

        await queue.markRequestHandled(requestBFromQueue);
        expect(mockUpdateRequest).toBeCalledTimes(2);
        expect(mockUpdateRequest).toHaveBeenLastCalledWith(requestBFromQueue);
        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(0);

        // Emulate there are no cached items in queue
        // @ts-expect-error Accessing private property
        queue.queueHeadDict.clear();

        // Query queue head.
        const mockListHead = jest.spyOn(queue.client, 'listHead');
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
        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);

        // Drop queue.
        const mockDelete = jest.spyOn(queue.client, 'delete');
        mockDelete.mockResolvedValueOnce(undefined);

        await queue.drop();
        expect(mockDelete).toBeCalledTimes(1);
        expect(mockDelete).toHaveBeenLastCalledWith();
    });

    test('addRequests', async () => {
        const queue = new RequestQueue({ id: 'batch-requests', client: storageClient });
        const mockAddRequests = jest.spyOn(queue.client, 'batchAddRequests');

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
        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(mockAddRequests).toBeCalledTimes(1);
        expect(mockAddRequests).toBeCalledWith([requestA], { forefront: false });

        // Try to add a request with the same URL again, expecting cached
        const addRequestsResult2 = await queue.addRequests([requestOptions]);
        expect(addRequestsResult2.processedRequests).toHaveLength(1);
        expect(addRequestsResult2.processedRequests[0]).toEqual({
            ...firstRequestAdded,
            wasAlreadyPresent: true,
        });
        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(1);

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
        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(3);
        expect(mockAddRequests).toHaveBeenCalled();
        expect(mockAddRequests).toBeCalledWith([requestB, requestC], { forefront: true });
    });

    test('should cache new requests locally', async () => {
        const queue = new RequestQueue({ id: 'some-id', client: storageClient });

        const requestA = new Request({ url: 'http://example.com/a' });
        const requestB = new Request({ url: 'http://example.com/a' }); // Has same uniqueKey as A

        // Add request A
        const addRequestMock = jest.spyOn(queue.client, 'addRequest');
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
        });
    });

    test('should cache requests locally with info if request was already handled', async () => {
        const queue = new RequestQueue({ id: 'some-id', client: storageClient });

        const requestX = new Request({ url: 'http://example.com/x' });
        const requestY = new Request({ url: 'http://example.com/x' }); // Has same uniqueKey as X

        // Add request X.
        const addRequestMock = jest.spyOn(queue.client, 'addRequest');
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
        });
    });

    test('should cache requests from queue head', async () => {
        const queue = new RequestQueue({ id: 'some-id', client: storageClient });

        // Query queue head with request A
        const listHeadMock = jest.spyOn(queue.client, 'listHead');
        listHeadMock.mockResolvedValueOnce({
            items: [
                { id: 'a', uniqueKey: 'aaa' },
            ],
        } as never);

        expect(await queue.isEmpty()).toBe(false);
        expect(listHeadMock).toBeCalledTimes(1);
        expect(listHeadMock).toHaveBeenLastCalledWith({ limit: QUERY_HEAD_MIN_LENGTH });

        // Add request A and addRequest is not called because was already cached.
        const requestA = new Request({ url: 'http://example.com/a', uniqueKey: 'aaa' });
        const addRequestMock = jest.spyOn(queue.client, 'addRequest');

        const queueOperationInfo = await queue.addRequest(requestA);
        expect(addRequestMock).toBeCalledTimes(0);
        expect(queueOperationInfo).toEqual({
            requestId: 'a',
            uniqueKey: 'aaa',
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
        });
    });

    test('should handle situation when newly created request is not available yet', async () => {
        const queue = new RequestQueue({ id: 'some-id', name: 'some-queue', client: storageClient });
        const listHeadMock = jest.spyOn(queue.client, 'listHead');

        const requestA = new Request({ url: 'http://example.com/a' });

        // Add request A
        const addRequestMock = jest.spyOn(queue.client, 'addRequest');
        addRequestMock.mockResolvedValueOnce({
            requestId: 'a',
            wasAlreadyHandled: false,
            wasAlreadyPresent: false,
        });

        await queue.addRequest(requestA, { forefront: true });
        expect(addRequestMock).toBeCalledTimes(1);
        expect(addRequestMock).toHaveBeenLastCalledWith(requestA, { forefront: true });
        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(1);

        // Try to get requestA which is not available yet.
        const getRequestMock = jest.spyOn(queue.client, 'getRequest');
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
            items: [
                { id: 'a', uniqueKey: 'aaa' },
            ],
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

        const addRequestMock = jest.spyOn(queue.client, 'addRequest');
        addRequestMock.mockResolvedValueOnce({
            requestId: 'a',
            wasAlreadyHandled: true,
            wasAlreadyPresent: true,
        });

        const getRequestMock = jest.spyOn(queue.client, 'getRequest');

        const listHeadMock = jest.spyOn(queue.client, 'listHead');
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
        const addRequestMock = jest.spyOn(queue.client, 'addRequest');
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
        const getMock = jest.spyOn(queue.client, 'get');
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
        const listHeadMock = jest.spyOn(queue.client, 'listHead');
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
        const addRequestMock = jest.spyOn(queue.client, 'addRequest');
        addRequestMock.mockResolvedValueOnce({ requestId: 'a', wasAlreadyHandled: false, wasAlreadyPresent: false });
        addRequestMock.mockResolvedValueOnce({ requestId: 'b', wasAlreadyHandled: false, wasAlreadyPresent: false });

        await queue.addRequest(requestA, { forefront: true });
        await queue.addRequest(requestB, { forefront: true });

        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(2);
        expect(queue.inProgressCount()).toBe(0);
        expect(queue.assumedTotalCount).toBe(2);
        expect(queue.assumedHandledCount).toBe(0);
        expect(addRequestMock).toBeCalledTimes(2);
        expect(addRequestMock).toHaveBeenNthCalledWith(1, requestA, { forefront: true });
        expect(addRequestMock).toHaveBeenNthCalledWith(2, requestB, { forefront: true });

        // It won't query the head as there is something in progress or pending.
        const listHeadMock = jest.spyOn(queue.client, 'listHead');

        const isFinished = await queue.isFinished();
        expect(isFinished).toBe(false);
        expect(listHeadMock).not.toBeCalled();

        // Fetch them from queue.
        const getRequestMock = jest.spyOn(queue.client, 'getRequest');
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

        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(0);
        expect(queue.inProgressCount()).toBe(2);
        expect(queue.assumedTotalCount).toBe(2);
        expect(queue.assumedHandledCount).toBe(0);

        // It won't query the head as there is something in progress or pending.
        expect(await queue.isFinished()).toBe(false);
        expect(listHeadMock).not.toBeCalled();

        // Reclaim one and mark another one handled.
        const updateRequestMock = jest.spyOn(queue.client, 'updateRequest');
        updateRequestMock.mockResolvedValueOnce({ requestId: 'b', wasAlreadyHandled: false, wasAlreadyPresent: true });

        await queue.markRequestHandled(requestBWithId);
        expect(updateRequestMock).toBeCalledTimes(1);
        expect(updateRequestMock).toHaveBeenLastCalledWith(requestBWithId);

        updateRequestMock.mockResolvedValueOnce({ requestId: 'a', wasAlreadyHandled: false, wasAlreadyPresent: true });

        await queue.reclaimRequest(requestAWithId, { forefront: true });
        expect(updateRequestMock).toBeCalledTimes(2);
        expect(updateRequestMock).toHaveBeenLastCalledWith(requestAWithId, { forefront: true });
        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(0);
        expect(queue.inProgressCount()).toBe(1);
        expect(queue.assumedTotalCount).toBe(2);
        expect(queue.assumedHandledCount).toBe(1);
        await sleep(STORAGE_CONSISTENCY_DELAY_MILLIS + 10);
        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(1);
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

        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(0);
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

        // @ts-expect-error Accessing private property
        expect(queue.queueHeadDict.length()).toBe(0);
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

        const getMock = jest
            .spyOn(queue.client, 'get')
            .mockResolvedValueOnce(expected);

        const result = await queue.getInfo();
        expect(result).toEqual(expected);
        expect(getMock).toBeCalledTimes(1);
        expect(getMock).toHaveBeenLastCalledWith();
    });

    test('drop() works', async () => {
        const queue = new RequestQueue({ id: 'some-id', name: 'some-name', client: storageClient });
        const deleteMock = jest
            .spyOn(queue.client, 'delete')
            .mockResolvedValueOnce(undefined);

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
            userData: { __crawlee: { skipNavigation: true, foo: 123, bar: true } },
        });
        const r2 = new Request({
            url,
            method,
            userData: {},
        });
        const r3 = new Request({
            url,
            method,
        });
        const desc1 = Object.getOwnPropertyDescriptor(r1.userData, '__crawlee');
        expect(desc1.enumerable).toBe(false);
        expect(r1.skipNavigation).toBe(true);
        expect(r1.userData.__crawlee).toMatchObject({ skipNavigation: true, foo: 123, bar: true });
        const desc2 = Object.getOwnPropertyDescriptor(r2.userData, '__crawlee');
        expect(desc2.enumerable).toBe(false);
        expect(r2.userData.__crawlee).toEqual({});
        const desc3 = Object.getOwnPropertyDescriptor(r3.userData, '__crawlee');
        expect(desc3.enumerable).toBe(false);
        expect(r3.userData.__crawlee).toEqual({});
    });
});

describe('RequestQueue v2', () => {
    const totalRequestsPerTest = 100;

    function calculateHistogram(requests: { uniqueKey: string }[]) : number[] {
        const histogram: number[] = [];
        for (const item of requests) {
            const key = item.uniqueKey;
            const index = parseInt(key, 10);
            histogram[index] = histogram[index] ? histogram[index] + 1 : 1;
        }

        return histogram;
    }

    async function getEmptyQueue(name: string) {
        const queue = await RequestQueue.open(name);
        await queue.drop();
        return RequestQueue.open(name);
    }

    function getUniqueRequests(count: number) {
        return new Array(count).fill(0).map((_, i) => new Request({ url: `http://example.com/${i}`, uniqueKey: String(i) }));
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
        jest.useFakeTimers();
        const queue = await getEmptyQueue('lock-timers');
        await queue.addRequests(getUniqueRequests(totalRequestsPerTest));

        const { items: firstFetch } = await queue.client.listAndLockHead({ limit: totalRequestsPerTest / 2, lockSecs: 60 });

        jest.advanceTimersByTime(65000);

        const { items: secondFetch } = await queue.client.listAndLockHead({ limit: totalRequestsPerTest / 2, lockSecs: 60 });

        const histogram = calculateHistogram([...firstFetch, ...secondFetch]);
        expect(histogram).toEqual(Array(totalRequestsPerTest / 2).fill(2));
        jest.useRealTimers();
    });

    test('prolongRequestLock works as expected ', async () => {
        jest.useFakeTimers();
        const queue = await getEmptyQueue('prolong-request-lock');
        await queue.addRequests(getUniqueRequests(1));

        const { items: firstFetch } = await queue.client.listAndLockHead({ limit: 1, lockSecs: 60 });
        await queue.client.prolongRequestLock(firstFetch[0].id, { lockSecs: 60 });
        expect(firstFetch).toHaveLength(1);

        jest.advanceTimersByTime(65000);
        const { items: secondFetch } = await queue.client.listAndLockHead({ limit: 1, lockSecs: 60 });
        expect(secondFetch).toHaveLength(0);

        jest.advanceTimersByTime(65000);
        const { items: thirdFetch } = await queue.client.listAndLockHead({ limit: 1, lockSecs: 60 });

        expect(thirdFetch).toHaveLength(1);
        jest.useRealTimers();
    });

    test('deleteRequestLock works as expected', async () => {
        const queue = await getEmptyQueue('delete-request-lock');
        await queue.addRequests(getUniqueRequests(1));

        const { items: firstFetch } = await queue.client.listAndLockHead({ limit: 1, lockSecs: 60 });
        await queue.client.deleteRequestLock(firstFetch[0].id);

        const { items: secondFetch } = await queue.client.listAndLockHead({ limit: 1, lockSecs: 60 });

        expect(secondFetch[0]).toEqual(firstFetch[0]);
    });
});
