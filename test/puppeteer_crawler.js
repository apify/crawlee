import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import log from 'apify-shared/log';
import { ENV_VARS } from 'apify-shared/consts';
import * as Apify from '../build/index';

chai.use(chaiAsPromised);

describe('PuppeteerCrawler', () => {
    let prevEnvHeadless;
    let logLevel;

    before(() => {
        prevEnvHeadless = process.env[ENV_VARS.HEADLESS];
        process.env[ENV_VARS.HEADLESS] = '1';
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    after(() => {
        log.setLevel(logLevel);
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

    it('should ignore errors in Page.close()', async () => {
        for (let i = 0; i < 2; i++) {
            const requestList = new Apify.RequestList({
                sources: [
                    { url: 'http://example.com/?q=1' },
                ],
            });
            let failedCalled = false;

            const puppeteerCrawler = new Apify.PuppeteerCrawler({
                requestList,
                handlePageFunction: ({ page }) => {
                    page.close = () => {
                        if (i === 0) {
                            throw new Error();
                        } else {
                            return Promise.reject(new Error());
                        }
                    };
                    return Promise.resolve();
                },
                handleFailedRequestFunction: async () => {
                    failedCalled = true;
                },
            });

            await requestList.initialize();
            await puppeteerCrawler.run();

            expect(failedCalled).to.eql(false);
        }
    });
});
