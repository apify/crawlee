import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'babel-polyfill';
import * as Apify from '../build/index';

chai.use(chaiAsPromised);

describe('puppeteer_crawler', () => {
    it('should work', async () => {
        const sources = [
            { url: 'http://example.com/?q=1' },
            { url: 'http://example.com/?q=2' },
            { url: 'http://example.com/?q=3' },
            { url: 'http://example.com/?q=4' },
            { url: 'http://example.com/?q=5' },
            { url: 'http://example.com/?q=6' },
        ];
        const processed = [];
        const requestList = new Apify.RequestList({ sources });
        const handlePageFunction = async ({ page, request }) => {
            await page.waitFor('title');

            request.userData.title = await page.title();

            processed.push(request);
        };

        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            minConcurrency: 1,
            maxConcurrency: 1,
            handlePageFunction,
            disableProxy: true,
        });

        await puppeteerCrawler.run();

        processed.forEach((request, id) => {
            expect(request.url).to.be.eql(sources[id].url);
            expect(request.userData.title).to.be.eql('Example Domain');
        });
    });

    it('should fail when pageOpsTimeoutMillis gets exceeded', async () => {
        const sources = [
            { url: 'http://example.com/?q=1' },
        ];
        const processed = [];
        const requestList = new Apify.RequestList({ sources });
        const handlePageFunction = async ({ request }) => {
            processed.push(request);
            await new Promise(resolve => setTimeout(resolve, 1000));
        };

        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            handlePageFunction,
            disableProxy: true,
            pageOpsTimeoutMillis: 900,
        });

        await puppeteerCrawler.run();

        expect(processed[0].retryCount).to.be.eql(3);
        expect(processed[0].errorInfo).to.have.lengthOf(4);
        processed[0].errorInfo.forEach((error) => {
            expect(error).to.be.an('error');
            expect(error.message).to.include('handlePageFunction timeouted');
        });
    });
});
