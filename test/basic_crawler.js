import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'underscore';
import 'babel-polyfill';
import * as Apify from '../build/index';

chai.use(chaiAsPromised);

describe('basic_crawler', () => {
    it('runs in parallel thru all the requests', async () => {
        const startedAt = Date.now();
        const sources = _.range(0, 500).map(index => ({ url: `https://example.com/${index}` }));

        const processed = [];
        const requestList = new Apify.RequestList({ sources });
        const handleRequestFunction = async ({ request }) => {
            await new Promise(resolve => setTimeout(resolve, 10));
            processed.push(_.pick(request, 'url'));
        };

        const basicCrawler = new Apify.BasicCrawler({
            requestList,
            minConcurrency: 25,
            maxConcurrency: 25,
            handleRequestFunction,
        });

        await basicCrawler.run();

        expect(processed).to.be.eql(sources);
        expect(Date.now() - startedAt).to.be.within(200, 400);
    });

    it('retry works', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
        ];
        const processed = {};
        const requestList = new Apify.RequestList({ sources });
        const handleRequestFunction = async ({ request }) => {
            await new Promise(resolve => setTimeout(resolve, 10));
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

        await basicCrawler.run();

        expect(processed['http://example.com/1'].userData.foo).to.be.eql('bar');
        expect(processed['http://example.com/1'].errorInfo).to.have.lengthOf(0);
        expect(processed['http://example.com/1'].retryCount).to.be.eql(0);
        expect(processed['http://example.com/3'].userData.foo).to.be.eql('bar');
        expect(processed['http://example.com/3'].errorInfo).to.have.lengthOf(0);
        expect(processed['http://example.com/3'].retryCount).to.be.eql(0);

        expect(processed['http://example.com/2'].userData.foo).to.be.a('undefined');
        expect(processed['http://example.com/2'].errorInfo).to.have.lengthOf(11);
        expect(processed['http://example.com/2'].retryCount).to.be.eql(10);
    });
});
