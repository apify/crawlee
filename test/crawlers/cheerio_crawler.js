import { expect } from 'chai';
import log from 'apify-shared/log';
import { delayPromise } from 'apify-shared/utilities';
import { ENV_VARS } from 'apify-shared/consts';
import Apify from '../../build';

// Add common props to mocked request responses.
const responseMock = {
    request: {
        gotOptions: {
            href: 'loadedUrl',
        },
    },
};

/* eslint-disable no-underscore-dangle */
describe('CheerioCrawler', () => {
    const comparator = (a, b) => {
        a = Number(/q=(\d+)$/.exec(a.url)[1]);
        b = Number(/q=(\d+)$/.exec(b.url)[1]);
        return a - b;
    };

    let logLevel;

    before(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    after(() => {
        log.setLevel(logLevel);
    });

    it('should work', async () => {
        const sources = [
            { url: 'http://www.example.com/?q=1' },
            { url: 'http://www.example.com/?q=2' },
            { url: 'http://www.example.com/?q=3' },
            { url: 'http://www.example.com/?q=4' },
            { url: 'http://www.example.com/?q=5' },
            { url: 'http://www.example.com/?q=6' },
        ];
        const processed = [];
        const failed = [];
        const requestList = new Apify.RequestList({ sources });
        const handlePageFunction = async ({ $, html, request }) => {
            request.userData.title = $('title').text();
            request.userData.html = html;
            processed.push(request);
        };

        const cheerioCrawler = new Apify.CheerioCrawler({
            requestList,
            minConcurrency: 2,
            maxConcurrency: 2,
            handlePageFunction,
            handleFailedRequestFunction: ({ request }) => failed.push(request),
        });

        await requestList.initialize();
        await cheerioCrawler.run();
        expect(processed).to.have.lengthOf(6);
        expect(failed).to.have.lengthOf(0);

        processed.sort(comparator);
        processed.forEach((request, id) => {
            expect(request.url).to.be.eql(sources[id].url);
            expect(request.userData.title).to.be.eql('Example Domain');
            expect(request.userData.html).to.be.a('string');
            expect(request.userData.html.length).not.to.be.eql(0);
        });
    });

    it('should trigger prepareRequestFunction', async () => {
        const MODIFIED_URL = 'http://example.com/?q=2';
        const sources = [
            { url: 'http://example.com/' },

        ];
        let failed = null;
        let success;
        const requestList = new Apify.RequestList({ sources });
        const handlePageFunction = async ({ request }) => { success = request; };
        await requestList.initialize();

        const cheerioCrawler = new Apify.CheerioCrawler({
            requestList,
            handlePageFunction,
            handleFailedRequestFunction: ({ request }) => {
                failed = request;
            },
            prepareRequestFunction: async ({ request }) => {
                request.url = MODIFIED_URL;
                return request;
            },
        });
        await cheerioCrawler.run();
        expect(failed).to.be.eql(null);
        expect(success.url).to.be.eql(MODIFIED_URL);
    });

    describe('should timeout', () => {
        let ll;
        before(() => {
            ll = log.getLevel();
            log.setLevel(log.LEVELS.OFF);
        });

        after(() => {
            log.setLevel(ll);
        });

        it('after requestTimeoutSecs', async () => {
            const sources = [
                { url: 'http://example.com/?q=0' },
                { url: 'http://example.com/?q=1' },
                { url: 'http://example.com/?q=2' },
            ];
            const processed = [];
            const failed = [];
            const requestList = new Apify.RequestList({ sources });
            const handlePageFunction = async ({ request }) => {
                processed.push(request);
            };

            const cheerioCrawler = new Apify.CheerioCrawler({
                requestList,
                requestTimeoutSecs: 5 / 1000,
                maxRequestRetries: 1,
                minConcurrency: 2,
                maxConcurrency: 2,
                handlePageFunction,
                handleFailedRequestFunction: ({ request }) => failed.push(request),
            });

            cheerioCrawler._requestFunction = async () => {
                await delayPromise(300);
                return '<html><head></head><body>Body</body></html>';
            };

            await requestList.initialize();
            await cheerioCrawler.run();

            expect(processed).to.have.lengthOf(0);
            expect(failed).to.have.lengthOf(3);

            failed.forEach((request) => {
                expect(request.errorMessages).to.have.lengthOf(2);
                expect(request.errorMessages[0]).to.include('requestFunction timed out');
                expect(request.errorMessages[1]).to.include('requestFunction timed out');
            });
        });

        it('after handlePageTimeoutSecs', async () => {
            const sources = [
                { url: 'http://example.com/?q=0' },
                { url: 'http://example.com/?q=1' },
                { url: 'http://example.com/?q=2' },
            ];
            const processed = [];
            const failed = [];
            const requestList = new Apify.RequestList({ sources });
            const handlePageFunction = async ({ request }) => {
                await delayPromise(3000);
                processed.push(request);
            };

            const cheerioCrawler = new Apify.CheerioCrawler({
                requestList,
                handlePageTimeoutSecs: 0.05,
                maxRequestRetries: 1,
                minConcurrency: 2,
                maxConcurrency: 2,
                handlePageFunction,
                handleFailedRequestFunction: ({ request }) => failed.push(request),
            });

            // Override low value to prevent seeing timeouts from BasicCrawler
            cheerioCrawler.basicCrawler.handleRequestTimeoutMillis = 10000;

            await requestList.initialize();
            await cheerioCrawler.run();

            expect(processed).to.have.lengthOf(0);
            expect(failed).to.have.lengthOf(3);

            failed.forEach((request) => {
                expect(request.errorMessages).to.have.lengthOf(2);
                expect(request.errorMessages[0]).to.include('handlePageFunction timed out');
                expect(request.errorMessages[1]).to.include('handlePageFunction timed out');
            });
        });
    });

    describe('proxy', () => {
        let requestList;
        beforeEach(async () => {
            requestList = new Apify.RequestList({
                sources: [
                    { url: 'http://example.com/?q=0' },
                    { url: 'http://example.com/?q=1' },
                    { url: 'http://example.com/?q=2' },
                    { url: 'http://example.com/?q=3' },
                ],
            });
            await requestList.initialize();
        });

        afterEach(() => {
            requestList = null;
        });

        it('should work with proxyUrls array', async () => {
            const proxies = [];
            const crawler = new Apify.CheerioCrawler({
                requestList,
                handlePageFunction: async () => {},
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            crawler._requestFunction = async ({ request }) => {
                const opts = crawler._getRequestOptions(request);
                proxies.push(opts.proxyUrl);
                // it needs to return something valid
                return { dom: {}, response: responseMock };
            };

            const shuffled = crawler.proxyUrls;
            await crawler.run();

            expect(proxies).to.have.lengthOf(4);
            expect(proxies[0]).to.be.eql(shuffled[0]);
            expect(proxies[1]).to.be.eql(shuffled[1]);
            expect(proxies[2]).to.be.eql(shuffled[2]);
            expect(proxies[3]).to.be.eql(shuffled[0]);
        });

        it('should work with useApifyProxy', async () => {
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
            const proxies = [];
            const useApifyProxy = true;

            const proxy = Apify.getApifyProxyUrl();

            const crawler = new Apify.CheerioCrawler({
                requestList,
                handlePageFunction: async () => {},
                useApifyProxy,
            });

            crawler._requestFunction = async ({ request }) => {
                const opts = crawler._getRequestOptions(request);
                proxies.push(opts.proxyUrl);
                // it needs to return something valid
                return { dom: {}, response: responseMock };
            };

            await crawler.run();
            delete process.env[ENV_VARS.PROXY_PASSWORD];

            // expect(proxies).to.have.lengthOf(1);
            expect(proxies[0]).to.be.eql(proxy);
            expect(proxies[1]).to.be.eql(proxy);
            expect(proxies[2]).to.be.eql(proxy);
            expect(proxies[3]).to.be.eql(proxy);
        });

        it('should work with useApifyProxy and other opts', async () => {
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
            const proxies = [];
            const useApifyProxy = true;
            const apifyProxyGroups = ['GROUP1', 'GROUP2'];
            const apifyProxySession = 'session';

            const proxy = Apify.getApifyProxyUrl({
                groups: apifyProxyGroups,
                session: apifyProxySession,
            });

            const crawler = new Apify.CheerioCrawler({
                requestList,
                handlePageFunction: async () => {},
                useApifyProxy,
                apifyProxyGroups,
                apifyProxySession,
            });

            crawler._requestFunction = async ({ request }) => {
                const opts = crawler._getRequestOptions(request);
                proxies.push(opts.proxyUrl);
                // it needs to return something valid
                return { dom: {}, response: responseMock };
            };

            await crawler.run();
            delete process.env[ENV_VARS.PROXY_PASSWORD];

            // expect(proxies).to.have.lengthOf(1);
            expect(proxies[0]).to.be.eql(proxy);
            expect(proxies[1]).to.be.eql(proxy);
            expect(proxies[2]).to.be.eql(proxy);
            expect(proxies[3]).to.be.eql(proxy);
        });

        describe('throws', () => {
            /* eslint-disable no-new */
            beforeEach(() => {
                log.setLevel(log.LEVELS.OFF);
            });
            afterEach(async () => {
                log.setLevel(log.LEVELS.ERROR);
            });

            it('when proxyUrls is used together with useApifyProxy', async () => {
                try {
                    new Apify.CheerioCrawler({
                        requestList,
                        handlePageFunction: async () => {},
                        proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
                        useApifyProxy: true,
                    });
                    throw new Error('Invalid error.');
                } catch (err) {
                    expect(err.message).to.include('useApifyProxy');
                }
            });

            it('when proxyUrls array is empty', async () => {
                try {
                    new Apify.CheerioCrawler({
                        requestList,
                        handlePageFunction: async () => {},
                        proxyUrls: [],
                    });
                    throw new Error('Invalid error.');
                } catch (err) {
                    expect(err.message).to.include('must not be empty');
                }
            });
        });
    });
});
