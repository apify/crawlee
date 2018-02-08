import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'underscore';
import 'babel-polyfill';
import { delayPromise } from 'apify-shared/utilities';
import * as Apify from '../build/index';

chai.use(chaiAsPromised);

describe('basic_crawler', () => {
    it('runs in parallel thru all the requests', async () => {
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
        expect(Date.now() - startedAt).to.be.within(200, 400);
    });

    it('retries failed requests', async () => {
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
    });

    it('should allow to handle failed requests', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
        ];
        const processed = {};
        const failed = {};
        const requestList = new Apify.RequestList({ sources });

        const handleRequestFunction = async ({ request }) => {
            await Promise.reject(new Error('some-error'));
            processed[request.url] = request;
        };

        const handleFailedRequestFunction = async ({ request }) => {
            failed[request.url] = request;
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
    });
});
