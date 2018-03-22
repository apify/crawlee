import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'babel-polyfill';
import * as Apify from '../build/index';
import { apifyClient } from '../build/utils';
import { RequestQueueLocal, LOCAL_EMULATION_SUBDIR } from '../build/request_queue';
import { emptyLocalEmulationSubdir, LOCAL_EMULATION_DIR } from './_helper';

chai.use(chaiAsPromised);

describe('RequestQueue', () => {
    before(() => apifyClient.setOptions({ token: 'xxx' }));
    after(() => apifyClient.setOptions({ token: undefined }));
    beforeEach(() => emptyLocalEmulationSubdir(LOCAL_EMULATION_SUBDIR));
    afterEach(() => emptyLocalEmulationSubdir(LOCAL_EMULATION_SUBDIR));

    describe('local', async () => {
        it('should work', async () => {
            const queue = new RequestQueueLocal('my-queue', LOCAL_EMULATION_DIR);

            const request1 = new Apify.Request({ url: 'http://example.com/first' });
            const request2 = new Apify.Request({ url: 'http://example.com/middle' });
            const request3 = new Apify.Request({ url: 'http://example.com/last-but-first' });

            await queue.addRequest(request1);
            await queue.addRequest(request2);
            await queue.addRequest(request3, { putInFront: true });

            expect(await queue.getRequest(request1.uniqueKey)).to.be.eql(request1);
            expect(await queue.getRequest(request2.uniqueKey)).to.be.eql(request2);
            expect(await queue.getRequest(request3.uniqueKey)).to.be.eql(request3);
            expect(await queue.getRequest(request1.uniqueKey)).to.not.be.eql(request3);

            expect(await queue.fetchNextRequest()).to.be.eql(request3);
            expect(await queue.fetchNextRequest()).to.be.eql(request1);
            expect(await queue.fetchNextRequest()).to.be.eql(request2);
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
        });

        it('should get initialized from existing dir', async () => {
            const queue = new RequestQueueLocal('my-queue-2', LOCAL_EMULATION_DIR);

            const request1 = new Apify.Request({ url: 'http://example.com/first' });
            const request2 = new Apify.Request({ url: 'http://example.com/middle' });
            const request3 = new Apify.Request({ url: 'http://example.com/last-but-first' });

            await queue.addRequest(request1);
            await queue.addRequest(request2);
            await queue.addRequest(request3, { putInFront: true });

            expect(await queue.fetchNextRequest()).to.be.eql(request3);
            expect(await queue.fetchNextRequest()).to.be.eql(request1);
            await queue.markRequestHandled(request1);

            const anotherQueue = new RequestQueueLocal('my-queue-2', LOCAL_EMULATION_DIR);
            expect(await anotherQueue.isEmpty()).to.be.eql(false);
            expect(await anotherQueue.isFinished()).to.be.eql(false);
            expect(await anotherQueue.fetchNextRequest()).to.be.eql(request3);
            expect(await anotherQueue.fetchNextRequest()).to.be.eql(request2);
            expect(await anotherQueue.isEmpty()).to.be.eql(true);
            expect(await anotherQueue.isFinished()).to.be.eql(false);
            await anotherQueue.markRequestHandled(request2);
            await anotherQueue.markRequestHandled(request3);
            expect(await anotherQueue.isEmpty()).to.be.eql(true);
            expect(await anotherQueue.isFinished()).to.be.eql(true);
        });
    });
});
