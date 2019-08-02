import { assert, expect } from 'chai';
import _ from 'underscore';
import sinon from 'sinon';
import path from 'path';
import { ENV_VARS } from 'apify-shared/consts';
import * as Apify from '../build/index';
import * as utils from '../build/utils';
import {
    RequestQueueLocal, RequestQueue,
    LOCAL_STORAGE_SUBDIR, QUERY_HEAD_MIN_LENGTH, API_PROCESSED_REQUESTS_DELAY_MILLIS, STORAGE_CONSISTENCY_DELAY_MILLIS,
} from '../build/request_queue';
import { emptyLocalStorageSubdir, LOCAL_STORAGE_DIR, expectNotUsingLocalStorage, expectDirEmpty, expectDirNonEmpty } from './_helper';

const { apifyClient } = utils;

const expectRequestsSame = (req1, req2) => {
    expect(_.omit(req1, 'id')).to.be.eql(_.omit(req2, 'id'));
};

describe('RequestQueue', () => {
    before(() => apifyClient.setOptions({ token: 'xxx' }));
    after(() => apifyClient.setOptions({ token: undefined }));
    beforeEach(() => emptyLocalStorageSubdir(LOCAL_STORAGE_SUBDIR));
    afterEach(() => emptyLocalStorageSubdir(LOCAL_STORAGE_SUBDIR));

    describe('local', async () => {
        it('should work', async () => {
            const queue = new RequestQueueLocal('my-queue-0', LOCAL_STORAGE_DIR);

            const req1 = new Apify.Request({ url: 'http://example.com/first' });
            const info1 = await queue.addRequest(req1);
            await queue.addRequest(new Apify.Request({ url: 'http://example.com/middle' }));
            await queue.addRequest(new Apify.Request({ url: 'http://example.com/last-but-first' }), { forefront: true });

            expect(req1.id).to.be.a('string');
            expect(req1.uniqueKey).to.eql('http://example.com/first');
            expect(info1).to.contain({
                wasAlreadyPresent: false,
                wasAlreadyHandled: false,
                request: req1,
            });
            expect(info1.requestId).to.be.a('string');

            const request3 = await queue.fetchNextRequest();
            const request1 = await queue.fetchNextRequest();
            const request2 = await queue.fetchNextRequest();

            expect(await queue.getRequest(request1.id)).to.be.eql(request1);
            expect(await queue.getRequest(request2.id)).to.be.eql(request2);
            expect(await queue.getRequest(request3.id)).to.be.eql(request3);
            expect(await queue.getRequest(request1.id)).to.not.be.eql(request3);
            expect(await queue.getRequest('non-exiting')).to.be.eql(null);

            expect(request3.url).to.be.eql('http://example.com/last-but-first');
            expect(request1.url).to.be.eql('http://example.com/first');
            expect(request2.url).to.be.eql('http://example.com/middle');

            expect((await queue.getRequest(request3.id)).url).to.be.eql('http://example.com/last-but-first');
            expect((await queue.getRequest(request1.id)).url).to.be.eql('http://example.com/first');
            expect((await queue.getRequest(request2.id)).url).to.be.eql('http://example.com/middle');

            expect(await queue.fetchNextRequest()).to.be.eql(null);
            expect(await queue.isEmpty()).to.be.eql(true);
            expect(await queue.isFinished()).to.be.eql(false);

            // Test validations
            await queue.markRequestHandled(new Apify.Request({ id: 'XXX', url: 'dummy' }))
                .catch(err => expect(err.message).to.match(/Cannot mark request XXX as handled, because it is not in progress/));
            await queue.reclaimRequest(new Apify.Request({ id: 'XXX', url: 'dummy' }))
                .catch(err => expect(err.message).to.match(/Cannot reclaim request XXX, because it is not in progress/));
            await queue.addRequest(new Apify.Request({ id: 'id-already-set', url: 'dummy' }))
                .catch(err => expect(err.message).to.match(/Request already has the "id" field set so it cannot be added to the queue/));

            // Check that changes to Requests are persisted to Queue.
            request1.errorMessages = ['Hello'];
            request2.retryCount = 2;
            request3.retryCount = 3;

            await queue.markRequestHandled(request3);
            await queue.reclaimRequest(request1);
            const info2 = await queue.reclaimRequest(request2);
            expect(await queue.isEmpty()).to.be.eql(false);

            expect(info2).to.contain({
                wasAlreadyPresent: true,
                wasAlreadyHandled: false,
                request: request2,
            });
            expect(info2.requestId).to.be.a('string');

            const handledRequest3 = await queue.getRequest(request3.id);
            expect(handledRequest3.handledAt).to.be.an.instanceof(Date);
            expect(handledRequest3).to.be.eql(request3);

            expect(await queue.fetchNextRequest()).to.be.eql(request1);
            expect(await queue.fetchNextRequest()).to.be.eql(request2);
            expect(await queue.fetchNextRequest()).to.be.eql(null);
            const info3 = await queue.markRequestHandled(request1);
            await queue.markRequestHandled(request2);

            expect(info3).to.contain({
                wasAlreadyPresent: true,
                wasAlreadyHandled: false,
                request: request1,
            });
            expect(info3.requestId).to.be.a('string');

            expect(await queue.isEmpty()).to.be.eql(true);
            expect(await queue.isFinished()).to.be.eql(true);

            // Drop it.
            const queueDir = path.join(LOCAL_STORAGE_DIR, LOCAL_STORAGE_SUBDIR, 'my-queue-0');
            expectDirNonEmpty(queueDir);
            await queue.drop();
            expectDirEmpty(queueDir);
        });

        it('handles invalid URLs gracefully', async () => {
            const queue = new RequestQueueLocal('my-queue-x', LOCAL_STORAGE_DIR);

            try {
                await queue.addRequest({ url: '' });
                assert.fail('This should not happen');
            } catch (e) {
                expect(e.message).to.contain('The "url" option cannot be empty string');
            }
            await queue.addRequest(new Apify.Request({ url: 'something' }));
            await Apify.utils.sleep(20);
            await queue.addRequest({ url: 'dummy' });

            const request2 = await queue.fetchNextRequest();
            const request1 = await queue.fetchNextRequest();

            expect(request1.url).to.be.eql('dummy');
            expect(request1.uniqueKey).to.be.eql('dummy');

            expect(request2.url).to.be.eql('something');
            expect(request2.uniqueKey).to.be.eql('something');

            expect(await queue.getRequest(request1.id)).to.be.eql(request1);
            expect(await queue.getRequest(request2.id)).to.be.eql(request2);
        });

        it('supports forefront param in reclaimRequest()', async () => {
            const queue = new RequestQueueLocal('my-queue-1', LOCAL_STORAGE_DIR);

            await queue.addRequest(new Apify.Request({ url: 'http://example.com/first' }));
            await queue.addRequest(new Apify.Request({ url: 'http://example.com/middle' }));
            await queue.addRequest(new Apify.Request({ url: 'http://example.com/third' }));

            const request1ForFirstTime = await queue.fetchNextRequest();
            expect(request1ForFirstTime.url).to.be.eql('http://example.com/first');

            // Return it to the front.
            await queue.reclaimRequest(request1ForFirstTime, { forefront: true });

            const request1ForSecondTime = await queue.fetchNextRequest();
            expect(request1ForSecondTime.url).to.be.eql('http://example.com/first');

            // Now put it at the back.
            await queue.reclaimRequest(request1ForSecondTime);

            const request2 = await queue.fetchNextRequest();
            const request3 = await queue.fetchNextRequest();
            const request1 = await queue.fetchNextRequest();

            expect(request1.url).to.be.eql('http://example.com/first');
            expect(request2.url).to.be.eql('http://example.com/middle');
            expect(request3.url).to.be.eql('http://example.com/third');
        });

        it('should get initialized from existing dir', async () => {
            const request1 = new Apify.Request({ url: 'http://example.com/first' });
            const request2 = new Apify.Request({ url: 'http://example.com/middle' });
            const request3 = new Apify.Request({ url: 'http://example.com/last-but-first' });

            // Do something with 3 requests in one queue.
            const queue = new RequestQueueLocal('my-queue-2', LOCAL_STORAGE_DIR);
            await queue.addRequest(request1);
            await queue.addRequest(request2);
            await queue.addRequest(request3, { forefront: true });
            const freshRequest3 = await queue.fetchNextRequest();
            const freshRequest1 = await queue.fetchNextRequest();
            expectRequestsSame(freshRequest3, request3);
            expectRequestsSame(freshRequest1, request1);
            await queue.markRequestHandled(freshRequest1);

            // Now do the same with another queue.
            const anotherQueue = new RequestQueueLocal('my-queue-2', LOCAL_STORAGE_DIR);
            expect(await anotherQueue.isEmpty()).to.be.eql(false);
            expect(await anotherQueue.isFinished()).to.be.eql(false);
            const request3FromAnotherQueue = await anotherQueue.fetchNextRequest();
            const request2FromAnotherQueue = await anotherQueue.fetchNextRequest();
            expectRequestsSame(request3FromAnotherQueue, request3);
            expectRequestsSame(request2FromAnotherQueue, request2);
            expect(await anotherQueue.isEmpty()).to.be.eql(true);
            expect(await anotherQueue.isFinished()).to.be.eql(false);
            await anotherQueue.markRequestHandled(request3FromAnotherQueue);
            await anotherQueue.markRequestHandled(request2FromAnotherQueue);
            expect(await anotherQueue.isEmpty()).to.be.eql(true);
            expect(await anotherQueue.isFinished()).to.be.eql(true);
        });

        it('should accept plain object in addRequest()', async () => {
            const queue = new RequestQueueLocal('some-id', LOCAL_STORAGE_DIR);
            await queue.addRequest({ url: 'http://example.com/a' });
            expect(
                (await queue.fetchNextRequest()).url,
            ).to.be.eql('http://example.com/a');
        });

        it('getInfo() and handledCount() should work', async () => {
            const queueName = 'stats-queue';
            const queue = new RequestQueueLocal(queueName, LOCAL_STORAGE_DIR);
            let count = await queue.handledCount();
            let info;
            expect(count).to.be.eql(0);
            const r1 = new Apify.Request({ url: 'http://example.com/1' });
            const r2 = new Apify.Request({ url: 'http://example.com/2' });
            const r3 = new Apify.Request({ url: 'http://example.com/3' });
            const op1 = await queue.addRequest(r1);
            await queue.addRequest(r2);

            count = await queue.handledCount();
            info = await queue.getInfo();
            expect(count).to.be.eql(0);
            expect(info).to.be.an('object');
            expect(info.id).to.be.eql(queueName);
            expect(info.name).to.be.eql(queueName);
            expect(info.userId).to.be.eql(null);
            expect(info.totalRequestCount).to.be.eql(2);
            expect(info.pendingRequestCount).to.be.eql(2);
            expect(info.handledRequestCount).to.be.eql(0);
            const cTime = info.createdAt.getTime();
            let mTime = info.modifiedAt.getTime();
            expect(cTime).to.be.below(Date.now() + 1);
            expect(cTime).to.be.at.most(mTime);

            const rf1 = await queue.fetchNextRequest();
            await queue.markRequestHandled(rf1);
            count = await queue.handledCount();
            info = await queue.getInfo();
            expect(count).to.be.eql(1);
            expect(info.totalRequestCount).to.be.eql(2);
            expect(info.pendingRequestCount).to.be.eql(1);
            expect(info.handledRequestCount).to.be.eql(1);

            await queue.addRequest(r3);
            const rf2 = await queue.fetchNextRequest();
            await queue.markRequestHandled(rf2);
            const rf3 = await queue.fetchNextRequest();
            await queue.markRequestHandled(rf3);
            count = await queue.handledCount();
            info = await queue.getInfo();
            expect(count).to.be.eql(3);
            expect(info.totalRequestCount).to.be.eql(3);
            expect(info.pendingRequestCount).to.be.eql(0);
            expect(info.handledRequestCount).to.be.eql(3);

            // Test access time
            await Apify.utils.sleep(2);
            await queue.getRequest(op1.requestId);
            await Apify.utils.sleep(2);
            const now = Date.now();
            await Apify.utils.sleep(2);
            info = await queue.getInfo();
            const cTime2 = info.createdAt.getTime();
            mTime = info.modifiedAt.getTime();
            const aTime = info.accessedAt.getTime();
            expect(cTime).to.be.eql(cTime2);
            expect(mTime).to.be.below(aTime);
            expect(mTime).to.be.below(now);
            expect(aTime).to.be.below(now);

            const newQueue = new RequestQueueLocal(queueName, LOCAL_STORAGE_DIR);
            count = await newQueue.handledCount();
            info = await queue.getInfo();
            expect(count).to.be.eql(3);
            expect(info.totalRequestCount).to.be.eql(3);
            expect(info.pendingRequestCount).to.be.eql(0);
            expect(info.handledRequestCount).to.be.eql(3);
        });

        it('deprecated delete() still works', async () => {
            const rq = new RequestQueueLocal('to-delete', LOCAL_STORAGE_DIR);
            await rq.addRequest({ url: 'https://example.com' });

            const rqDir = path.join(LOCAL_STORAGE_DIR, LOCAL_STORAGE_SUBDIR, 'to-delete');
            expectDirNonEmpty(rqDir);
            await rq.delete();
            expectDirEmpty(rqDir);
        });
    });

    describe('remote', async () => {
        it('should work', async () => {
            expectNotUsingLocalStorage();

            const { Request } = Apify;

            const clientKey = 'my-client';
            const queue = new RequestQueue('some-id', undefined, clientKey);
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

            expect(requestA.id).to.eql('a');
            expect(requestA.uniqueKey).to.eql('http://example.com/a');
            expect(queueOperationInfo1).to.include({
                wasAlreadyPresent: false,
                wasAlreadyHandled: false,
                requestId: 'a',
            });
            expect(queueOperationInfo1.request).to.include({
                id: 'a',
            });
            expect(queue.queueHeadDict.length()).to.be.eql(1);

            // Try to add again the a request with the same URL
            const copyOfRequest = { url: 'http://example.com/a' };
            const queueOperationInfo2 = await queue.addRequest(copyOfRequest);
            expect(copyOfRequest.id).to.eql('a');
            expect(copyOfRequest.uniqueKey).to.eql('http://example.com/a');
            expect(queueOperationInfo2).to.include({
                wasAlreadyPresent: true,
                wasAlreadyHandled: false,
                requestId: 'a',
            });
            expect(queueOperationInfo2.request).to.include({
                id: 'a',
            });
            expect(queue.queueHeadDict.length()).to.be.eql(1);

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

            expect(queue.queueHeadDict.length()).to.be.eql(2);
            expect(queue.inProgressCount()).to.be.eql(0);

            // Forefronted request was added to the queue.
            mock.expects('getRequest')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    requestId: 'b',
                })
                .returns(Promise.resolve(_.extend(requestB, { id: 'b' })));
            const requestBFromQueue = await queue.fetchNextRequest();
            expect(requestBFromQueue).to.be.eql(requestB);
            expect(queue.queueHeadDict.length()).to.be.eql(1);
            expect(queue.inProgressCount()).to.be.eql(1);

            // Test validations
            await queue.markRequestHandled(new Request({ id: 'XXX', url: 'dummy' }))
                .catch(err => expect(err.message).to.match(/Cannot mark request XXX as handled, because it is not in progress/));
            await queue.reclaimRequest(new Request({ id: 'XXX', url: 'dummy' }))
                .catch(err => expect(err.message).to.match(/Cannot reclaim request XXX, because it is not in progress/));
            await queue.addRequest(new Request({ id: 'id-already-set', url: 'dummy' }))
                .catch(err => expect(err.message).to.match(/Request already has the "id" field set so it cannot be added to the queue/));

            // getRequest() returns null if object was not found.
            mock.expects('getRequest')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    requestId: 'non-existent',
                })
                .returns(Promise.resolve(null));
            const requestXFromQueue = await queue.getRequest('non-existent');
            expect(requestXFromQueue).to.be.eql(null);

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
            expect(queue.queueHeadDict.length()).to.be.eql(1);
            expect(queue.inProgressCount()).to.be.eql(1);
            await Apify.utils.sleep(STORAGE_CONSISTENCY_DELAY_MILLIS + 10);
            expect(queue.queueHeadDict.length()).to.be.eql(2);
            expect(queue.inProgressCount()).to.be.eql(0);

            // Fetch again.
            mock.expects('getRequest')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    requestId: 'b',
                })
                .returns(Promise.resolve(_.extend(requestB, { id: 'b' })));
            const requestBFromQueue2 = await queue.fetchNextRequest();
            expect(requestBFromQueue2).to.be.eql(requestB);
            expect(queue.queueHeadDict.length()).to.be.eql(1);
            expect(queue.inProgressCount()).to.be.eql(1);

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
            expect(queue.queueHeadDict.length()).to.be.eql(1);
            expect(queue.inProgressCount()).to.be.eql(0);

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
            expect(requestAFromQueue).to.be.eql(requestA);
            expect(queue.queueHeadDict.length()).to.be.eql(1);
            expect(queue.inProgressCount()).to.be.eql(1);

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

        it('should cache new requests locally', async () => {
            expectNotUsingLocalStorage();

            const { Request } = Apify;

            const clientKey = 'my-client';
            const queue = new RequestQueue('some-id', undefined, clientKey);
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
            expect(await queue.addRequest(requestB)).to.be.eql({
                requestId: 'a',
                wasAlreadyPresent: true,
                wasAlreadyHandled: false,
                request: requestB,
            });

            mock.verify();
            mock.restore();
        });

        it('should cache requests locally with info if request was already handled', async () => {
            expectNotUsingLocalStorage();

            const { Request } = Apify;

            const clientKey = 'my-client';
            const queue = new RequestQueue('some-id', undefined, clientKey);
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
            expect(await queue.addRequest(requestY)).to.be.eql({
                requestId: 'x',
                wasAlreadyPresent: true,
                wasAlreadyHandled: true,
                request: requestY,
            });

            mock.verify();
            mock.restore();
        });

        it('should cache requests from queue head', async () => {
            expectNotUsingLocalStorage();

            const { Request } = Apify;

            const clientKey = 'my-client';
            const queue = new RequestQueue('some-id', 'some-name', clientKey);
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
            expect(await queue.isEmpty()).to.be.eql(false);

            // Add request A and addRequest is not called because was already cached.
            const requestA = new Request({ url: 'http://example.com/a', uniqueKey: 'aaa' });
            mock.expects('addRequest').never();
            expect(await queue.addRequest(requestA)).to.be.eql({
                requestId: 'a',
                wasAlreadyPresent: true,
                wasAlreadyHandled: false,
                request: requestA,
            });

            mock.verify();
            mock.restore();
        });

        it('should handle situation when newly created request is not available yet', async () => {
            expectNotUsingLocalStorage();

            const { Request } = Apify;

            const clientKey = 'my-client';
            const queue = new RequestQueue('some-id', 'some-name', clientKey);
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
            expect(queue.queueHeadDict.length()).to.be.eql(1);

            // Try to get requestA which is not available yet.
            mock.expects('getRequest')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    requestId: 'a',
                })
                .returns(Promise.resolve(null));
            expect(await queue.fetchNextRequest()).to.be.eql(null);

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
            expect(await queue.fetchNextRequest()).to.be.eql(requestA);

            mock.verify();
            mock.restore();
        });

        it('should not add handled request to queue head dict', async () => {
            expectNotUsingLocalStorage();

            const { Request } = Apify;

            const clientKey = 'my-client';
            const queue = new RequestQueue('some-id', 'some-name', clientKey);
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
            expect(await queue.fetchNextRequest()).to.be.eql(null);

            mock.verify();
            mock.restore();
        });

        it('should accept plain object in addRequest()', async () => {
            expectNotUsingLocalStorage();
            const clientKey = 'my-client';
            const queue = new RequestQueue('some-id', undefined, clientKey);
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

        it('should return correct handledCount', async () => {
            const stub = sinon
                .stub(apifyClient.requestQueues, 'getQueue')
                .returns(Promise.resolve({
                    handledRequestCount: 33,
                }));
            const queue = new RequestQueue('id');
            const count = await queue.handledCount();
            expect(count).to.be.eql(33);
            sinon.assert.callCount(stub, 1);
            sinon.restore();
        });

        it('should always wait for a queue head to become consistent before marking queue as finished (hadMultipleClients = true)', async () => {
            expectNotUsingLocalStorage();

            const clientKey = 'my-client';
            const queue = new RequestQueue('some-id', 'some-name', clientKey);
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

            expect(await queue.isFinished()).to.be.eql(true);

            mock.verify();
            mock.restore();
        });

        it('should always wait for a queue head to become consistent before marking queue as finished (hadMultipleClients = true)', async () => {
            expectNotUsingLocalStorage();

            const clientKey = 'my-client';
            const queueId = 'some-id';
            const queue = new RequestQueue(queueId, 'some-name', clientKey);
            const mock = sinon.mock(apifyClient.requestQueues);

            expect(queue.assumedTotalCount).to.be.eql(0);
            expect(queue.assumedHandledCount).to.be.eql(0);

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

            expect(queue.queueHeadDict.length()).to.be.eql(2);
            expect(queue.inProgressCount()).to.be.eql(0);
            expect(queue.assumedTotalCount).to.be.eql(2);
            expect(queue.assumedHandledCount).to.be.eql(0);

            // It won't query the head as there is something in progress or pending.
            mock.expects('getHead').never();
            expect(await queue.isFinished()).to.be.eql(false);

            // Fetch them from queue.
            mock.expects('getRequest').once()
                .withArgs({ queueId: 'some-id', requestId: 'b' })
                .returns(Promise.resolve(_.extend(requestB, { id: 'b' })));
            mock.expects('getRequest').once()
                .withArgs({ queueId: 'some-id', requestId: 'a' })
                .returns(Promise.resolve(_.extend(requestA, { id: 'a' })));
            const requestBFromQueue = await queue.fetchNextRequest();
            expect(requestBFromQueue).to.be.eql(requestB);
            const requestAFromQueue = await queue.fetchNextRequest();
            expect(requestAFromQueue).to.be.eql(requestA);

            expect(queue.queueHeadDict.length()).to.be.eql(0);
            expect(queue.inProgressCount()).to.be.eql(2);
            expect(queue.assumedTotalCount).to.be.eql(2);
            expect(queue.assumedHandledCount).to.be.eql(0);

            // It won't query the head as there is something in progress or pending.
            mock.expects('getHead').never();
            expect(await queue.isFinished()).to.be.eql(false);

            // Reclaim one and mark another one handled.
            mock.expects('updateRequest').once()
                .withArgs({ queueId, request: requestB, clientKey })
                .returns(Promise.resolve({ requestId: requestB.id, wasAlreadyHandled: false, wasAlreadyPresent: true, request: requestB }));
            await queue.markRequestHandled(requestB);
            mock.expects('updateRequest').once()
                .withArgs({ queueId, request: requestA, forefront: true, clientKey })
                .returns(Promise.resolve({ requestId: requestA.id, wasAlreadyHandled: false, wasAlreadyPresent: true, request: requestA }));
            await queue.reclaimRequest(requestA, { forefront: true });
            expect(queue.queueHeadDict.length()).to.be.eql(0);
            expect(queue.inProgressCount()).to.be.eql(1);
            expect(queue.assumedTotalCount).to.be.eql(2);
            expect(queue.assumedHandledCount).to.be.eql(1);
            await Apify.utils.sleep(STORAGE_CONSISTENCY_DELAY_MILLIS + 10);
            expect(queue.queueHeadDict.length()).to.be.eql(1);
            expect(queue.inProgressCount()).to.be.eql(0);
            expect(queue.assumedTotalCount).to.be.eql(2);
            expect(queue.assumedHandledCount).to.be.eql(1);

            // It won't query the head as there is something in progress or pending.
            mock.expects('getHead').never();
            expect(await queue.isFinished()).to.be.eql(false);

            // Fetch again.
            mock.expects('getRequest').once()
                .withArgs({ queueId: 'some-id', requestId: 'a' })
                .returns(Promise.resolve(_.extend(requestA, { id: 'a' })));
            const requestAFromQueue2 = await queue.fetchNextRequest();
            expect(requestAFromQueue2).to.be.eql(requestA);

            expect(queue.queueHeadDict.length()).to.be.eql(0);
            expect(queue.inProgressCount()).to.be.eql(1);
            expect(queue.assumedTotalCount).to.be.eql(2);
            expect(queue.assumedHandledCount).to.be.eql(1);

            // It won't query the head as there is something in progress or pending.
            mock.expects('getHead').never();
            expect(await queue.isFinished()).to.be.eql(false);

            // Mark handled.
            mock.expects('updateRequest').once()
                .withArgs({ queueId, request: requestA, clientKey })
                .returns(Promise.resolve({ requestId: requestA.id, wasAlreadyHandled: false, wasAlreadyPresent: true, request: requestA }));
            await queue.markRequestHandled(requestA);

            expect(queue.queueHeadDict.length()).to.be.eql(0);
            expect(queue.inProgressCount()).to.be.eql(0);
            expect(queue.assumedTotalCount).to.be.eql(2);
            expect(queue.assumedHandledCount).to.be.eql(2);

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

            expect(await queue.isFinished()).to.be.eql(true);

            mock.verify();
            mock.restore();
        });

        it('getInfo() should work', async () => {
            const queue = new RequestQueue('some-id', 'some-name');
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

            expect(result).to.be.eql(expected);

            mock.verify();
            mock.restore();
        });

        it('deprecated delete() still works', async () => {
            const mock = sinon.mock(apifyClient.requestQueues);
            const rq = new RequestQueue('some-id', 'some-name');
            mock.expects('deleteQueue')
                .once()
                .withArgs({ queueId: 'some-id' })
                .resolves();

            await rq.drop();

            mock.verify();
        });
    });

    describe('Apify.openRequestQueue', async () => {
        it('should work', () => {
            const mock = sinon.mock(utils);

            process.env[ENV_VARS.LOCAL_STORAGE_DIR] = LOCAL_STORAGE_DIR;

            mock.expects('openLocalStorage').once();
            Apify.openRequestQueue();

            mock.expects('openLocalStorage').once();
            Apify.openRequestQueue('xxx');
            mock.expects('openRemoteStorage').once();
            Apify.openRequestQueue('xxx', { forceCloud: true });

            delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
            process.env[ENV_VARS.TOKEN] = 'xxx';

            mock.expects('openRemoteStorage').once();
            Apify.openRequestQueue();

            delete process.env[ENV_VARS.TOKEN];

            mock.verify();
            mock.restore();
        });
    });
});
