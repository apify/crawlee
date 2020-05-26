import _ from 'underscore';
import sinon from 'sinon';
import ApifyStorageLocal from '@apify/storage-local';
import { ENV_VARS } from 'apify-shared/consts';
import * as Apify from '../build/index';
import * as utils from '../build/utils';
import {
    RequestQueue,
    QUERY_HEAD_MIN_LENGTH,
    API_PROCESSED_REQUESTS_DELAY_MILLIS,
    STORAGE_CONSISTENCY_DELAY_MILLIS,
    getRequestId,
} from '../build/request_queue';
import { expectNotUsingLocalStorage } from './_helper';
import LocalStorageDirEmulator from './local_storage_dir_emulator';

const { apifyClient, getApifyStorageLocal } = utils;

describe('RequestQueue remote', () => {
    beforeAll(() => apifyClient.setOptions({ token: 'xxx' }));
    afterAll(() => apifyClient.setOptions({ token: undefined }));

    test('openRequestQueue should open remote storage', async () => {
        const mockQueue = {
            id: 'some-id',
        };
        const apifyClientMock = sinon.mock(apifyClient.requestQueues);
        process.env[ENV_VARS.LOCAL_STORAGE_DIR] = 'xyz';
        process.env[ENV_VARS.DEFAULT_REQUEST_QUEUE_ID] = 'default-id';

        apifyClientMock.expects('getQueue').twice().resolves(null);
        apifyClientMock.expects('getOrCreateQueue').twice().callsFake(async ({ queueName }) => {
            return { ...mockQueue, name: queueName };
        });

        const name = 'xxx';
        let queue = await Apify.openRequestQueue(name, { forceCloud: true });
        expect(queue.queueId).toBe(mockQueue.id);
        expect(queue.queueName).toBe(name);
        expect(queue.client).toBe(apifyClient.requestQueues);

        delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
        process.env[ENV_VARS.TOKEN] = 'xxx';


        queue = await Apify.openRequestQueue();
        expect(queue.queueId).toBe(mockQueue.id);
        expect(queue.queueName).toBe('default-id');
        expect(queue.client).toBe(apifyClient.requestQueues);

        delete process.env[ENV_VARS.TOKEN];
        delete process.env[ENV_VARS.DEFAULT_REQUEST_QUEUE_ID];

        apifyClientMock.restore();
    });

    test('should work', async () => {
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
                forefront: false,
                clientKey,
            })
            .returns(Promise.resolve({ requestId: 'a', wasAlreadyHandled: false, wasAlreadyPresent: false, request: requestA }));
        const queueOperationInfo1 = await queue.addRequest(requestA);

        expect(requestA.id).toBe('a');
        expect(requestA.uniqueKey).toBe('http://example.com/a');
        expect(queueOperationInfo1).toMatchObject({
            wasAlreadyPresent: false,
            wasAlreadyHandled: false,
            requestId: 'a',
        });
        expect(queueOperationInfo1.request).toMatchObject({
            id: 'a',
        });
        expect(queue.queueHeadDict.length()).toBe(1);

        // Try to add again the a request with the same URL
        const copyOfRequest = { url: 'http://example.com/a' };
        const queueOperationInfo2 = await queue.addRequest(copyOfRequest);
        expect(copyOfRequest.id).toBe('a');
        expect(copyOfRequest.uniqueKey).toBe('http://example.com/a');
        expect(queueOperationInfo2).toMatchObject({
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
            requestId: 'a',
        });
        expect(queueOperationInfo2.request).toMatchObject({
            id: 'a',
        });
        expect(queue.queueHeadDict.length()).toBe(1);

        const requestB = new Request({ url: 'http://example.com/b' });
        mock.expects('addRequest')
            .once()
            .withArgs({
                queueId: 'some-id',
                request: requestB,
                forefront: true,
                clientKey,
            })
            .returns(Promise.resolve({ requestId: 'b', wasAlreadyHandled: false, wasAlreadyPresent: false, request: requestB }));
        await queue.addRequest(requestB, { forefront: true });

        expect(queue.queueHeadDict.length()).toBe(2);
        expect(queue.inProgressCount()).toBe(0);

        // Forefronted request was added to the queue.
        mock.expects('getRequest')
            .once()
            .withArgs({
                queueId: 'some-id',
                requestId: 'b',
            })
            .returns(Promise.resolve(_.extend(requestB, { id: 'b' })));
        const requestBFromQueue = await queue.fetchNextRequest();
        expect(requestBFromQueue).toEqual(requestB);
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);

        // Test validations
        await queue.markRequestHandled(new Request({ id: 'XXX', url: 'dummy' }))
            .catch(err => expect(err.message).toMatch(/Cannot mark request XXX as handled, because it is not in progress/));
        await queue.reclaimRequest(new Request({ id: 'XXX', url: 'dummy' }))
            .catch(err => expect(err.message).toMatch(/Cannot reclaim request XXX, because it is not in progress/));
        await queue.addRequest(new Request({ id: 'id-already-set', url: 'dummy' }))
            .catch(err => expect(err.message).toMatch(
                /Request already has the "id" field set so it cannot be added to the queue/,
            ));

        // getRequest() returns null if object was not found.
        mock.expects('getRequest')
            .once()
            .withArgs({
                queueId: 'some-id',
                requestId: 'non-existent',
            })
            .returns(Promise.resolve(null));
        const requestXFromQueue = await queue.getRequest('non-existent');
        expect(requestXFromQueue).toBe(null);

        // Reclaim it.
        mock.expects('updateRequest')
            .once()
            .withArgs({
                queueId: 'some-id',
                request: requestB,
                forefront: true,
                clientKey,
            })
            .returns(Promise.resolve({ requestId: requestB.id, wasAlreadyHandled: false, wasAlreadyPresent: true, request: requestB }));
        await queue.reclaimRequest(requestB, { forefront: true });
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);
        await Apify.utils.sleep(STORAGE_CONSISTENCY_DELAY_MILLIS + 10);
        expect(queue.queueHeadDict.length()).toBe(2);
        expect(queue.inProgressCount()).toBe(0);

        // Fetch again.
        mock.expects('getRequest')
            .once()
            .withArgs({
                queueId: 'some-id',
                requestId: 'b',
            })
            .returns(Promise.resolve(_.extend(requestB, { id: 'b' })));
        const requestBFromQueue2 = await queue.fetchNextRequest();
        expect(requestBFromQueue2).toEqual(requestB);
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);

        // Mark handled.
        mock.expects('updateRequest')
            .once()
            .withArgs({
                queueId: 'some-id',
                request: requestB,
                clientKey,
            })
            .returns(Promise.resolve({ requestId: requestB.id, wasAlreadyHandled: false, wasAlreadyPresent: true, request: requestB }));
        await queue.markRequestHandled(requestB);
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(0);

        // Emulate there are no cached items in queue
        queue.queueHeadDict.clear();

        // Query queue head.
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
                    { id: 'c', uniqueKey: 'ccc' },
                ],
            }));
        mock.expects('getRequest')
            .once()
            .withArgs({
                queueId: 'some-id',
                requestId: 'a',
            })
            .returns(Promise.resolve(_.extend(requestA, { id: 'a' })));
        const requestAFromQueue = await queue.fetchNextRequest();
        expect(requestAFromQueue).toEqual(requestA);
        expect(queue.queueHeadDict.length()).toBe(1);
        expect(queue.inProgressCount()).toBe(1);

        // Drop queue.
        mock.expects('deleteQueue')
            .once()
            .withArgs({
                queueId: 'some-id',
            })
            .returns(Promise.resolve());
        await queue.drop();

        mock.verify();
        mock.restore();
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
            .catch(err => expect(err.message).toMatch(/Cannot mark request XXX as handled, because it is not in progress/));
        await queue.reclaimRequest(new Request({ id: 'XXX', url: 'dummy' }))
            .catch(err => expect(err.message).toMatch(/Cannot reclaim request XXX, because it is not in progress/));
        await queue.addRequest(new Request({ id: 'id-already-set', url: 'dummy' }))
            .catch(err => expect(err.message).toMatch(
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
