import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'babel-polyfill';
import _ from 'underscore';
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

    it('should stop and resume', async () => {
        const comparator = (a, b) => {
            a = Number(/q=(\d+)$/.exec(a.url)[1]);
            b = Number(/q=(\d+)$/.exec(b.url)[1]);
            return a - b;
        };
        const sources = _.range(30).map(index => ({ url: `https://example.com/?q=${index + 1}` }));
        let puppeteerCrawler;
        let isStopped = false;
        const processed = [];
        const failed = [];
        const requestList = new Apify.RequestList({ sources });
        const handlePageFunction = async ({ page, request, response }) => {
            if (request.url.endsWith('15') && !isStopped) {
                await puppeteerCrawler.abort();
                isStopped = true;
            } else {
                await page.waitFor('title');
                expect(await response.status()).to.be.eql(200);
                request.userData.title = await page.title();
                processed.push(request);
            }
        };

        puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            minConcurrency: 3,
            maxConcurrency: 3,
            handlePageFunction,
            handleFailedRequestFunction: ({ request }) => failed.push(request),
        });

        await requestList.initialize();
        await puppeteerCrawler.run();

        expect(processed.length).to.be.within(12, 15);
        expect(failed).to.have.lengthOf(0);

        processed.sort(comparator);

        for (let i = 0; i < 12; i++) {
            const request = processed[i];
            expect(request.url).to.be.eql(sources[i].url);
            expect(request.userData.title).to.be.eql('Example Domain');
        }

        await Apify.utils.sleep(10); // Wait for event loop to unwind.
        await puppeteerCrawler.run();

        expect(processed.length).to.be.within(30, 33);
        expect(failed).to.have.lengthOf(0);
        expect(new Set(processed.map(p => p.url))).to.be.eql(new Set(sources.map(s => s.url)));
        processed.forEach((request) => {
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
