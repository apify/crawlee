import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'babel-polyfill';
import fs from 'fs-extra';
import path from 'path';
// import sinon from 'sinon';
// import { leftpad } from 'apify-shared/utilities';
// import { ENV_VARS } from '../build/constants';
import { RequestQueueLocal } from '../build/request_queue';
import * as Apify from '../build/index';

chai.use(chaiAsPromised);

// TODO move this to helper.
const TMP_DIR_PATH = path.resolve('tmp');
const APIFY_LOCAL_EMULATION_DIR = path.join('tmp', 'local-emulation-dir');
const APIFY_LOCAL_EMULATION_DIR_PATH = path.resolve(APIFY_LOCAL_EMULATION_DIR);

if (!fs.existsSync(TMP_DIR_PATH)) fs.mkdirSync(TMP_DIR_PATH);
if (fs.existsSync(APIFY_LOCAL_EMULATION_DIR_PATH)) fs.removeSync(APIFY_LOCAL_EMULATION_DIR_PATH);
fs.mkdirSync(APIFY_LOCAL_EMULATION_DIR_PATH);

// const expectNotLocal = () => expect(process.env[ENV_VARS.LOCAL_EMULATION_DIR]).to.be.a('undefined');

describe('dataset', () => {
    describe('local', async () => {
        it('should work', async () => {
            const queue = new RequestQueueLocal('my-queue', APIFY_LOCAL_EMULATION_DIR);

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

            await queue.markRequestHandled(request3);
            await queue.reclaimRequest(request1);
            await queue.reclaimRequest(request2);
            expect(await queue.isEmpty()).to.be.eql(false);

            expect(await queue.fetchNextRequest()).to.be.eql(request1);
            expect(await queue.fetchNextRequest()).to.be.eql(request2);
            expect(await queue.fetchNextRequest()).to.be.eql(null);
            await queue.markRequestHandled(request1);
            await queue.markRequestHandled(request2);
        });

        it('should get initialized from existing dir', async () => {
            const queue = new RequestQueueLocal('my-queue-2', APIFY_LOCAL_EMULATION_DIR);

            const request1 = new Apify.Request({ url: 'http://example.com/first' });
            const request2 = new Apify.Request({ url: 'http://example.com/middle' });
            const request3 = new Apify.Request({ url: 'http://example.com/last-but-first' });

            await queue.addRequest(request1);
            await queue.addRequest(request2);
            await queue.addRequest(request3, { putInFront: true });

            expect(await queue.fetchNextRequest()).to.be.eql(request3);
            expect(await queue.fetchNextRequest()).to.be.eql(request1);
            await queue.markRequestHandled(request1);

            const anotherQueue = new RequestQueueLocal('my-queue-2', APIFY_LOCAL_EMULATION_DIR);
            expect(await anotherQueue.isEmpty()).to.be.eql(false);
            expect(await anotherQueue.fetchNextRequest()).to.be.eql(request3);
            expect(await anotherQueue.fetchNextRequest()).to.be.eql(request2);
            expect(await anotherQueue.isEmpty()).to.be.eql(true);
            await anotherQueue.markRequestHandled(request3);
            await anotherQueue.markRequestHandled(request3);
        });
    });
});
