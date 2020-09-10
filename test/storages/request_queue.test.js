import _ from 'underscore';
import ApifyStorageLocal from '@apify/storage-local';
import * as Apify from '../../build';
import { apifyClient } from '../../build/utils';
import {
    RequestQueue,
    QUERY_HEAD_MIN_LENGTH,
    API_PROCESSED_REQUESTS_DELAY_MILLIS,
    STORAGE_CONSISTENCY_DELAY_MILLIS,
    getRequestId,
} from '../../build/storages/request_queue';
import StorageManager from '../../build/storages/storage_manager';
import { expectNotUsingLocalStorage } from '../_helper';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';

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
        expectNotUsingLocalStorage();

        const { Request } = Apify;

        const clientKey = 'my-client';
        const queue = new RequestQueue({ id: 'some-id', clientKey, storageClient: apifyClient.requestQueues });
        const mock = sinon.mock(apifyClient.requestQueues);

        const requestA = new Request({ url: 'http://example.com/a' });
        const requestB = new Request({ url: 'http://example.com/a' }); // Has same uniqueKey as A

        // Add request A
        mock.expects('addRequest')
            .once()
            .withArgs({
                queueId: 'some-id',
                request: requestA,
                forefront: false,
                clientKey,
            })
            .returns(Promise.resolve({
                requestId: 'a',
                wasAlreadyHandled: false,
                wasAlreadyPresent: false,
                request: requestA,
            }));
        await queue.addRequest(requestA);

        // Add request B that has same unique so that addRequest() is not called because it's already cached.
        mock.expects('addRequest').never();
        expect(await queue.addRequest(requestB)).toEqual({
            requestId: 'a',
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
            request: requestB,
        });

        mock.verify();
        mock.restore();
    });

    test(
        'should cache requests locally with info if request was already handled',
        async () => {
            expectNotUsingLocalStorage();

            const { Request } = Apify;

            const clientKey = 'my-client';
            const queue = new RequestQueue({ id: 'some-id', clientKey, storageClient: apifyClient.requestQueues });
            const mock = sinon.mock(apifyClient.requestQueues);

            const requestX = new Request({ url: 'http://example.com/x' });
            const requestY = new Request({ url: 'http://example.com/x' }); // Has same uniqueKey as X

            // Add request X.
            mock.expects('addRequest')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    request: requestX,
                    forefront: false,
                    clientKey,
                })
                .returns(Promise.resolve({
                    requestId: 'x',
                    wasAlreadyHandled: true,
                    wasAlreadyPresent: true,
                    request: requestX,
                }));
            await queue.addRequest(requestX);

            // Add request Y that has same unique so that addRequest() is not called because it's already cached.
            mock.expects('addRequest').never();
            expect(await queue.addRequest(requestY)).toEqual({
                requestId: 'x',
                wasAlreadyPresent: true,
                wasAlreadyHandled: true,
                request: requestY,
            });

            mock.verify();
            mock.restore();
        },
    );

    test('should cache requests from queue head', async () => {
        expectNotUsingLocalStorage();

        const { Request } = Apify;

        const clientKey = 'my-client';
        const queue = new RequestQueue({ id: 'some-id', clientKey, storageClient: apifyClient.requestQueues });
        const mock = sinon.mock(apifyClient.requestQueues);

        // Query queue head with request A
        mock.expects('getHead')
            .once()
            .withArgs({
                queueId: 'some-id',
                limit: QUERY_HEAD_MIN_LENGTH,
                clientKey,
            })
            .returns(Promise.resolve({
                items: [
                    { id: 'a', uniqueKey: 'aaa' },
                ],
            }));
        expect(await queue.isEmpty()).toBe(false);

        // Add request A and addRequest is not called because was already cached.
        const requestA = new Request({ url: 'http://example.com/a', uniqueKey: 'aaa' });
        mock.expects('addRequest').never();
        expect(await queue.addRequest(requestA)).toEqual({
            requestId: 'a',
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
            request: requestA,
        });

        mock.verify();
        mock.restore();
    });

    test(
        'should handle situation when newly created request is not available yet',
        async () => {
            expectNotUsingLocalStorage();

            const { Request } = Apify;

            const clientKey = 'my-client';
            const queue = new RequestQueue({ id: 'some-id', name: 'some-queue', clientKey, storageClient: apifyClient.requestQueues });
            const mock = sinon.mock(apifyClient.requestQueues);
            mock.expects('getHead').never();

            const requestA = new Request({ url: 'http://example.com/a' });

            // Add request A
            mock.expects('addRequest')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    request: requestA,
                    forefront: true,
                    clientKey,
                })
                .returns(Promise.resolve({
                    requestId: 'a',
                    wasAlreadyHandled: false,
                    wasAlreadyPresent: false,
                    request: requestA,
                }));
            await queue.addRequest(requestA, { forefront: true });
            expect(queue.queueHeadDict.length()).toBe(1);

            // Try to get requestA which is not available yet.
            mock.expects('getRequest')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    requestId: 'a',
                })
                .returns(Promise.resolve(null));
            expect(await queue.fetchNextRequest()).toBe(null);

            // Give queue time to mark request 'a' as not in progress
            await Apify.utils.sleep(STORAGE_CONSISTENCY_DELAY_MILLIS + 10);

            // Should try it once again (the queue head is queried again)
            mock.expects('getRequest')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    requestId: 'a',
                })
                .returns(Promise.resolve(requestA));
            mock.expects('getHead')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    limit: QUERY_HEAD_MIN_LENGTH,
                    clientKey,
                })
                .returns(Promise.resolve({
                    items: [
                        { id: 'a', uniqueKey: 'aaa' },
                    ],
                }));
            expect(await queue.fetchNextRequest()).toEqual(requestA);

            mock.verify();
            mock.restore();
        },
    );

    test('should not add handled request to queue head dict', async () => {
        expectNotUsingLocalStorage();

        const { Request } = Apify;

        const clientKey = 'my-client';
        const queue = new RequestQueue({ id: 'some-id', clientKey, storageClient: apifyClient.requestQueues });
        const mock = sinon.mock(apifyClient.requestQueues);

        const requestA = new Request({ url: 'http://example.com/a' });

        mock.expects('addRequest')
            .once()
            .withArgs({
                queueId: 'some-id',
                request: requestA,
                forefront: true,
                clientKey,
            })
            .returns(Promise.resolve({
                requestId: 'a',
                wasAlreadyHandled: true,
                wasAlreadyPresent: true,
                request: requestA,
            }));
        mock.expects('getRequest')
            .never();
        mock.expects('getHead')
            .once()
            .withArgs({
                queueId: 'some-id',
                limit: QUERY_HEAD_MIN_LENGTH,
                clientKey,
            })
            .returns(Promise.resolve({ items: [] }));

        await queue.addRequest(requestA, { forefront: true });
        expect(await queue.fetchNextRequest()).toBe(null);

        mock.verify();
        mock.restore();
    });

    test('should accept plain object in addRequest()', async () => {
        expectNotUsingLocalStorage();
        const clientKey = 'my-client';
        const queue = new RequestQueue({ id: 'some-id', clientKey, storageClient: apifyClient.requestQueues });
        const mock = sinon.mock(apifyClient.requestQueues);
        mock.expects('addRequest')
            .once()
            .returns(Promise.resolve({
                requestId: 'xxx',
                wasAlreadyHandled: false,
                wasAlreadyPresent: false,
                clientKey,
            }));
        await queue.addRequest({ url: 'http://example.com/a' });
        mock.verify();
        mock.restore();
    });

    test('should return correct handledCount', async () => {
        const stub = sinon
            .stub(apifyClient.requestQueues, 'getQueue')
            .returns(Promise.resolve({
                handledRequestCount: 33,
            }));
        const queue = new RequestQueue({ id: 'id', storageClient: apifyClient.requestQueues });
        const count = await queue.handledCount();
        expect(count).toBe(33);
        sinon.assert.callCount(stub, 1);
        sinon.restore();
    });

    test(
        'should always wait for a queue head to become consistent before marking queue as finished (hadMultipleClients = true)',
        async () => {
            expectNotUsingLocalStorage();

            const clientKey = 'my-client';
            const queue = new RequestQueue({ id: 'some-id', name: 'some-name', clientKey, storageClient: apifyClient.requestQueues });
            const mock = sinon.mock(apifyClient.requestQueues);

            // Return head with modifiedAt = now so it will retry the call.
            mock.expects('getHead')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    limit: QUERY_HEAD_MIN_LENGTH,
                    clientKey,
                })
                .returns(Promise.resolve({
                    limit: 5,
                    queueModifiedAt: new Date(Date.now() - API_PROCESSED_REQUESTS_DELAY_MILLIS * 0.75),
                    items: [],
                    hadMultipleClients: true,
                }));

            // And now return return date which makes the queue consistent.
            mock.expects('getHead')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    limit: QUERY_HEAD_MIN_LENGTH,
                    clientKey,
                })
                .returns(Promise.resolve({
                    limit: 5,
                    queueModifiedAt: new Date(Date.now() - API_PROCESSED_REQUESTS_DELAY_MILLIS),
                    items: [],
                    hadMultipleClients: true,
                }));

            expect(await queue.isFinished()).toBe(true);

            mock.verify();
            mock.restore();
        },
    );

    test(
        'should always wait for a queue head to become consistent before marking queue as finished (hadMultipleClients = true)',
        async () => {
            expectNotUsingLocalStorage();

            const clientKey = 'my-client';
            const queueId = 'some-id';
            const queue = new RequestQueue({ id: queueId, name: 'some-name', clientKey, storageClient: apifyClient.requestQueues });
            const mock = sinon.mock(apifyClient.requestQueues);

            expect(queue.assumedTotalCount).toBe(0);
            expect(queue.assumedHandledCount).toBe(0);

            // Add some requests.
            const requestA = new Apify.Request({ url: 'http://example.com/a' });
            const requestB = new Apify.Request({ url: 'http://example.com/b' });
            mock.expects('addRequest').once()
                .withArgs({ queueId, request: requestA, forefront: true, clientKey })
                .returns(Promise.resolve({ requestId: 'a', wasAlreadyHandled: false, wasAlreadyPresent: false, request: requestA }));
            mock.expects('addRequest').once()
                .withArgs({ queueId, request: requestB, forefront: true, clientKey })
                .returns(Promise.resolve({ requestId: 'b', wasAlreadyHandled: false, wasAlreadyPresent: false, request: requestA }));
            await queue.addRequest(requestA, { forefront: true });
            await queue.addRequest(requestB, { forefront: true });

            expect(queue.queueHeadDict.length()).toBe(2);
            expect(queue.inProgressCount()).toBe(0);
            expect(queue.assumedTotalCount).toBe(2);
            expect(queue.assumedHandledCount).toBe(0);

            // It won't query the head as there is something in progress or pending.
            mock.expects('getHead').never();
            expect(await queue.isFinished()).toBe(false);

            // Fetch them from queue.
            mock.expects('getRequest').once()
                .withArgs({ queueId: 'some-id', requestId: 'b' })
                .returns(Promise.resolve(_.extend(requestB, { id: 'b' })));
            mock.expects('getRequest').once()
                .withArgs({ queueId: 'some-id', requestId: 'a' })
                .returns(Promise.resolve(_.extend(requestA, { id: 'a' })));
            const requestBFromQueue = await queue.fetchNextRequest();
            expect(requestBFromQueue).toEqual(requestB);
            const requestAFromQueue = await queue.fetchNextRequest();
            expect(requestAFromQueue).toEqual(requestA);

            expect(queue.queueHeadDict.length()).toBe(0);
            expect(queue.inProgressCount()).toBe(2);
            expect(queue.assumedTotalCount).toBe(2);
            expect(queue.assumedHandledCount).toBe(0);

            // It won't query the head as there is something in progress or pending.
            mock.expects('getHead').never();
            expect(await queue.isFinished()).toBe(false);

            // Reclaim one and mark another one handled.
            mock.expects('updateRequest').once()
                .withArgs({ queueId, request: requestB, clientKey })
                .returns(Promise.resolve({ requestId: requestB.id, wasAlreadyHandled: false, wasAlreadyPresent: true, request: requestB }));
            await queue.markRequestHandled(requestB);
            mock.expects('updateRequest').once()
                .withArgs({ queueId, request: requestA, forefront: true, clientKey })
                .returns(Promise.resolve({ requestId: requestA.id, wasAlreadyHandled: false, wasAlreadyPresent: true, request: requestA }));
            await queue.reclaimRequest(requestA, { forefront: true });
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
            mock.expects('getHead').never();
            expect(await queue.isFinished()).toBe(false);

            // Fetch again.
            mock.expects('getRequest').once()
                .withArgs({ queueId: 'some-id', requestId: 'a' })
                .returns(Promise.resolve(_.extend(requestA, { id: 'a' })));
            const requestAFromQueue2 = await queue.fetchNextRequest();
            expect(requestAFromQueue2).toEqual(requestA);

            expect(queue.queueHeadDict.length()).toBe(0);
            expect(queue.inProgressCount()).toBe(1);
            expect(queue.assumedTotalCount).toBe(2);
            expect(queue.assumedHandledCount).toBe(1);

            // It won't query the head as there is something in progress or pending.
            mock.expects('getHead').never();
            expect(await queue.isFinished()).toBe(false);

            // Mark handled.
            mock.expects('updateRequest').once()
                .withArgs({ queueId, request: requestA, clientKey })
                .returns(Promise.resolve({ requestId: requestA.id, wasAlreadyHandled: false, wasAlreadyPresent: true, request: requestA }));
            await queue.markRequestHandled(requestA);

            expect(queue.queueHeadDict.length()).toBe(0);
            expect(queue.inProgressCount()).toBe(0);
            expect(queue.assumedTotalCount).toBe(2);
            expect(queue.assumedHandledCount).toBe(2);

            // Return head with modifiedAt = now so it would retry the query for queue to become consistent but because hadMultipleClients=true
            // it will finish immediately.
            mock.expects('getHead')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    limit: QUERY_HEAD_MIN_LENGTH,
                    clientKey,
                })
                .returns(Promise.resolve({
                    limit: 5,
                    queueModifiedAt: new Date(),
                    items: [],
                    hadMultipleClients: false,
                }));

            expect(await queue.isFinished()).toBe(true);

            mock.verify();
            mock.restore();
        },
    );

    test('getInfo() should work', async () => {
        const queue = new RequestQueue({ id: 'some-id', name: 'some-name', storageClient: apifyClient.requestQueues });
        const mock = sinon.mock(apifyClient.requestQueues);

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

        mock.expects('getQueue')
            .once()
            .returns(Promise.resolve(expected));

        const result = await queue.getInfo();

        expect(result).toEqual(expected);

        mock.verify();
        mock.restore();
    });

    test('deprecated delete() still works', async () => {
        const mock = sinon.mock(apifyClient.requestQueues);
        const rq = new RequestQueue({ id: 'some-id', name: 'some-name', storageClient: apifyClient.requestQueues });
        mock.expects('deleteQueue')
            .once()
            .withArgs({ queueId: 'some-id' })
            .resolves();

        await rq.drop();

        mock.verify();
    });
});

