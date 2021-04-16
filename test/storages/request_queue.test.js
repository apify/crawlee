import * as Apify from '../../build';
import { apifyClient } from '../../build/utils';
import {
    RequestQueue,
    QUERY_HEAD_MIN_LENGTH,
    API_PROCESSED_REQUESTS_DELAY_MILLIS,
    STORAGE_CONSISTENCY_DELAY_MILLIS,
} from '../../build/storages/request_queue';
import { StorageManager } from '../../build/storages/storage_manager';

jest.mock('../../build/storages/storage_manager');

describe('RequestQueue remote', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    test('openRequestQueue should open storage', async () => {
        const queueId = 'abc';
        const options = { forceCloud: true };
        // This test uses and explains Jest mocking. Under import statements,
        // the StorageManager is immediately mocked. This replaces the class
        // with an observable. We can now call functions that use the class
        // and observe how they interact with StorageManager.
        await Apify.openRequestQueue(queueId, options);
        // Apify.openRequestQueue creates an instance of StorageManager.
        // Here we check that the constructor was really called once.
        expect(StorageManager).toHaveBeenCalledTimes(1);
        // Jest gives you access to newly created instances of the class.
        // Here we grab the StorageManager instance openRequestQueue created.
        const mockStorageManagerInstance = StorageManager.mock.instances[0];
        // And here we get a reference to the specific instance's function mock.
        const mockOpenStorage = mockStorageManagerInstance.openStorage;
        // Finally, we test that the function was called with expected args.
        expect(mockOpenStorage).toHaveBeenCalledWith(queueId, options);
        expect(mockOpenStorage).toHaveBeenCalledTimes(1);
    });

    test('should work', async () => {
        const queue = new RequestQueue({ id: 'some-id', client: apifyClient });
        expect(typeof queue.client.clientKey).toBe('string');
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
        const requestA = new Apify.Request(requestOptions);
        expect(queueOperationInfo1).toMatchObject({
            ...firstResolveValue,
            request: {
                ...requestA,
                id: 'a',
            },
        });
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(mockAddRequest).toHaveBeenCalledTimes(1);
        expect(mockAddRequest).toHaveBeenCalledWith(requestA, { forefront: false });

        // Try to add again a request with the same URL
        const queueOperationInfo2 = await queue.addRequest(requestOptions);
        expect(queueOperationInfo2).toMatchObject({
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
            requestId: 'a',
            request: {
                ...requestA,
                id: 'a',
            },
        });
        expect(queue.queueHeadDict.length()).toBe(1);

        const requestB = new Apify.Request({ url: 'http://example.com/b' });
        const secondResolveValue = {
            requestId: 'b',
            wasAlreadyHandled: false,
            wasAlreadyPresent: false,
        };
        mockAddRequest.mockResolvedValueOnce(secondResolveValue);

        await queue.addRequest(requestB, { forefront: true });
        expect(mockAddRequest).toHaveBeenCalledTimes(2);
        expect(mockAddRequest).toHaveBeenLastCalledWith(requestB, { forefront: true });
        expect(queue.queueHeadDict.length()).toBe(2);
        expect(queue.inProgressCount()).toBe(0);

        // Forefronted request was added to the queue.
        const mockGetRequest = jest.spyOn(queue.client, 'getRequest');
        mockGetRequest.mockResolvedValueOnce({ ...requestB, id: 'b' });

        const requestBFromQueue = await queue.fetchNextRequest();
        expect(mockGetRequest).toHaveBeenCalledTimes(1);
        expect(mockGetRequest).toHaveBeenLastCalledWith('b');
        expect(requestBFromQueue).toEqual({ ...requestB, id: 'b' });
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);

        // Test validations
        await queue.markRequestHandled(new Apify.Request({ id: 'XXX', url: 'https://example.com' }))
            .catch((err) => expect(err.message).toMatch(/Cannot mark request XXX as handled, because it is not in progress/));
        await queue.reclaimRequest(new Apify.Request({ id: 'XXX', url: 'https://example.com' }))
            .catch((err) => expect(err.message).toMatch(/Cannot reclaim request XXX, because it is not in progress/));
        await queue.addRequest(new Apify.Request({ id: 'id-already-set', url: 'https://example.com' }))
            .catch((err) => expect(err.message).toMatch(
                'Expected property `id` to be of type `undefined` but received type `string` in object',
            ));

        // getRequest() returns null if object was not found.
        mockGetRequest.mockResolvedValueOnce(null);

        const requestXFromQueue = await queue.getRequest('non-existent');
        expect(mockGetRequest).toHaveBeenCalledTimes(2);
        expect(mockGetRequest).toHaveBeenLastCalledWith('non-existent');
        expect(requestXFromQueue).toBe(null);

        // Reclaim it.
        const mockUpdateRequest = jest.spyOn(queue.client, 'updateRequest');
        mockUpdateRequest.mockResolvedValueOnce({
            requestId: 'b',
            wasAlreadyHandled: false,
            wasAlreadyPresent: true,
            request: requestBFromQueue,
        });

        await queue.reclaimRequest(requestBFromQueue, { forefront: true });
        expect(mockUpdateRequest).toHaveBeenCalledTimes(1);
        expect(mockUpdateRequest).toHaveBeenLastCalledWith(requestBFromQueue, { forefront: true });
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);
        await Apify.utils.sleep(STORAGE_CONSISTENCY_DELAY_MILLIS + 10);
        expect(queue.queueHeadDict.length()).toBe(2);
        expect(queue.inProgressCount()).toBe(0);

        // Fetch again.
        mockGetRequest.mockResolvedValueOnce(requestBFromQueue);

        const requestBFromQueue2 = await queue.fetchNextRequest();
        expect(mockGetRequest).toHaveBeenCalledTimes(3);
        expect(mockGetRequest).toHaveBeenLastCalledWith('b');
        expect(requestBFromQueue2).toEqual(requestBFromQueue);
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);

        // Mark handled.
        mockUpdateRequest.mockResolvedValueOnce({
            requestId: 'b',
            wasAlreadyHandled: false,
            wasAlreadyPresent: true,
            request: requestBFromQueue,
        });

        await queue.markRequestHandled(requestBFromQueue);
        expect(mockUpdateRequest).toHaveBeenCalledTimes(2);
        expect(mockUpdateRequest).toHaveBeenLastCalledWith(requestBFromQueue);
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(0);

        // Emulate there are no cached items in queue
        queue.queueHeadDict.clear();

        // Query queue head.
        const mockListHead = jest.spyOn(queue.client, 'listHead');
        mockListHead.mockResolvedValueOnce({
            items: [
                { id: 'a', uniqueKey: 'aaa' },
                { id: 'c', uniqueKey: 'ccc' },
            ],
        });
        mockGetRequest.mockResolvedValueOnce({ ...requestA, id: 'a' });

        const requestAFromQueue = await queue.fetchNextRequest();
        expect(mockGetRequest).toHaveBeenCalledTimes(4);
        expect(mockGetRequest).toHaveBeenLastCalledWith('a');
        expect(mockListHead).toHaveBeenCalledTimes(1);
        expect(mockListHead).toHaveBeenLastCalledWith({ limit: QUERY_HEAD_MIN_LENGTH });
        expect(requestAFromQueue).toEqual({ ...requestA, id: 'a' });
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);

        // Drop queue.
        const mockDelete = jest.spyOn(queue.client, 'delete');
        mockDelete.mockResolvedValueOnce(undefined);

        await queue.drop();
        expect(mockDelete).toHaveBeenCalledTimes(1);
        expect(mockDelete).toHaveBeenLastCalledWith();
    });

    test('should cache new requests locally', async () => {
        const { Request } = Apify;

        const queue = new RequestQueue({ id: 'some-id', client: apifyClient });

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
        expect(addRequestMock).toHaveBeenCalledTimes(1);
        expect(addRequestMock).toHaveBeenLastCalledWith(requestA, { forefront: false });

        // Add request B that has same unique so that addRequest() is not called because it's already cached.
        // mock.expects('addRequest').never();
        const queueOperationInfo = await queue.addRequest(requestB);
        expect(addRequestMock).toHaveBeenCalledTimes(1);
        expect(queueOperationInfo).toEqual({
            requestId: 'a',
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
            request: {
                ...requestA,
                id: 'a',
            },
        });
    });

    test('should cache requests locally with info if request was already handled', async () => {
        const { Request } = Apify;

        const queue = new RequestQueue({ id: 'some-id', client: apifyClient });

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
        expect(addRequestMock).toHaveBeenCalledTimes(1);
        expect(addRequestMock).toHaveBeenLastCalledWith(requestX, { forefront: false });

        // Add request Y that has same unique so that addRequest() is not called because it's already cached.
        // mock.expects('addRequest').never();
        const queueOperationInfo = await queue.addRequest(requestY);
        expect(addRequestMock).toHaveBeenCalledTimes(1);
        expect(queueOperationInfo).toEqual({
            requestId: 'x',
            wasAlreadyPresent: true,
            wasAlreadyHandled: true,
            request: {
                ...requestX,
                id: 'x',
            },
        });
    });

    test('should cache requests from queue head', async () => {
        const { Request } = Apify;

        const queue = new RequestQueue({ id: 'some-id', client: apifyClient });

        // Query queue head with request A
        const listHeadMock = jest.spyOn(queue.client, 'listHead');
        listHeadMock.mockResolvedValueOnce({
            items: [
                { id: 'a', uniqueKey: 'aaa' },
            ],
        });

        expect(await queue.isEmpty()).toBe(false);
        expect(listHeadMock).toHaveBeenCalledTimes(1);
        expect(listHeadMock).toHaveBeenLastCalledWith({ limit: QUERY_HEAD_MIN_LENGTH });

        // Add request A and addRequest is not called because was already cached.
        const requestA = new Request({ url: 'http://example.com/a', uniqueKey: 'aaa' });
        const addRequestMock = jest.spyOn(queue.client, 'addRequest');

        const queueOperationInfo = await queue.addRequest(requestA);
        expect(addRequestMock).toHaveBeenCalledTimes(0);
        expect(queueOperationInfo).toEqual({
            requestId: 'a',
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
            request: {
                ...requestA,
                id: 'a',
            },
        });
    });

    test('should handle situation when newly created request is not available yet', async () => {
        const { Request } = Apify;

        const queue = new RequestQueue({ id: 'some-id', name: 'some-queue', client: apifyClient });
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
        expect(addRequestMock).toHaveBeenCalledTimes(1);
        expect(addRequestMock).toHaveBeenLastCalledWith(requestA, { forefront: true });
        expect(queue.queueHeadDict.length()).toBe(1);

        // Try to get requestA which is not available yet.
        const getRequestMock = jest.spyOn(queue.client, 'getRequest');
        getRequestMock.mockResolvedValueOnce(undefined);

        const fetchedRequest = await queue.fetchNextRequest();
        expect(getRequestMock).toHaveBeenCalledTimes(1);
        expect(getRequestMock).toHaveBeenLastCalledWith('a');
        expect(fetchedRequest).toBe(null);

        // Give queue time to mark request 'a' as not in progress
        await Apify.utils.sleep(STORAGE_CONSISTENCY_DELAY_MILLIS + 10);
        expect(listHeadMock).not.toHaveBeenCalled();

        // Should try it once again (the queue head is queried again)
        getRequestMock.mockResolvedValueOnce({
            ...requestA,
            id: 'a',
        });

        listHeadMock.mockResolvedValueOnce({
            items: [
                { id: 'a', uniqueKey: 'aaa' },
            ],
        });

        const fetchedRequest2 = await queue.fetchNextRequest();
        expect(getRequestMock).toHaveBeenCalledTimes(2);
        expect(getRequestMock).toHaveBeenLastCalledWith('a');
        expect(listHeadMock).toHaveBeenCalledTimes(1);
        expect(listHeadMock).toHaveBeenLastCalledWith({ limit: QUERY_HEAD_MIN_LENGTH });
        expect(fetchedRequest2).toEqual({ ...requestA, id: 'a' });
    });

    test('should not add handled request to queue head dict', async () => {
        const { Request } = Apify;

        const queue = new RequestQueue({ id: 'some-id', client: apifyClient });

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
        });

        await queue.addRequest(requestA, { forefront: true });
        expect(addRequestMock).toHaveBeenCalledTimes(1);
        expect(addRequestMock).toHaveBeenLastCalledWith(requestA, { forefront: true });

        const fetchedRequest = await queue.fetchNextRequest();
        expect(getRequestMock).not.toHaveBeenCalled();
        expect(listHeadMock).toHaveBeenCalledTimes(1);
        expect(listHeadMock).toHaveBeenLastCalledWith({ limit: QUERY_HEAD_MIN_LENGTH });
        expect(fetchedRequest).toBe(null);
    });

    test('should accept plain object in addRequest()', async () => {
        const queue = new RequestQueue({ id: 'some-id', client: apifyClient });
        const addRequestMock = jest.spyOn(queue.client, 'addRequest');
        addRequestMock.mockResolvedValueOnce({
            requestId: 'xxx',
            wasAlreadyHandled: false,
            wasAlreadyPresent: false,
        });

        const requestOpts = { url: 'http://example.com/a' };
        await queue.addRequest(requestOpts);
        expect(addRequestMock).toHaveBeenCalledTimes(1);
        expect(addRequestMock).toHaveBeenLastCalledWith(new Apify.Request(requestOpts), { forefront: false });
    });

    test('should return correct handledCount', async () => {
        const queue = new RequestQueue({ id: 'id', client: apifyClient });
        const getMock = jest.spyOn(queue.client, 'get');
        getMock.mockResolvedValueOnce({
            handledRequestCount: 33,
        });
        const count = await queue.handledCount();
        expect(count).toBe(33);
        expect(getMock).toHaveBeenCalledTimes(1);
        expect(getMock).toHaveBeenLastCalledWith();
    });

    test('should always wait for a queue head to become consistent before marking queue as finished (hadMultipleClients = true)', async () => {
        const queue = new RequestQueue({ id: 'some-id', name: 'some-name', client: apifyClient });

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
        expect(listHeadMock).toHaveBeenCalledTimes(2);
        expect(listHeadMock).toHaveBeenNthCalledWith(1, { limit: QUERY_HEAD_MIN_LENGTH });
        expect(listHeadMock).toHaveBeenNthCalledWith(2, { limit: QUERY_HEAD_MIN_LENGTH });
    });

    test('should always wait for a queue head to become consistent before marking queue as finished (hadMultipleClients = false)', async () => {
        const queueId = 'some-id';
        const queue = new RequestQueue({ id: queueId, name: 'some-name', client: apifyClient });

        expect(queue.assumedTotalCount).toBe(0);
        expect(queue.assumedHandledCount).toBe(0);

        // Add some requests.
        const requestA = new Apify.Request({ url: 'http://example.com/a' });
        const requestAWithId = { ...requestA, id: 'a' };
        const requestB = new Apify.Request({ url: 'http://example.com/b' });
        const requestBWithId = { ...requestB, id: 'b' };
        const addRequestMock = jest.spyOn(queue.client, 'addRequest');
        addRequestMock.mockResolvedValueOnce({ requestId: 'a', wasAlreadyHandled: false, wasAlreadyPresent: false });
        addRequestMock.mockResolvedValueOnce({ requestId: 'b', wasAlreadyHandled: false, wasAlreadyPresent: false });

        await queue.addRequest(requestA, { forefront: true });
        await queue.addRequest(requestB, { forefront: true });

        expect(queue.queueHeadDict.length()).toBe(2);
        expect(queue.inProgressCount()).toBe(0);
        expect(queue.assumedTotalCount).toBe(2);
        expect(queue.assumedHandledCount).toBe(0);
        expect(addRequestMock).toHaveBeenCalledTimes(2);
        expect(addRequestMock).toHaveBeenNthCalledWith(1, requestA, { forefront: true });
        expect(addRequestMock).toHaveBeenNthCalledWith(2, requestB, { forefront: true });

        // It won't query the head as there is something in progress or pending.
        const listHeadMock = jest.spyOn(queue.client, 'listHead');

        const isFinished = await queue.isFinished();
        expect(isFinished).toBe(false);
        expect(listHeadMock).not.toHaveBeenCalled();

        // Fetch them from queue.
        const getRequestMock = jest.spyOn(queue.client, 'getRequest');
        getRequestMock.mockResolvedValueOnce({ ...requestB, id: 'b' });
        getRequestMock.mockResolvedValueOnce({ ...requestA, id: 'a' });

        const requestBFromQueue = await queue.fetchNextRequest();
        expect(requestBFromQueue).toEqual(requestBWithId);
        expect(getRequestMock).toHaveBeenCalledTimes(1);
        expect(getRequestMock).toHaveBeenLastCalledWith('b');
        const requestAFromQueue = await queue.fetchNextRequest();
        expect(requestAFromQueue).toEqual(requestAWithId);
        expect(getRequestMock).toHaveBeenCalledTimes(2);
        expect(getRequestMock).toHaveBeenLastCalledWith('a');

        expect(queue.queueHeadDict.length()).toBe(0);
        expect(queue.inProgressCount()).toBe(2);
        expect(queue.assumedTotalCount).toBe(2);
        expect(queue.assumedHandledCount).toBe(0);

        // It won't query the head as there is something in progress or pending.
        expect(await queue.isFinished()).toBe(false);
        expect(listHeadMock).not.toHaveBeenCalled();

        // Reclaim one and mark another one handled.
        const updateRequestMock = jest.spyOn(queue.client, 'updateRequest');
        updateRequestMock.mockResolvedValueOnce({ requestId: 'b', wasAlreadyHandled: false, wasAlreadyPresent: true });

        await queue.markRequestHandled(requestBWithId);
        expect(updateRequestMock).toHaveBeenCalledTimes(1);
        expect(updateRequestMock).toHaveBeenLastCalledWith(requestBWithId);

        updateRequestMock.mockResolvedValueOnce({ requestId: 'a', wasAlreadyHandled: false, wasAlreadyPresent: true });

        await queue.reclaimRequest(requestAWithId, { forefront: true });
        expect(updateRequestMock).toHaveBeenCalledTimes(2);
        expect(updateRequestMock).toHaveBeenLastCalledWith(requestAWithId, { forefront: true });
        expect(queue.queueHeadDict.length()).toBe(0);
        expect(queue.inProgressCount()).toBe(1);
        expect(queue.assumedTotalCount).toBe(2);
        expect(queue.assumedHandledCount).toBe(1);
        await Apify.utils.sleep(STORAGE_CONSISTENCY_DELAY_MILLIS + 10);
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(0);
        expect(queue.assumedTotalCount).toBe(2);
        expect(queue.assumedHandledCount).toBe(1);

        // It won't query the head as there is something in progress or pending.
        expect(await queue.isFinished()).toBe(false);
        expect(listHeadMock).not.toHaveBeenCalled();

        // Fetch again.
        getRequestMock.mockResolvedValueOnce(requestAWithId);

        const requestAFromQueue2 = await queue.fetchNextRequest();
        expect(requestAFromQueue2).toEqual(requestAWithId);
        expect(getRequestMock).toHaveBeenCalledTimes(3);
        expect(getRequestMock).toHaveBeenLastCalledWith('a');

        expect(queue.queueHeadDict.length()).toBe(0);
        expect(queue.inProgressCount()).toBe(1);
        expect(queue.assumedTotalCount).toBe(2);
        expect(queue.assumedHandledCount).toBe(1);

        // It won't query the head as there is something in progress or pending.
        expect(await queue.isFinished()).toBe(false);
        expect(listHeadMock).not.toHaveBeenCalled();

        // Mark handled.
        updateRequestMock.mockResolvedValueOnce({ requestId: 'a', wasAlreadyHandled: false, wasAlreadyPresent: true });

        await queue.markRequestHandled(requestAWithId);
        expect(updateRequestMock).toHaveBeenCalledTimes(3);
        expect(updateRequestMock).toHaveBeenLastCalledWith(requestAWithId);

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
        expect(listHeadMock).toHaveBeenCalledTimes(1);
        expect(listHeadMock).toHaveBeenLastCalledWith({ limit: QUERY_HEAD_MIN_LENGTH });
    });

    test('getInfo() should work', async () => {
        const queue = new RequestQueue({ id: 'some-id', name: 'some-name', client: apifyClient });

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
        };

        const getMock = jest
            .spyOn(queue.client, 'get')
            .mockResolvedValueOnce(expected);

        const result = await queue.getInfo();
        expect(result).toEqual(expected);
        expect(getMock).toHaveBeenCalledTimes(1);
        expect(getMock).toHaveBeenLastCalledWith();
    });

    test('drop() works', async () => {
        const queue = new RequestQueue({ id: 'some-id', name: 'some-name', client: apifyClient });
        const deleteMock = jest
            .spyOn(queue.client, 'delete')
            .mockResolvedValueOnce(undefined);

        await queue.drop();
        expect(deleteMock).toHaveBeenCalledTimes(1);
        expect(deleteMock).toHaveBeenLastCalledWith();
    });

    test('getRequest should remove nulls from stored requests', async () => {
        const url = 'http://example.com';
        const method = 'POST';
        const queue = new RequestQueue({ id: 'some-id', name: 'some-name', client: apifyClient });
        const getRequestMock = jest
            .spyOn(queue.client, 'getRequest')
            .mockResolvedValueOnce({
                url,
                loadedUrl: null,
                errorMessages: null,
                handledAt: null,
                method,
            });

        const request = await queue.getRequest('abc');
        expect(getRequestMock).toHaveBeenCalledTimes(1);
        expect(getRequestMock).toHaveBeenLastCalledWith('abc');
        expect(request.url).toBe(url);
        expect(request.loadedUrl).toBeUndefined();
        expect(request.errorMessages).toEqual([]);
        expect(request.handledAt).toBeUndefined();
        expect(request.method).toBe(method);
    });
});
