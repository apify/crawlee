import { Readable } from 'stream';
import EventEmitter from 'events';
import rqst from 'request';
import { expect } from 'chai';
import log from 'apify-shared/log';
import { delayPromise } from 'apify-shared/utilities';
import { ENV_VARS } from 'apify-shared/consts';
import express from 'express';
import bodyParser from 'body-parser';
import Apify from '../../build';

// Add common props to mocked request responses.
const responseMock = {
    url: 'loadedUrl',
};

const startExpressAppPromise = (app, port) => {
    return new Promise((resolve) => {
        const server = app.listen(port, () => resolve(server));
    });
};

const HOST = '127.0.0.1';


/* eslint-disable no-underscore-dangle */
describe('CheerioCrawler', () => {
    const comparator = (a, b) => {
        a = Number(/q=(\d+)$/.exec(a.url)[1]);
        b = Number(/q=(\d+)$/.exec(b.url)[1]);
        return a - b;
    };

    let logLevel;
    let server;
    let port;

    async function getRequestListForMock(mockData, path = 'mock') {
        const sources = [
            {
                url: `http://${HOST}:${port}/${path}?a=1`,
                payload: JSON.stringify(mockData),
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            }, {
                url: `http://${HOST}:${port}/${path}?a=2`,
                payload: JSON.stringify(mockData),
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            }, {
                url: `http://${HOST}:${port}/${path}?a=3`,
                payload: JSON.stringify(mockData),
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            }, {
                url: `http://${HOST}:${port}/${path}?a=4`,
                payload: JSON.stringify(mockData),
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            },
        ];
        const requestList = new Apify.RequestList({ sources });
        await requestList.initialize();
        return requestList;
    }

    async function getRequestListForMirror() {
        const sources = [
            { url: `http://${HOST}:${port}/mirror?a=12` },
            { url: `http://${HOST}:${port}/mirror?a=23` },
            { url: `http://${HOST}:${port}/mirror?a=33` },
        ];
        const requestList = new Apify.RequestList({ sources });
        await requestList.initialize();
        return requestList;
    }

    before(async () => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
        const app = express();
        app.use(bodyParser.urlencoded({
            extended: true,
        }));
        app.use(bodyParser.json());
        app.post('/mock', (req, res) => {
            const { headers, statusCode, error = false, body } = req.body;

            if (error) {
                throw new Error(error);
            }

            Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));

            res.status(statusCode).send(body);
        });

        app.get('/invalidContentType', (req, res) => {
            res.send({ some: 'json' });
        });

        app.post('/jsonError', (req, res) => {
            res
                .status(500)
                .json({ message: 'CUSTOM_ERROR' });
        });


        app.get('/mirror', (req, res) => {
            res.send('DATA');
        });

        server = await startExpressAppPromise(app, 0);
        port = server.address().port; //eslint-disable-line
    });

    after(() => {
        log.setLevel(logLevel);
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
        const handlePageFunction = async ({ request }) => {
            success = request;
        };
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

    describe('should ensure text/html Content-Type', () => {
        it('by setting a correct Accept header', async () => {
            const headers = [];
            const requestList = await getRequestListForMirror();
            const crawler = new Apify.CheerioCrawler({
                requestList,
                handlePageFunction: async ({ response }) => {
                    headers.push(response.request.gotOptions.headers);
                },
            });

            await crawler.run();
            headers.forEach(h => expect(h.accept).to.be.eql('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'));
        });

        describe('by throwing', () => {
            let crawler;
            let handlePageInvocationCount = 0;
            let errorMessages = [];
            let chunkReadCount = 0;
            const getChunk = (chunk = 'x') => {
                chunkReadCount++;
                return chunk;
            };

            beforeEach(() => {
                log.setLevel(log.LEVELS.OFF);
            });
            afterEach(async () => {
                log.setLevel(log.LEVELS.ERROR);
                crawler = null;
                handlePageInvocationCount = 0;
                chunkReadCount = 0;
                errorMessages = [];
            });


            it('when invalid Content-Type header is received', async () => {
                // Mock Request to inject invalid response headers.

                crawler = new Apify.CheerioCrawler({
                    requestList: await getRequestListForMock({
                        headers: {
                            'content-type': 'application/json',
                        },
                        statusCode: 200,
                    }),
                    maxRequestRetries: 1,
                    handlePageFunction: async () => {
                        handlePageInvocationCount++;
                    },
                    handleFailedRequestFunction: async ({ request }) => {
                        errorMessages = [...errorMessages, ...request.errorMessages];
                    },
                });

                await crawler.run();

                expect(handlePageInvocationCount).to.be.eql(0);
                expect(errorMessages).to.have.lengthOf(4);
                errorMessages.forEach(msg => expect(msg).to.include('served Content-Type application/json instead of text/html. Skipping resource.'));
                expect(chunkReadCount).to.be.eql(0);
            });

            xit('when response stream emits an error event', async () => {
                // Mock Request to emit an error after a while.
                // I think that this is an external factor that could be resolved by trying again.
                crawler = new Apify.CheerioCrawler({
                    requestList: await getRequestListForMock({
                        statusCode: 200,
                    }),
                    maxRequestRetries: 1,
                    handlePageFunction: async () => {
                        handlePageInvocationCount++;
                    },
                    handleFailedRequestFunction: async ({ request }) => {
                        errorMessages = [...errorMessages, ...request.errorMessages];
                    },
                });

                await crawler.run();
                expect(handlePageInvocationCount).to.be.eql(0);
                expect(errorMessages).to.have.lengthOf(4);
                errorMessages.forEach(msg => expect(msg).to.include('Error in stream.'));
            });

            xit('when request stream emits an error event', async () => {
                // Mock Request to emit an error after a while.
                // Why is this necessary?
                rqst.get = () => {
                    const response = new Readable({
                        // Just do nothing
                        read() {
                        },
                    });
                    response.headers = {
                        'content-type': 'text/html',
                    };

                    const ee = new EventEmitter();

                    setTimeout(() => {
                        ee.emit('response', response);
                        setTimeout(() => {
                            ee.emit('error', new Error('Request Error.'));
                        }, 0);
                    }, 0);

                    return ee;
                };

                await crawler.run();

                expect(handlePageInvocationCount).to.be.eql(0);
                expect(errorMessages).to.have.lengthOf(8);
                errorMessages.forEach(msg => expect(msg).to.include('Request Error.'));
            });

            it('when statusCode >= 500 and text/html is received', async () => {
                // sometimes if you get blocked you can get 500+ with some html inside
                crawler = new Apify.CheerioCrawler({
                    requestList: await getRequestListForMock({
                        statusCode: 508,
                        headers: {
                            'content-type': 'text/html',
                        },
                        body: 'DATABASE ERRROR',
                    }),
                    maxRequestRetries: 1,
                    handlePageFunction: async () => {
                        handlePageInvocationCount++;
                    },
                    handleFailedRequestFunction: async ({ request }) => {
                        errorMessages = [...errorMessages, ...request.errorMessages];
                    },
                });
                await crawler.run();

                expect(handlePageInvocationCount).to.be.eql(0);
                expect(errorMessages).to.have.lengthOf(8);
                errorMessages.forEach(msg => expect(msg).to.include('Internal Server Error'));
            });

            it('when statusCode >= 500 and application/json is received', async () => {
                crawler = new Apify.CheerioCrawler({
                    requestList: await getRequestListForMock({}, 'jsonError'),
                    maxRequestRetries: 1,
                    handlePageFunction: async () => {
                        handlePageInvocationCount++;
                    },
                    handleFailedRequestFunction: async ({ request }) => {
                        errorMessages = [...errorMessages, ...request.errorMessages];
                    },
                });
                await crawler.run();

                expect(handlePageInvocationCount).to.be.eql(0);
                expect(errorMessages).to.have.lengthOf(8);
                errorMessages.forEach(msg => expect(msg).to.include('CUSTOM_ERROR'));
            });

            it('when 406 is received', async () => {
                // Mock Request to respond with a 406.
                crawler = new Apify.CheerioCrawler({
                    requestList: await getRequestListForMock({
                        headers: {
                            'content-type': 'text/plain',
                        },
                        statusCode: 406,
                    }),
                    maxRequestRetries: 1,
                    handlePageFunction: async () => {
                        handlePageInvocationCount++;
                    },
                    handleFailedRequestFunction: async ({ request }) => {
                        errorMessages = [...errorMessages, ...request.errorMessages];
                    },
                });
                await crawler.run();

                expect(handlePageInvocationCount).to.be.eql(0);
                expect(errorMessages).to.have.lengthOf(4);
                errorMessages.forEach(msg => expect(msg).to.include('is not available in HTML format. Skipping resource.'));
            });

            xit('when status is ok, but a wrong content type is received', async () => {
                // Mock Request to respond with a 406.
                // IMHO Duplicated
                rqst.get = () => {
                    const response = new Readable({
                        read() {
                            this.push(getChunk());
                            this.push(null);
                        },
                    });
                    response.headers = {
                        'content-type': 'application/json',
                    };
                    response.statusCode = 200;

                    const ee = new EventEmitter();

                    setTimeout(() => {
                        ee.emit('response', response);
                    }, 0);

                    return ee;
                };

                await crawler.run();

                expect(handlePageInvocationCount).to.be.eql(0);
                expect(errorMessages).to.have.lengthOf(4);
                errorMessages.forEach(msg => expect(msg).to.include('served Content-Type application/json instead of text/html'));
                expect(chunkReadCount).to.be.eql(0);
            });
        });
    });

    describe('proxy', () => {
        let requestList;
        beforeEach(async () => {
            requestList = new Apify.RequestList({
                sources: [
                    { url: 'http://example.com/' },
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
                handlePageFunction: async () => {
                },
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            crawler._requestFunction = async ({ request }) => {
                const opts = crawler._getRequestOptions(request);
                proxies.push(opts.proxyUrl);
                // it needs to return something valid
                return { dom: {}, responseStream: responseMock };
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
                handlePageFunction: async () => {
                },
                useApifyProxy,
            });

            crawler._requestFunction = async ({ request }) => {
                const opts = crawler._getRequestOptions(request);
                proxies.push(opts.proxyUrl);
                // it needs to return something valid
                return { dom: {}, responseStream: responseMock };
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
                handlePageFunction: async () => {
                },
                useApifyProxy,
                apifyProxyGroups,
                apifyProxySession,
            });

            crawler._requestFunction = async ({ request }) => {
                const opts = crawler._getRequestOptions(request);
                proxies.push(opts.proxyUrl);
                // it needs to return something valid
                return { dom: {}, responseStream: responseMock };
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
                        handlePageFunction: async () => {
                        },
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
                        handlePageFunction: async () => {
                        },
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