describe('local emulation', () => {
    let localStorageEmulator;
    beforeEach(async () => {
        localStorageEmulator = new LocalStorageDirEmulator();
        await localStorageEmulator.init();
    });

    afterAll(async () => {
        (await getApifyStorageLocal()).closeDatabase();
        await localStorageEmulator.destroy();
    });

    test('should open local storage', async () => {
        const mockQueue = {
            id: 'some-id',
        };
        const apifyStorageLocal = await getApifyStorageLocal();
        const apifyStorageLocalMock = sinon.mock(apifyStorageLocal.requestQueues);

        apifyStorageLocalMock.expects('getQueue').twice().resolves(null);
        apifyStorageLocalMock.expects('getOrCreateQueue').twice().callsFake(async ({ queueName }) => {
            return { ...mockQueue, name: queueName };
        });

        let queue = await Apify.openRequestQueue();
        expect(queue.queueId).toBe(mockQueue.id);
        expect(queue.queueName).toBe('default');
        expect(queue.client).toBe(apifyStorageLocal.requestQueues);
        const name = 'xxx';
        queue = await Apify.openRequestQueue(name);
        expect(queue.queueId).toBe(mockQueue.id);
        expect(queue.queueName).toBe(name);
        expect(queue.client).toBe(apifyStorageLocal.requestQueues);

        apifyStorageLocalMock.restore();
    });

    test('default queue gets purged on initialization', async () => {
        const storage = new ApifyStorageLocal({
            storageDir: process.env.APIFY_LOCAL_STORAGE_DIR,
        });

        const request = {
            url: 'https://example.com',
            uniqueKey: 'https://example.com',
        };

        const queue = await storage.requestQueues.getOrCreateQueue({ queueName: 'default' });
        const { requestId } = await storage.requestQueues.addRequest({ queueId: queue.id, request });
        storage.closeDatabase();

        const apifyStorageLocal = await getApifyStorageLocal();
        const oldQueue = await apifyStorageLocal.requestQueues.getQueue({ queueId: queue.id });
        expect(oldQueue).toBeNull();
        const oldRequest = await apifyStorageLocal.requestQueues.getRequest({ queueId: queue.id, requestId });
        expect(oldRequest).toBeNull();
    });

    test('should work as remote', async () => {
        const { Request } = Apify;
        const queue = await Apify.openRequestQueue();

        const requestA = new Request({ url: 'http://example.com/a' });
        const requestAId = getRequestId(requestA.uniqueKey);
        const queueOperationInfo1 = await queue.addRequest(requestA);

        expect(requestA.id).toBe(requestAId);
        expect(requestA.uniqueKey).toBe('http://example.com/a');
        expect(queueOperationInfo1).toMatchObject({
            wasAlreadyPresent: false,
            wasAlreadyHandled: false,
            requestId: requestAId,
        });
        expect(queueOperationInfo1.request).toMatchObject({
            id: requestAId,
        });
        expect(queue.queueHeadDict.length()).toBe(1);

        // Try to add again the a request with the same URL
        const copyOfRequest = { url: 'http://example.com/a' };
        const queueOperationInfo2 = await queue.addRequest(copyOfRequest);

        expect(copyOfRequest.id).toBe(requestAId);
        expect(copyOfRequest.uniqueKey).toBe('http://example.com/a');
        expect(queueOperationInfo2).toMatchObject({
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
            requestId: requestAId,
        });
        expect(queueOperationInfo2.request).toMatchObject({
            id: requestAId,
        });
        expect(queue.queueHeadDict.length()).toBe(1);

        const requestB = new Request({ url: 'http://example.com/b' });
        const requestBId = getRequestId(requestB.uniqueKey);
        await queue.addRequest(requestB, { forefront: true });

        expect(queue.queueHeadDict.length()).toBe(2);
        expect(queue.inProgressCount()).toBe(0);

        // Forefronted request was added to the queue.
        const requestBFromQueue = await queue.fetchNextRequest();
        expect(requestBFromQueue).toEqual({ ...requestB, id: requestBId });
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);

        // Test validations
        await queue.markRequestHandled(new Request({ id: 'XXX', url: 'dummy' }))
            .catch((err) => expect(err.message).toMatch(/Cannot mark request XXX as handled, because it is not in progress/));
        await queue.reclaimRequest(new Request({ id: 'XXX', url: 'dummy' }))
            .catch((err) => expect(err.message).toMatch(/Cannot reclaim request XXX, because it is not in progress/));
        await queue.addRequest(new Request({ id: 'id-already-set', url: 'dummy' }))
            .catch((err) => expect(err.message).toMatch(
                /Request already has the "id" field set so it cannot be added to the queue/,
            ));

        // getRequest() returns null if object was not found.
        const requestXFromQueue = await queue.getRequest('non-existent');
        expect(requestXFromQueue).toBe(null);

        // Reclaim it.
        await queue.reclaimRequest(requestB, { forefront: true });
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);
        await Apify.utils.sleep(STORAGE_CONSISTENCY_DELAY_MILLIS + 10);
        expect(queue.queueHeadDict.length()).toBe(2);
        expect(queue.inProgressCount()).toBe(0);

        // Fetch again.
        const requestBFromQueue2 = await queue.fetchNextRequest();
        expect(requestBFromQueue2).toEqual(requestB);
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);

        // Mark handled.
        await queue.markRequestHandled(requestB);
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(0);

        const requestC = new Request({ url: 'http://example.com/c' });
        await queue.addRequest(requestC);

        // Emulate there are no cached items in queue
        queue.queueHeadDict.clear();
        const requestAFromQueue = await queue.fetchNextRequest();
        expect(requestAFromQueue).toEqual(requestA);
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);

        await queue.drop();
    });
});
