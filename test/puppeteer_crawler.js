import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import log from 'apify-shared/log';
import 'babel-polyfill';
import { ENV_VARS } from '../build/constants';
import * as Apify from '../build/index';

chai.use(chaiAsPromised);

describe('PuppeteerCrawler', () => {
    let prevEnvHeadless;

    before(() => {
        prevEnvHeadless = process.env[ENV_VARS.HEADLESS];
        process.env[ENV_VARS.HEADLESS] = '1';
    });

    after(() => {
        process.env[ENV_VARS.HEADLESS] = prevEnvHeadless;
    });

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
        const failed = [];
        const requestList = new Apify.RequestList({ sources });
        const handlePageFunction = async ({ page, request, response }) => {
            await page.waitFor('title');

            expect(await response.status()).to.be.eql(200);
            request.userData.title = await page.title();
            processed.push(request);
        };

        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            minConcurrency: 1,
            maxConcurrency: 1,
            handlePageFunction,
            handleFailedRequestFunction: ({ request }) => failed.push(request),
        });

        await requestList.initialize();
        await puppeteerCrawler.run();

        expect(processed).to.have.lengthOf(6);
        expect(failed).to.have.lengthOf(0);

        processed.forEach((request, id) => {
            expect(request.url).to.be.eql(sources[id].url);
            expect(request.userData.title).to.be.eql('Example Domain');
        });
    });

    it('should only log when page.close() rejects', async () => {
        const sources = [
            { url: 'http://example.com/?q=1' },
        ];
        const failed = [];
        const errors = [];
        const expectErrorMsgString = 'failed';
        const expectErrorDataString = 'my_rejection';

        const logger = (message, data) => {
            errors.push({ message, data });
        };

        const originalLogger = log.debug;
        log.debug = logger;

        const requestList = new Apify.RequestList({ sources });
        const handlePageFunction = ({ page }) => {
            page.close = () => {
                return Promise.reject(new Error('my_rejection'));
            };

            return Promise.resolve();
        };

        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            handlePageFunction,
            handleFailedRequestFunction: ({ request }) => {
                failed.push(request);
            },
            pageCloseTimeoutMillis: 1000,
        });

        await requestList.initialize();
        await puppeteerCrawler.run();

        expect(failed).to.have.lengthOf(0);
        expect(errors.length).to.be.greaterThan(0);
        expect(errors[0].message).to.include(expectErrorMsgString);
        expect(errors[0].data.message).to.include(expectErrorDataString);

        log.debug = originalLogger;
    });
});
