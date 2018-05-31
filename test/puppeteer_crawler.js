import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
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

    it('should fail when pageCloseTimeoutMillis gets exceeded', async () => {
        const sources = [
            { url: 'http://example.com/?q=1' },
        ];
        const failed = [];
        const errors = [];
        const expectErrorMsgString = 'timed out';
        const requestList = new Apify.RequestList({ sources });
        const handlePageFunction = ({ page }) => {
            page.close = () => {
                return new Promise(() => {}); // This will never resolve.
            };

            return Promise.resolve();
        };

        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            handlePageFunction,
            handleFailedRequestFunction: ({ request, error }) => {
                console.log(errors);

                failed.push(request);
                errors.push(error);
            },
            pageCloseTimeoutMillis: 1000,
        });

        await requestList.initialize();
        await puppeteerCrawler.run();

        expect(failed).to.have.lengthOf(1);
        expect(failed[0].retryCount).to.be.eql(3);
        expect(failed[0].errorMessages).to.have.lengthOf(4);
        failed[0].errorMessages.forEach((error) => {
            expect(error).to.be.a('string');
            expect(error).to.include(expectErrorMsgString);
        });
        errors.forEach((error) => {
            expect(error).to.be.an('error');
            expect(error.message).to.include(expectErrorMsgString);
        });
    });
});
