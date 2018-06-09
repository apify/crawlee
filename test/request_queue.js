import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'underscore';
import 'babel-polyfill';
import sinon from 'sinon';
import path from 'path';
import { delayPromise } from 'apify-shared/utilities';
import * as Apify from '../build/index';
import { ENV_VARS } from '../build/constants';
import { apifyClient } from '../build/utils';
import { RequestQueueLocal, RequestQueue, LOCAL_EMULATION_SUBDIR, QUERY_HEAD_MIN_LENGTH } from '../build/request_queue';
import { emptyLocalEmulationSubdir, LOCAL_EMULATION_DIR, expectNotLocalEmulation, expectDirEmpty, expectDirNonEmpty } from './_helper';

chai.use(chaiAsPromised);

const expectRequestsSame = (req1, req2) => {
    expect(_.omit(req1, 'id')).to.be.eql(_.omit(req2, 'id'));
};

describe('RequestQueue', () => {
    before(() => apifyClient.setOptions({ token: 'xxx' }));
    after(() => apifyClient.setOptions({ token: undefined }));
    beforeEach(() => emptyLocalEmulationSubdir(LOCAL_EMULATION_SUBDIR));
    afterEach(() => emptyLocalEmulationSubdir(LOCAL_EMULATION_SUBDIR));

    describe('local', async () => {
        it('should work', async () => {
            const queue = new RequestQueueLocal('my-queue-0', LOCAL_EMULATION_DIR);

            await queue.addRequest(new Apify.Request({ url: 'http://example.com/first' }));
            await queue.addRequest(new Apify.Request({ url: 'http://example.com/middle' }));
            await queue.addRequest(new Apify.Request({ url: 'http://example.com/last-but-first' }), { forefront: true });

            const request3 = await queue.fetchNextRequest();
            const request1 = await queue.fetchNextRequest();
            const request2 = await queue.fetchNextRequest();

            expect(await queue.getRequest(request1.id)).to.be.eql(request1);
            expect(await queue.getRequest(request2.id)).to.be.eql(request2);
            expect(await queue.getRequest(request3.id)).to.be.eql(request3);
            expect(await queue.getRequest(request1.id)).to.not.be.eql(request3);

            expect(request3.url).to.be.eql('http://example.com/last-but-first');
            expect(request1.url).to.be.eql('http://example.com/first');
            expect(request2.url).to.be.eql('http://example.com/middle');

            expect((await queue.getRequest(request3.id)).url).to.be.eql('http://example.com/last-but-first');
            expect((await queue.getRequest(request1.id)).url).to.be.eql('http://example.com/first');
            expect((await queue.getRequest(request2.id)).url).to.be.eql('http://example.com/middle');

            expect(await queue.fetchNextRequest()).to.be.eql(null);
            expect(await queue.isEmpty()).to.be.eql(true);
            expect(await queue.isFinished()).to.be.eql(false);

            await queue.markRequestHandled(request3);
            await queue.reclaimRequest(request1);
            await queue.reclaimRequest(request2);
            expect(await queue.isEmpty()).to.be.eql(false);

            expect(await queue.fetchNextRequest()).to.be.eql(request1);
            expect(await queue.fetchNextRequest()).to.be.eql(request2);
            expect(await queue.fetchNextRequest()).to.be.eql(null);
            await queue.markRequestHandled(request1);
            await queue.markRequestHandled(request2);

            expect(await queue.isEmpty()).to.be.eql(true);
            expect(await queue.isFinished()).to.be.eql(true);

            // Delete it.
            const queueDir = path.join(LOCAL_EMULATION_DIR, LOCAL_EMULATION_SUBDIR, 'my-queue-0');
            expectDirNonEmpty(queueDir);
            await queue.delete();
            expectDirEmpty(queueDir);
        });

        it('supports forefront param in reclaimRequest()', async () => {
            const queue = new RequestQueueLocal('my-queue-1', LOCAL_EMULATION_DIR);

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
            const queue = new RequestQueueLocal('my-queue-2', LOCAL_EMULATION_DIR);
            await queue.addRequest(request1);
            await queue.addRequest(request2);
            await queue.addRequest(request3, { forefront: true });
            const freshRequest3 = await queue.fetchNextRequest();
            const freshRequest1 = await queue.fetchNextRequest();
            expectRequestsSame(freshRequest3, request3);
            expectRequestsSame(freshRequest1, request1);
            await queue.markRequestHandled(freshRequest1);

            // Now do the same with another queue.
            const anotherQueue = new RequestQueueLocal('my-queue-2', LOCAL_EMULATION_DIR);
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
    });

    describe('remote', async () => {
        it('should work', async () => {
            expectNotLocalEmulation();

            const { Request } = Apify;

            const queue = new RequestQueue('some-id');
            const mock = sinon.mock(apifyClient.requestQueues);

            const requestA = new Request({ url: 'http://example.com/a' });
            mock.expects('addRequest')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    request: requestA,
                    forefront: false,
                })
                .returns(Promise.resolve({ requestId: 'a', wasAlreadyHandled: false, wasAlreadyPresent: false }));
            await queue.addRequest(requestA);

            const requestB = new Request({ url: 'http://example.com/b' });
            mock.expects('addRequest')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    request: requestB,
                    forefront: true,
                })
                .returns(Promise.resolve({ requestId: 'b', wasAlreadyHandled: false, wasAlreadyPresent: false }));
            await queue.addRequest(requestB, { forefront: true });
            expect(queue.queueHeadDict.length()).to.be.eql(1);
            expect(queue.inProgressCount).to.be.eql(0);

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
            expect(queue.queueHeadDict.length()).to.be.eql(0);
            expect(queue.inProgressCount).to.be.eql(1);

            // Reclaim it.
            mock.expects('updateRequest')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    request: requestB,
                    forefront: true,
                })
                .returns(Promise.resolve({ requestId: requestB.id, wasAlreadyHandled: false, wasAlreadyPresent: true }));
            await queue.reclaimRequest(requestB, { forefront: true });
            expect(queue.queueHeadDict.length()).to.be.eql(1);
            expect(queue.inProgressCount).to.be.eql(0);

            // Fetch again.
            expect(queue.queueHeadDict.length()).to.be.eql(1);
            mock.expects('getRequest')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    requestId: 'b',
                })
                .returns(Promise.resolve(_.extend(requestB, { id: 'b' })));
            const requestBFromQueue2 = await queue.fetchNextRequest();
            expect(requestBFromQueue2).to.be.eql(requestB);
            expect(queue.queueHeadDict.length()).to.be.eql(0);
            expect(queue.inProgressCount).to.be.eql(1);

            // Mark handled.
            mock.expects('updateRequest')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    request: requestB,
                })
                .returns(Promise.resolve({ requestId: requestB.id, wasAlreadyHandled: false, wasAlreadyPresent: true }));
            await queue.markRequestHandled(requestB);
            expect(queue.queueHeadDict.length()).to.be.eql(0);
            expect(queue.inProgressCount).to.be.eql(0);

            // Query queue head.
            mock.expects('getHead')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    limit: QUERY_HEAD_MIN_LENGTH,
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
            expect(queue.inProgressCount).to.be.eql(1);

            // Delete queue.
            mock.expects('deleteQueue')
                .once()
                .withArgs({
                    queueId: 'some-id',
                })
                .returns(Promise.resolve());
            await queue.delete();

            mock.verify();
            mock.restore();
        });

        it('should cache requests new locally', async () => {
            expectNotLocalEmulation();

            const { Request } = Apify;

            const queue = new RequestQueue('some-id');
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
                })
                .returns(Promise.resolve({
                    requestId: 'a',
                    wasAlreadyHandled: false,
                    wasAlreadyPresent: false,
                }));
            await queue.addRequest(requestA);

            // Add request B that has same unique so that addRequest() is not called because it's already cached.
            mock.expects('addRequest').never();
            expect(await queue.addRequest(requestB)).to.be.eql({
                requestId: 'a',
                wasAlreadyPresent: true,
                wasAlreadyHandled: false,
            });

            mock.verify();
            mock.restore();
        });

        it('should cache requests locally with info if request was already handled', async () => {
            expectNotLocalEmulation();

            const { Request } = Apify;

            const queue = new RequestQueue('some-id');
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
                })
                .returns(Promise.resolve({
                    requestId: 'x',
                    wasAlreadyHandled: true,
                    wasAlreadyPresent: true,
                }));
            await queue.addRequest(requestX);

            // Add request Y that has same unique so that addRequest() is not called because it's already cached.
            mock.expects('addRequest').never();
            expect(await queue.addRequest(requestY)).to.be.eql({
                requestId: 'x',
                wasAlreadyPresent: true,
                wasAlreadyHandled: true,
            });

            mock.verify();
            mock.restore();
        });

        it('should cache requests from queue head', async () => {
            expectNotLocalEmulation();

            const { Request } = Apify;

            const queue = new RequestQueue('some-id');
            const mock = sinon.mock(apifyClient.requestQueues);

            // Query queue head with request A
            mock.expects('getHead')
                .once()
                .withArgs({
                    queueId: 'some-id',
                    limit: QUERY_HEAD_MIN_LENGTH,
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
            });

            mock.verify();
            mock.restore();
        });
    });

    describe('Apify.openRequestQueue', async () => {
        it('should open a local request queue when process.env[ENV_VARS.LOCAL_EMULATION_DIR] is set', async () => {
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = LOCAL_EMULATION_DIR;

            const queue = await Apify.openRequestQueue('some-id-2');
            expect(queue).to.be.instanceof(RequestQueueLocal);
            expect(queue).not.to.be.instanceof(RequestQueue);

            delete process.env[ENV_VARS.LOCAL_EMULATION_DIR];
        });

        it('should reuse cached request queue instances', async () => {
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = LOCAL_EMULATION_DIR;

            const queue1 = await Apify.openRequestQueue('some-id-3');
            const queue2 = await Apify.openRequestQueue('some-id-3');
            const queue3 = new RequestQueueLocal('some-id-3', LOCAL_EMULATION_DIR);

            expect(queue1).to.be.instanceof(RequestQueueLocal);
            expect(queue2).to.be.instanceof(RequestQueueLocal);
            expect(queue3).to.be.instanceof(RequestQueueLocal);

            expect(queue1).to.be.equal(queue2);
            expect(queue1).not.to.be.equal(queue3);

            delete process.env[ENV_VARS.LOCAL_EMULATION_DIR];

            // Here must be some timeout to don't finish before initialization of queues finishes.
            // Otherwise we delete the directory and scandir will throw ENOENT: no such file or directory
            await delayPromise(100);
        });

        it('should open default request queue when queueIdOrName is not provided', async () => {
            process.env[ENV_VARS.DEFAULT_REQUEST_QUEUE_ID] = 'some-id-4';
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = LOCAL_EMULATION_DIR;

            const queue = await Apify.openRequestQueue();
            expect(queue.queueId).to.be.eql('some-id-4');
            expect(queue).to.be.instanceof(RequestQueueLocal);

            delete process.env[ENV_VARS.LOCAL_EMULATION_DIR];
            process.env[ENV_VARS.DEFAULT_REQUEST_QUEUE_ID] = 'some-id-5';
            expectNotLocalEmulation();

            const queue2 = await Apify.openRequestQueue();
            expect(queue2.queueId).to.be.eql('some-id-5');
            expect(queue2).to.be.instanceof(RequestQueue);

            delete process.env[ENV_VARS.DEFAULT_REQUEST_QUEUE_ID];
        });

        it('should open remote queue when process.env[ENV_VARS.LOCAL_EMULATION_DIR] is NOT set', async () => {
            expectNotLocalEmulation();

            const mock = sinon.mock(apifyClient.requestQueues);

            // First when used with id it only requests store object.
            mock.expects('getQueue')
                .once()
                .withArgs({ queueId: 'some-id-6' })
                .returns(Promise.resolve({ id: 'some-id-6' }));
            const queue = await Apify.openRequestQueue('some-id-6');
            expect(queue.queueId).to.be.eql('some-id-6');
            expect(queue).to.be.instanceof(RequestQueue);

            // Then used with name it requests store object, gets empty response
            // so then it creates queue.
            mock.expects('getQueue')
                .once()
                .withArgs({ queueId: 'some-name-7' })
                .returns(Promise.resolve(null));
            mock.expects('getOrCreateQueue')
                .once()
                .withArgs({ queueName: 'some-name-7' })
                .returns(Promise.resolve({ id: 'some-id-7' }));

            const queue2 = await Apify.openRequestQueue('some-name-7');
            expect(queue2.queueId).to.be.eql('some-id-7');
            expect(queue2).to.be.instanceof(RequestQueue);

            mock.verify();
            mock.restore();
        });
    });
});
