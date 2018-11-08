import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'underscore';
import 'babel-polyfill';
import sinon from 'sinon';
import log from 'apify-shared/log';
import { delayPromise } from 'apify-shared/utilities';
import * as Apify from '../build/index';
import { RequestQueue, RequestQueueLocal } from '../build/request_queue';
import { LOCAL_STORAGE_DIR } from './_helper';

chai.use(chaiAsPromised);

describe('BasicCrawler', () => {
    let logLevel;

    before(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.OFF);
    });

    after(() => {
        log.setLevel(logLevel);
    });

    it('should run in parallel thru all the requests', async () => {
        const startedAt = Date.now();
        const sources = _.range(0, 500).map(index => ({ url: `https://example.com/${index}` }));

        const processed = [];
        const requestList = new Apify.RequestList({ sources });
        const handleRequestFunction = async ({ request }) => {
            await delayPromise(10);
            processed.push(_.pick(request, 'url'));
        };

        const basicCrawler = new Apify.BasicCrawler({
            requestList,
            minConcurrency: 25,
            maxConcurrency: 25,
            handleRequestFunction,
        });

        await requestList.initialize();
        await basicCrawler.run();

        expect(processed).to.be.eql(sources);
        expect(Date.now() - startedAt).to.be.within(200, 1000);
        expect(await requestList.isFinished()).to.be.eql(true);
        expect(await requestList.isEmpty()).to.be.eql(true);
    });

    it('should abort and resume', async () => {
        const sources = _.range(500).map(index => ({ url: `https://example.com/${index + 1}` }));

        let basicCrawler;
        let isStopped;
        const processed = [];
        const requestList = new Apify.RequestList({ sources });
        const handleRequestFunction = async ({ request }) => {
            if (request.url.endsWith('200') && !isStopped) {
                await basicCrawler.abort();
                isStopped = true;
            } else {
                await delayPromise(10);
                processed.push(_.pick(request, 'url'));
            }
        };

        basicCrawler = new Apify.BasicCrawler({
            requestList,
            minConcurrency: 25,
            maxConcurrency: 25,
            handleRequestFunction,
        });

        await requestList.initialize();

        // The crawler will stop after 200 requests
        await basicCrawler.run();

        expect(processed.length).to.be.within(175, 200);
        expect(await requestList.isFinished()).to.be.eql(false);
        expect(await requestList.isEmpty()).to.be.eql(false);

        await basicCrawler.run();
        expect(processed.length).to.be.within(500, 525);
        expect(new Set(processed.map(p => p.url))).to.be.eql(new Set(sources.map(s => s.url)));
        expect(await requestList.isFinished()).to.be.eql(true);
        expect(await requestList.isEmpty()).to.be.eql(true);
    });

    it('should retry failed requests', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
        ];
        const processed = {};
        const requestList = new Apify.RequestList({ sources });

        const handleRequestFunction = async ({ request }) => {
            await delayPromise(10);
            processed[request.url] = request;

            if (request.url === 'http://example.com/2') {
                throw Error(`This is ${request.retryCount}th error!`);
            }

            request.userData.foo = 'bar';
        };

        const basicCrawler = new Apify.BasicCrawler({
            requestList,
            maxRequestRetries: 10,
            minConcurrency: 3,
            maxConcurrency: 3,
            handleRequestFunction,
        });

        await requestList.initialize();
        await basicCrawler.run();

        expect(processed['http://example.com/1'].userData.foo).to.be.eql('bar');
        expect(processed['http://example.com/1'].errorMessages).to.be.a('null');
        expect(processed['http://example.com/1'].retryCount).to.be.eql(0);
        expect(processed['http://example.com/3'].userData.foo).to.be.eql('bar');
        expect(processed['http://example.com/3'].errorMessages).to.be.a('null');
        expect(processed['http://example.com/3'].retryCount).to.be.eql(0);

        expect(processed['http://example.com/2'].userData.foo).to.be.a('undefined');
        expect(processed['http://example.com/2'].errorMessages).to.have.lengthOf(11);
        expect(processed['http://example.com/2'].retryCount).to.be.eql(10);

        expect(await requestList.isFinished()).to.be.eql(true);
        expect(await requestList.isEmpty()).to.be.eql(true);
    });

    it('should not retry requests with retry set to false ', async () => {
        const sources = [
            { url: 'http://example.com/1', retry: false },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3', retry: false },
        ];
        const processed = {};
        const requestList = new Apify.RequestList({ sources });

        const handleRequestFunction = async ({ request }) => {
            await delayPromise(10);
            processed[request.url] = request;
            request.userData.foo = 'bar';
            throw Error(`This is ${request.retryCount}th error!`);
        };

        let handleFailedRequestFunctionCalls = 0;
        const handleFailedRequestFunction = () => {
            handleFailedRequestFunctionCalls++;
        };

        const basicCrawler = new Apify.BasicCrawler({
            requestList,
            maxRequestRetries: 10,
            minConcurrency: 3,
            maxConcurrency: 3,
            handleRequestFunction,
            handleFailedRequestFunction,
        });

        await requestList.initialize();
        await basicCrawler.run();

        expect(processed['http://example.com/1'].userData.foo).to.be.eql('bar');
        expect(processed['http://example.com/1'].errorMessages).to.have.lengthOf(1);
        expect(processed['http://example.com/1'].retryCount).to.be.eql(0);
        expect(processed['http://example.com/3'].userData.foo).to.be.eql('bar');
        expect(processed['http://example.com/3'].errorMessages).to.have.lengthOf(1);
        expect(processed['http://example.com/3'].retryCount).to.be.eql(0);

        expect(processed['http://example.com/2'].userData.foo).to.be.eql('bar');
        expect(processed['http://example.com/2'].errorMessages).to.have.lengthOf(11);
        expect(processed['http://example.com/2'].retryCount).to.be.eql(10);

        expect(handleFailedRequestFunctionCalls).to.be.eql(3);

        expect(await requestList.isFinished()).to.be.eql(true);
        expect(await requestList.isEmpty()).to.be.eql(true);
    });

    it('should allow to handle failed requests', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
        ];
        const processed = {};
        const failed = {};
        const errors = [];
        const requestList = new Apify.RequestList({ sources });

        const handleRequestFunction = async ({ request }) => {
            await Promise.reject(new Error('some-error'));
            processed[request.url] = request;
        };

        const handleFailedRequestFunction = async ({ request, error }) => {
            failed[request.url] = request;
            errors.push(error);
        };

        const basicCrawler = new Apify.BasicCrawler({
            requestList,
            handleRequestFunction,
            handleFailedRequestFunction,
        });

        await requestList.initialize();
        await basicCrawler.run();

        expect(failed['http://example.com/1'].errorMessages).to.have.lengthOf(4);
        expect(failed['http://example.com/1'].retryCount).to.be.eql(3);
        expect(failed['http://example.com/2'].errorMessages).to.have.lengthOf(4);
        expect(failed['http://example.com/2'].retryCount).to.be.eql(3);
        expect(failed['http://example.com/3'].errorMessages).to.have.lengthOf(4);
        expect(failed['http://example.com/3'].retryCount).to.be.eql(3);
        expect(_.values(failed)).to.have.length.of(3);
        expect(_.values(processed)).to.have.length.of(0);
        expect(await requestList.isFinished()).to.be.eql(true);
        expect(await requestList.isEmpty()).to.be.eql(true);
        errors.forEach(error => expect(error).to.be.an('error'));
    });

    it('should require at least one of RequestQueue and RequestList', () => {
        const requestList = new Apify.RequestList({ sources: [] });
        const requestQueue = new RequestQueue('xxx');
        const handleRequestFunction = () => {};

        expect(() => new Apify.BasicCrawler({ handleRequestFunction })).to.throw();
        expect(() => new Apify.BasicCrawler({ handleRequestFunction, requestList })).to.not.throw();
        expect(() => new Apify.BasicCrawler({ handleRequestFunction, requestQueue })).to.not.throw();
        expect(() => new Apify.BasicCrawler({ handleRequestFunction, requestQueue, requestList })).to.not.throw();
    });

    it('should also support RequestQueueLocal', () => {
        const requestQueue = new RequestQueue('xxx');
        const requestQueueLocal = new RequestQueueLocal('xxx', LOCAL_STORAGE_DIR);
        const handleRequestFunction = () => {};

        expect(() => new Apify.BasicCrawler({ handleRequestFunction, requestQueue })).to.not.throw();
        expect(() => new Apify.BasicCrawler({ handleRequestFunction, requestQueue: requestQueueLocal })).to.not.throw();
    });

    it('should correctly combine RequestList and RequestQueue', async () => {
        const sources = [
            { url: 'http://example.com/0' },
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
        ];
        const processed = {};
        const requestList = new Apify.RequestList({ sources });
        const requestQueue = new RequestQueue('xxx');

        const handleRequestFunction = async ({ request }) => {
            await delayPromise(10);
            processed[request.url] = request;

            if (request.url === 'http://example.com/1') {
                throw Error(`This is ${request.retryCount}th error!`);
            }

            request.userData.foo = 'bar';
        };

        const basicCrawler = new Apify.BasicCrawler({
            requestList,
            requestQueue,
            maxRequestRetries: 3,
            minConcurrency: 1,
            maxConcurrency: 1,
            handleRequestFunction,
        });

        // It enqueues all requests from RequestList to RequestQueue.
        const mock = sinon.mock(requestQueue);
        mock.expects('addRequest')
            .once()
            .withArgs(new Apify.Request(sources[0]), { forefront: true })
            .returns(Promise.resolve({ requestId: 'id-0' }));
        mock.expects('addRequest')
            .once()
            .withArgs(new Apify.Request(sources[1]), { forefront: true })
            .returns(Promise.resolve({ requestId: 'id-1' }));
        mock.expects('addRequest')
            .once()
            .withArgs(new Apify.Request(sources[2]), { forefront: true })
            .returns(Promise.resolve({ requestId: 'id-2' }));

        const request0 = new Apify.Request(Object.assign({ id: 'id-0' }, sources[0]));
        const request1 = new Apify.Request(Object.assign({ id: 'id-1' }, sources[1]));
        const request2 = new Apify.Request(Object.assign({ id: 'id-2' }, sources[2]));

        // 1st try
        mock.expects('fetchNextRequest').once().returns(Promise.resolve(request0));
        mock.expects('fetchNextRequest').once().returns(Promise.resolve(request1));
        mock.expects('fetchNextRequest').once().returns(Promise.resolve(request2));
        mock.expects('markRequestHandled')
            .once()
            .withArgs(request0)
            .returns(Promise.resolve());
        mock.expects('reclaimRequest')
            .once()
            .withArgs(request1)
            .returns(Promise.resolve());
        mock.expects('markRequestHandled')
            .once()
            .withArgs(request2)
            .returns(Promise.resolve());

        // 2nd try
        mock.expects('fetchNextRequest')
            .once()
            .returns(Promise.resolve(request1));
        mock.expects('reclaimRequest')
            .once()
            .withArgs(request1)
            .returns(Promise.resolve());

        // 3rd try
        mock.expects('fetchNextRequest')
            .once()
            .returns(Promise.resolve(request1));
        mock.expects('reclaimRequest')
            .once()
            .withArgs(request1)
            .returns(Promise.resolve());

        // 4rd try
        mock.expects('fetchNextRequest')
            .once()
            .returns(Promise.resolve(request1));
        mock.expects('markRequestHandled')
            .once()
            .withArgs(request1)
            .returns(Promise.resolve());

        mock.expects('isEmpty')
            .exactly(3)
            .returns(Promise.resolve(false));
        mock.expects('isEmpty')
            .once()
            .returns(Promise.resolve(true));
        mock.expects('isFinished')
            .once()
            .returns(Promise.resolve(true));

        await requestList.initialize();
        await basicCrawler.run();

        expect(processed['http://example.com/0'].userData.foo).to.be.eql('bar');
        expect(processed['http://example.com/0'].errorMessages).to.be.a('null');
        expect(processed['http://example.com/0'].retryCount).to.be.eql(0);
        expect(processed['http://example.com/2'].userData.foo).to.be.eql('bar');
        expect(processed['http://example.com/2'].errorMessages).to.be.a('null');
        expect(processed['http://example.com/2'].retryCount).to.be.eql(0);

        expect(processed['http://example.com/1'].userData.foo).to.be.a('undefined');
        expect(processed['http://example.com/1'].errorMessages).to.have.lengthOf(4);
        expect(processed['http://example.com/1'].retryCount).to.be.eql(3);

        expect(await requestList.isFinished()).to.be.eql(true);
        expect(await requestList.isEmpty()).to.be.eql(true);

        mock.verify();
    });

    it('should say that task is not ready requestList is not set and requestQueue is empty', async () => {
        const requestQueue = new RequestQueue('xxx');
        requestQueue.isEmpty = () => Promise.resolve(true);

        const crawler = new Apify.BasicCrawler({
            requestQueue,
            handleRequestFunction: () => {},
        });

        expect(await crawler._isTaskReadyFunction()).to.be.eql(false); // eslint-disable-line no-underscore-dangle
    });

    it('should be possible to override isFinishedFunction of underlying AutoscaledPool', async () => {
        const requestQueue = new RequestQueue('xxx');
        const processed = [];
        const queue = [];
        let isFinished = false;

        const basicCrawler = new Apify.BasicCrawler({
            requestQueue,
            autoscaledPoolOptions: {
                minConcurrency: 1,
                maxConcurrency: 1,
                isFinishedFunction: () => {
                    return Promise.resolve(isFinished);
                },
            },
            handleRequestFunction: async ({ request }) => {
                await delayPromise(10);
                processed.push(request);
            },
        });

        // Speed up the test
        basicCrawler.autoscaledPoolOptions.maybeRunIntervalMillis = 50;

        const request0 = new Apify.Request({ url: 'http://example.com/0' });
        const request1 = new Apify.Request({ url: 'http://example.com/1' });

        const mock = sinon.mock(requestQueue);
        mock.expects('markRequestHandled').once().withArgs(request0).returns(Promise.resolve());
        mock.expects('markRequestHandled').once().withArgs(request1).returns(Promise.resolve());
        mock.expects('isFinished').never();
        requestQueue.fetchNextRequest = () => Promise.resolve(queue.pop());
        requestQueue.isEmpty = () => Promise.resolve(!queue.length);

        setTimeout(() => queue.push(request0), 10);
        setTimeout(() => queue.push(request1), 100);
        setTimeout(() => { isFinished = true; }, 150);

        await basicCrawler.run();

        expect(processed.includes(request0, request1)).to.be.eql(true);

        mock.verify();
    });

    it('should support maxRequestsPerCrawl parameter', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
            { url: 'http://example.com/4' },
            { url: 'http://example.com/5' },
        ];
        const processed = {};
        const requestList = new Apify.RequestList({ sources });

        const handleRequestFunction = async ({ request }) => {
            await delayPromise(10);
            processed[request.url] = request;
            if (request.url === 'http://example.com/2') throw Error();
            request.userData.foo = 'bar';
        };

        let handleFailedRequestFunctionCalls = 0;
        const handleFailedRequestFunction = () => {
            handleFailedRequestFunctionCalls++;
        };

        const basicCrawler = new Apify.BasicCrawler({
            requestList,
            maxRequestRetries: 3,
            maxRequestsPerCrawl: 3,
            maxConcurrency: 1,
            handleRequestFunction,
            handleFailedRequestFunction,
        });

        await requestList.initialize();
        await basicCrawler.run();

        expect(processed['http://example.com/1'].userData.foo).to.be.eql('bar');
        expect(processed['http://example.com/1'].errorMessages).to.be.a('null');
        expect(processed['http://example.com/1'].retryCount).to.be.eql(0);
        expect(processed['http://example.com/3'].userData.foo).to.be.eql('bar');
        expect(processed['http://example.com/3'].errorMessages).to.be.a('null');
        expect(processed['http://example.com/3'].retryCount).to.be.eql(0);

        expect(processed['http://example.com/2'].userData.foo).to.be.eql(undefined);
        expect(processed['http://example.com/2'].errorMessages).to.have.lengthOf(4);
        expect(processed['http://example.com/2'].retryCount).to.be.eql(3);

        expect(handleFailedRequestFunctionCalls).to.be.eql(1);

        expect(await requestList.isFinished()).to.be.eql(false);
        expect(await requestList.isEmpty()).to.be.eql(false);
    });
});
