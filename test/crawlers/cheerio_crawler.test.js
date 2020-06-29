import fs from 'fs';
import path from 'path';
import { ENV_VARS } from 'apify-shared/consts';
import express from 'express';
import bodyParser from 'body-parser';
import sinon from 'sinon';
import { Readable } from 'stream';
import * as iconv from 'iconv-lite';
import log from '../../build/utils_log';
import Apify from '../../build';
import { sleep } from '../../build/utils';
import { Session } from '../../build/session_pool/session';
import { STATUS_CODES_BLOCKED } from '../../build/constants';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';
import * as utilsRequest from '../../build/utils_request';
import CrawlerExtension from '../../build/crawlers/crawler_extension';


// Add common props to mocked request responses.
const responseMock = {
    url: 'loadedUrl',
};

const HOST = '127.0.0.1';

const responseSamples = {
    json: { foo: 'bar' },
    xml: '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<items>\n'
        + '<item>\n'
        + '    <url>https://apify.com</url>\n'
        + '    <title>Web Scraping, Data Extraction and Automation &#xB7; Apify</title>\n'
        + '</item>\n'
        + '</items>',
    image: fs.readFileSync(path.join(__dirname, 'data/apify.png')),
};

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
    res.send('<html><head><title>Title</title></head><body>DATA</body></html>');
});

app.get('/json-type', (req, res) => {
    res.json(responseSamples.json);
});
app.get('/xml-type', (req, res) => {
    res.type('application/xml');
    res.send(responseSamples.xml);
});
app.get('/image-type', (req, res) => {
    res.type('image/png');
    res.send(responseSamples.image);
});

app.get('/timeout', async (req, res) => {
    await sleep(32000);
    res.type('html').send('<div>TEST</div>');
});

/* eslint-disable no-underscore-dangle */
describe('CheerioCrawler', () => {
    let logLevel;
    let server;
    let port;
    let localStorageEmulator;
    beforeAll(async () => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
        server = await startExpressAppPromise(app, 0);
        port = server.address().port; //eslint-disable-line
        localStorageEmulator = new LocalStorageDirEmulator();
    });

    beforeEach(async () => {
        await localStorageEmulator.init();
    });

    afterAll(async () => {
        log.setLevel(logLevel);
        await localStorageEmulator.destroy();
        server.close();
    });

    test('should work', async () => {
        const requestList = await getRequestListForMirror(port);
        const processed = [];
        const failed = [];
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

        await cheerioCrawler.run();

        expect(cheerioCrawler.autoscaledPool.minConcurrency).toBe(2);
        expect(processed).toHaveLength(3);
        expect(failed).toHaveLength(0);

        processed.forEach((request) => {
            expect(request.userData.title).toBe('Title');
            expect(typeof request.userData.html).toBe('string');
            expect(request.userData.html.length).not.toBe(0);
        });
    });

    test('should ignore ssl by default', async () => {
        const sources = [
            { url: 'http://example.com/?q=1' },
        ];
        const requestList = new Apify.RequestList({ sources });
        const handlePageFunction = async () => {};

        const cheerioCrawler = new Apify.CheerioCrawler({
            requestList,
            maxConcurrency: 1,
            handlePageFunction,
        });

        await requestList.initialize();
        await cheerioCrawler.run();

        expect(cheerioCrawler.ignoreSslErrors).toBeTruthy();
    });

    test('should trigger prepareRequestFunction', async () => {
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
        expect(failed).toBe(null);
        expect(success.url).toEqual(MODIFIED_URL);
    });

    describe('should timeout', () => {
        let ll;
        beforeAll(() => {
            ll = log.getLevel();
            log.setLevel(log.LEVELS.OFF);
        });

        afterAll(() => {
            log.setLevel(ll);
        });

        test('after requestTimeoutSecs', async () => {
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
                await sleep(300);
                return '<html><head></head><body>Body</body></html>';
            };

            await requestList.initialize();
            await cheerioCrawler.run();

            expect(processed).toHaveLength(0);
            expect(failed).toHaveLength(3);

            failed.forEach((request) => {
                expect(request.errorMessages).toHaveLength(2);
                expect(request.errorMessages[0]).toMatch('request timed out');
                expect(request.errorMessages[1]).toMatch('request timed out');
            });
        });

        test('after handlePageTimeoutSecs', async () => {
            const failed = [];
            const requestList = await getRequestListForMirror(port);
            const handlePageFunction = async () => {
                await sleep(2000);
            };

            const cheerioCrawler = new Apify.CheerioCrawler({
                requestList,
                handlePageTimeoutSecs: 1,
                maxRequestRetries: 1,
                minConcurrency: 2,
                maxConcurrency: 2,
                handlePageFunction,
                handleFailedRequestFunction: ({ request }) => failed.push(request),
            });

            // Override low value to prevent seeing timeouts from BasicCrawler
            cheerioCrawler.basicCrawler.handleRequestTimeoutMillis = 10000;

            await cheerioCrawler.run();

            expect(failed).toHaveLength(3);

            failed.forEach((request) => {
                expect(request.errorMessages).toHaveLength(2);
                expect(request.errorMessages[0]).toMatch('handlePageFunction timed out');
                expect(request.errorMessages[1]).toMatch('handlePageFunction timed out');
            });
        });
    });

    describe('should not timeout by the default httpRequest timeoutSecs', () => {
        it('when requestTimeoutSecs is greater than 30', async () => {
            const sources = [
                { url: `http://${HOST}:${port}/timeout?a=12` },
                { url: `http://${HOST}:${port}/timeout?a=23` },
            ];
            const processed = [];
            const failed = [];
            const requestList = new Apify.RequestList({ sources });
            const handlePageFunction = async ({ request }) => {
                processed.push(request);
            };

            const cheerioCrawler = new Apify.CheerioCrawler({
                requestList,
                maxRequestRetries: 1,
                requestTimeoutSecs: 35,
                minConcurrency: 2,
                maxConcurrency: 2,
                handlePageFunction,
                handleFailedRequestFunction: ({ request }) => failed.push(request),
            });

            await requestList.initialize();
            await cheerioCrawler.run();

            expect(processed).toHaveLength(2);
            expect(failed).toHaveLength(0);
        }, 40000);
    });

    describe('should ensure text/html Content-Type', () => {
        test('by setting a correct Accept header', async () => {
            const headers = [];
            const requestList = await getRequestListForMirror(port);
            const crawler = new Apify.CheerioCrawler({
                requestList,
                handlePageFunction: async ({ response }) => {
                    headers.push(response.request.gotOptions.headers);
                },
            });

            await crawler.run();
            headers.forEach(h => expect(h.Accept).toBe('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'));
        });

        describe('by throwing', () => {
            let crawler;
            let handlePageInvocationCount = 0;
            let errorMessages = [];

            beforeEach(() => {
                log.setLevel(log.LEVELS.OFF);
            });
            afterEach(async () => {
                log.setLevel(log.LEVELS.ERROR);
                crawler = null;
                handlePageInvocationCount = 0;
                errorMessages = [];
            });


            test('when invalid Content-Type header is received', async () => {
                // Mock Request to inject invalid response headers.

                crawler = new Apify.CheerioCrawler({
                    requestList: await getRequestListForMock(port, {
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

                expect(handlePageInvocationCount).toBe(0);
                expect(errorMessages).toHaveLength(4);
                errorMessages.forEach(msg => expect(msg).toMatch(
                    'Content-Type application/json, but only text/html, '
                        + 'application/xhtml+xml are allowed. Skipping resource.',
                ));
            });

            test('when statusCode >= 500 and text/html is received', async () => {
                // sometimes if you get blocked you can get 500+ with some html inside
                crawler = new Apify.CheerioCrawler({
                    requestList: await getRequestListForMock(port, {
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

                expect(handlePageInvocationCount).toBe(0);
                expect(errorMessages).toHaveLength(8);
                errorMessages.forEach(msg => expect(msg).toMatch('Internal Server Error'));
            });

            test('when statusCode >= 500 and application/json is received', async () => {
                crawler = new Apify.CheerioCrawler({
                    requestList: await getRequestListForMock(port, {}, 'jsonError'),
                    maxRequestRetries: 1,
                    handlePageFunction: async () => {
                        handlePageInvocationCount++;
                    },
                    handleFailedRequestFunction: async ({ request }) => {
                        errorMessages = [...errorMessages, ...request.errorMessages];
                    },
                });
                await crawler.run();

                expect(handlePageInvocationCount).toBe(0);
                expect(errorMessages).toHaveLength(8);
                errorMessages.forEach(msg => expect(msg).toMatch('CUSTOM_ERROR'));
            });

            test('when 406 is received', async () => {
                // Mock Request to respond with a 406.
                crawler = new Apify.CheerioCrawler({
                    requestList: await getRequestListForMock(port, {
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

                expect(handlePageInvocationCount).toBe(0);
                expect(errorMessages).toHaveLength(4);
                errorMessages.forEach(msg => expect(msg).toMatch('is not available in HTML format. Skipping resource.'));
            });
        });
    });

    test('should work with all defaults content types', async () => {
        let handledRequests = 0;
        const contentTypes = ['text/html', 'application/xhtml+xml'];
        const sources = contentTypes.map(contentType => ({
            url: `http://${HOST}:${port}/mock?ct=${contentType}`,
            payload: JSON.stringify({ headers: { 'Content-Type': contentType }, statusCode: 200 }),
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }));
        const requestList = new Apify.RequestList({
            sources,
        });
        await requestList.initialize();
        const crawler = new Apify.CheerioCrawler({
            requestList,
            handlePageFunction: async () => {
                handledRequests++;
            },
        });
        await crawler.run();
        expect(handledRequests).toEqual(contentTypes.length);
    });

    describe('should work with all content types from options.additionalMimeTypes', () => {
        const handlePageInvocationParams = [];
        let handleFailedInvocationCount = 0;
        beforeAll(async () => {
            const sources = [
                { url: `http://${HOST}:${port}/json-type` },
                { url: `http://${HOST}:${port}/xml-type` },
                { url: `http://${HOST}:${port}/image-type` },
            ];
            const sourceCount = sources.length;
            const requestList = new Apify.RequestList({ sources });
            await requestList.initialize();
            const crawler = new Apify.CheerioCrawler({
                requestList,
                additionalMimeTypes: ['application/json', 'image/png', 'application/xml'],
                maxRequestRetries: 1,
                handlePageFunction: async (params) => {
                    handlePageInvocationParams.push(params);
                },
                handleFailedRequestFunction: async () => {
                    handleFailedInvocationCount++;
                },
            });
            await crawler.run();

            expect(handleFailedInvocationCount).toBe(0);
            expect(handlePageInvocationParams.length).toEqual(sourceCount);
        });
        test('when response is application/json', async () => {
            const jsonRequestParams = handlePageInvocationParams[0];
            expect(jsonRequestParams.json).toBeInstanceOf(Object);
            expect(jsonRequestParams.body).toEqual(Buffer.from(JSON.stringify(responseSamples.json)));
            expect(jsonRequestParams.contentType.type).toBe('application/json');
        });
        test('when response is application/xml', async () => {
            const xmlRequestParams = handlePageInvocationParams[1];
            expect(typeof xmlRequestParams.body).toBe('string');
            expect(xmlRequestParams.body).toEqual(responseSamples.xml);
            expect(xmlRequestParams.$).toBeInstanceOf(Function);
            expect(xmlRequestParams.contentType.type).toBe('application/xml');
        });
        test('when response is image/png', async () => {
            const imageRequestParams = handlePageInvocationParams[2];
            expect(imageRequestParams.body).toBeInstanceOf(Buffer);
            expect(imageRequestParams.body).toEqual(responseSamples.image);
            expect(imageRequestParams.contentType.type).toBe('image/png');
        });
    });

    describe('should use response encoding', () => {
        const requestList = new Apify.RequestList({
            sources: ['http://useless.x'],
        });
        const html = '<html>Žluťoučký kůň</html>';


        test('as a fallback', async () => {
            const suggestResponseEncoding = 'windows-1250';
            const buf = iconv.encode(html, suggestResponseEncoding);
            // Ensure it's really encoded.
            expect(buf.toString('utf8')).not.toBe(html);

            const crawler = new Apify.CheerioCrawler({
                requestList,
                handlePageFunction: async () => {},
                suggestResponseEncoding,
            });

            const stream = Readable.from([buf]);

            const { response, encoding } = crawler._encodeResponse({}, stream);
            expect(encoding).toBe('utf8');
            for await (const chunk of response) {
                const string = chunk.toString('utf8');
                expect(string).toBe(html);
            }
        });

        test('always when forced', async () => {
            const forceResponseEncoding = 'win1250';
            const buf = iconv.encode(html, forceResponseEncoding);
            // Ensure it's really encoded.
            expect(buf.toString('utf8')).not.toBe(html);

            const crawler = new Apify.CheerioCrawler({
                requestList,
                handlePageFunction: async () => {},
                forceResponseEncoding,
            });

            const stream = Readable.from([buf]);

            const { response, encoding } = crawler._encodeResponse({}, stream, 'ascii');
            expect(encoding).toBe('utf8');
            for await (const chunk of response) {
                const string = chunk.toString('utf8');
                expect(string).toBe(html);
            }
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

        test('should work with Apify Proxy configuration', async () => {
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
            const status = { connected: true };
            const fakeCall = async () => {
                return { body: status };
            };

            const stub = sinon.stub(utilsRequest, 'requestAsBrowser').callsFake(fakeCall);
            const proxyConfiguration = await Apify.createProxyConfiguration({
                groups: ['GROUP1', 'GROUP2'],
            });

            const crawler = new Apify.CheerioCrawler({
                requestList,
                handlePageFunction: async () => {
                },
                proxyConfiguration,
            });

            const proxies = [];
            crawler._requestFunction = async ({ proxyUrl }) => {
                proxies.push(proxyUrl);
                // it needs to return something valid
                return { dom: {}, response: responseMock };
            };

            const proxyUrl = crawler.proxyConfiguration.newUrl();
            await crawler.run();

            expect(proxies[0]).toEqual(proxyUrl);
            expect(proxies[1]).toEqual(proxyUrl);
            expect(proxies[2]).toEqual(proxyUrl);
            expect(proxies[3]).toEqual(proxyUrl);

            delete process.env[ENV_VARS.PROXY_PASSWORD];
            stub.restore();
        });

        test('handlePageFunction should expose the proxyInfo object with sessions correctly', async () => {
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
            const status = { connected: true };
            const fakeCall = async () => {
                return { body: status };
            };

            const stub = sinon.stub(utilsRequest, 'requestAsBrowser').callsFake(fakeCall);

            const proxyConfiguration = await Apify.createProxyConfiguration();
            const proxies = [];
            const sessions = [];
            const handlePageFunction = async ({ session, proxyInfo }) => {
                proxies.push(proxyInfo);
                sessions.push(session);
            };

            const crawler = new Apify.CheerioCrawler({
                requestList,
                handlePageFunction,
                proxyConfiguration,
                useSessionPool: true,
            });

            crawler._requestFunction = async ({ request }) => {
                // it needs to return something valid
                return { dom: {}, response: { url: request.url } };
            };

            await crawler.run();

            expect(proxies[0]).toEqual(proxyConfiguration.newProxyInfo(sessions[0].id));
            expect(proxies[1]).toEqual(proxyConfiguration.newProxyInfo(sessions[1].id));
            expect(proxies[2]).toEqual(proxyConfiguration.newProxyInfo(sessions[2].id));
            expect(proxies[3]).toEqual(proxyConfiguration.newProxyInfo(sessions[3].id));

            delete process.env[ENV_VARS.PROXY_PASSWORD];
            stub.restore();
        });

        test('should work with proxyUrls configuration', async () => {
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
            const proxies = [];

            const proxyConfiguration = await Apify.createProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            const crawler = new Apify.CheerioCrawler({
                requestList,
                handlePageFunction: async () => {
                },
                proxyConfiguration,
                maxConcurrency: 1,
            });

            crawler._requestFunction = async ({ request, session, proxyUrl }) => {
                const opts = crawler._getRequestOptions(request, session, proxyUrl);
                proxies.push(opts.proxyUrl);
                // it needs to return something valid
                return { dom: {}, response: responseMock };
            };

            await crawler.run();

            const { proxyUrls } = proxyConfiguration;
            expect(proxies[0]).toEqual(proxyUrls[0]);
            expect(proxies[1]).toEqual(proxyUrls[1]);
            expect(proxies[2]).toEqual(proxyUrls[2]);
            expect(proxies[3]).toEqual(proxyUrls[0]);

            delete process.env[ENV_VARS.PROXY_PASSWORD];
        });

        test('should correctly pass the url to proxyInfo with proxyUrls configuration and sessionPool', async () => {
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
            const proxies = [];
            const proxyChecks = [];

            const proxyConfiguration = await Apify.createProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            const crawler = new Apify.CheerioCrawler({
                requestList,
                handlePageFunction: async ({ proxyInfo }) => {
                    proxyChecks.push(proxyInfo);
                },
                proxyConfiguration,
                useSessionPool: true,
            });

            crawler._requestFunction = async ({ request, session, proxyUrl }) => {
                const opts = crawler._getRequestOptions(request, session, proxyUrl);
                proxies.push(opts.proxyUrl);
                // it needs to return something valid
                return { dom: {}, response: responseMock };
            };

            await crawler.run();

            expect(proxies[0]).toEqual(proxyChecks[0].url);
            expect(proxies[1]).toEqual(proxyChecks[1].url);
            expect(proxies[2]).toEqual(proxyChecks[2].url);
            expect(proxies[3]).toEqual(proxyChecks[3].url);

            delete process.env[ENV_VARS.PROXY_PASSWORD];
        });
    });

    describe('SessionPool', () => {
        const sources = ['http://example.com/'];
        let requestList;

        beforeEach(async () => {
            requestList = await Apify.openRequestList('test', sources.slice());
        });

        test('should work', async () => {
            const crawler = new Apify.CheerioCrawler({
                requestList,
                useSessionPool: true,
                persistCookiesPerSession: false,
                handlePageFunction: async ({ session }) => {
                    expect(session).toBeInstanceOf(Session);
                },
            });
            await crawler.run();
        });

        test('should markBad sessions after request timeout', async () => {
            log.setLevel(log.LEVELS.OFF);
            const sessions = [];
            const failed = [];
            const cheerioCrawler = new Apify.CheerioCrawler({
                requestList: await Apify.openRequestList('timeoutTest', [`http://${HOST}:${port}/timeout?a=12`,
                    `http://${HOST}:${port}/timeout?a=23`,
                ]),
                maxRequestRetries: 1,
                requestTimeoutSecs: 1,
                maxConcurrency: 1,
                useSessionPool: true,
                handlePageFunction: async () => {},
                handleFailedRequestFunction: ({ request }) => failed.push(request),
            });
            const oldCall = cheerioCrawler._handleRequestTimeout;
            cheerioCrawler._handleRequestTimeout = (session) => {
                sessions.push(session);
                return oldCall(session).bind(cheerioCrawler);
            };

            await cheerioCrawler.run();
            sessions.forEach((session) => {
                expect(session.errorScore).toEqual(1);
            });
            log.setLevel(log.LEVELS.ERROR);
        });

        test('should retire session on "blocked" status codes', async () => {
            for (const code of STATUS_CODES_BLOCKED) {
                const failed = [];
                const sessions = [];
                const crawler = new Apify.CheerioCrawler({
                    requestList: await getRequestListForMock(port, {
                        statusCode: code,
                        error: false,
                        headers: { 'Content-type': 'text/html' },
                    }),
                    useSessionPool: true,
                    persistCookiesPerSession: false,
                    maxRequestRetries: 0,
                    handlePageFunction: async ({ session }) => {
                        sessions.push(session);
                    },
                    handleFailedRequestFunction: async ({ request }) => {
                        failed.push(request);
                    },
                });
                const oldCall = crawler._throwOnBlockedRequest;
                crawler._throwOnBlockedRequest = (session, statusCode) => {
                    sessions.push(session);
                    return oldCall(session, statusCode);
                };
                await crawler.run();

                sessions.forEach((session) => {
                    expect(session.errorScore).toBeGreaterThanOrEqual(session.maxErrorScore);
                });

                failed.forEach((request) => {
                    expect(request.errorMessages[0].includes(`Request blocked - received ${code} status code`)).toBeTruthy();
                });
            }
        });

        test('should throw when "options.useSessionPool" false and "options.persistCookiesPerSession" is true', async () => {
            try {
                // eslint-disable-next-line no-new
                new Apify.CheerioCrawler({
                    requestList: await getRequestListForMock(port, {

                    }),
                    useSessionPool: false,
                    persistCookiesPerSession: true,
                    maxRequestRetries: 0,
                    handlePageFunction: () => {
                    },
                });
            } catch (e) {
                expect(e.message).toEqual('Cannot use "options.persistCookiesPerSession" without "options.useSessionPool"');
            }
        });

        test('should send cookies', async () => {
            const cookie = 'SESSID=abcd123';
            const requests = [];
            const crawler = new Apify.CheerioCrawler({
                requestList: await getRequestListForMock(port, {
                    headers: { 'set-cookie': cookie, 'content-type': 'text/html' },
                    statusCode: 200,
                }),
                useSessionPool: true,
                persistCookiesPerSession: true,
                sessionPoolOptions: {
                    maxPoolSize: 1,
                },
                maxRequestRetries: 1,
                maxConcurrency: 1,
                handlePageFunction: async ({ request }) => {
                    requests.push(request);
                },

            });

            await crawler.run();
            requests.forEach((req, i) => {
                if (i >= 1) {
                    expect(req.headers.Cookie).toEqual(cookie);
                }
            });
        });

        test('should pass session to prepareRequestFunction when Session pool is used', async () => {
            const handlePageFunction = async () => {};

            const cheerioCrawler = new Apify.CheerioCrawler({
                requestList,
                handlePageFunction,
                useSessionPool: true,
                prepareRequestFunction: async ({ session }) => {
                    expect(session.constructor.name).toEqual('Session');
                },
            });
            await cheerioCrawler.run();
        });

        test('should use sessionId in proxyUrl when the session pool is enabled', async () => {
            const sourcesNew = [
                { url: 'http://example.com/?q=1' },
            ];
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';

            const requestListNew = new Apify.RequestList({ sources: sourcesNew });
            let usedSession;
            const usedRequests = [];
            const status = { connected: true };

            const fakeCall = async (opt) => {
                usedRequests.push(opt);
                return { body: status };
            };

            const stub = sinon.stub(utilsRequest, 'requestAsBrowser').callsFake(fakeCall);

            const proxyConfiguration = await Apify.createProxyConfiguration();
            const cheerioCrawler = new Apify.CheerioCrawler({
                requestList: requestListNew,
                maxRequestRetries: 0,
                handlePageFunction: async () => {},
                handleFailedRequestFunction: async () => {},
                useSessionPool: true,
                proxyConfiguration,
            });

            const oldHandleRequestF = cheerioCrawler._handleRequestFunction;
            cheerioCrawler._handleRequestFunction = async (opts) => {
                usedSession = opts.session;
                return oldHandleRequestF.call(cheerioCrawler, opts);
            };

            await requestListNew.initialize();
            await cheerioCrawler.run();

            const cheerioCrawlerRequest = usedRequests[1];
            expect(cheerioCrawlerRequest.proxyUrl.includes(usedSession.id)).toBeTruthy();
            stub.restore();
        });
    });

    describe('use', () => {
        const sources = ['http://example.com/'];
        let requestList;

        class DummyExtension extends CrawlerExtension {
            constructor(options) {
                super();
                this.options = options;
            }

            getCrawlerOptions() {
                return this.options;
            }
        }

        beforeEach(async () => {
            requestList = await Apify.openRequestList(null, sources.slice());
        });

        test('should throw if "CrawlerExtension" class is not used', () => {
            const cheerioCrawler = new Apify.CheerioCrawler({
                requestList,
                maxRequestRetries: 0,
                handlePageFunction: async () => {
                },
                handleFailedRequestFunction: async () => {
                },
            });
            expect(
                () => cheerioCrawler.use({}),
            ).toThrow('Object passed to the "use" method does not inherit from the "CrawlerExtension" abstract class.');
        });

        test('Should throw if "CrawlerExtension" is trying to override non existing property', () => {
            const extension = new DummyExtension({
                doesNotExist: true,
            });
            const cheerioCrawler = new Apify.CheerioCrawler({
                requestList,
                maxRequestRetries: 0,
                handlePageFunction: async () => {},
                handleFailedRequestFunction: async () => {},
            });
            expect(
                () => cheerioCrawler.use(extension),
            )
                .toThrow('DummyExtension tries to set property "doesNotExist" that is not configurable on CheerioCrawler instance.');
        });

        test('should override crawler properties', () => {
            const prepareRequestFunction = async () => ({});
            const extension = new DummyExtension({
                useSessionPool: true,
                prepareRequestFunction,
                handlePageFunction: undefined,
            });
            const cheerioCrawler = new Apify.CheerioCrawler({
                requestList,
                useSessionPool: false,
                maxRequestRetries: 0,
                handlePageFunction: async () => {
                },
                handleFailedRequestFunction: async () => {
                },
            });
            expect(cheerioCrawler.useSessionPool).toEqual(false);
            cheerioCrawler.use(extension);
            expect(cheerioCrawler.useSessionPool).toEqual(true);
            expect(cheerioCrawler.prepareRequestFunction).toEqual(prepareRequestFunction);
            expect(cheerioCrawler.handlePageFunction).toBeUndefined();
        });
    });
});

async function getRequestListForMock(port, mockData, pathName = 'mock') {
    const sources = [1, 2, 3, 4].map((num) => {
        return {
            url: `http://${HOST}:${port}/${pathName}?a=${num}`,
            payload: JSON.stringify(mockData),
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        };
    });
    const requestList = new Apify.RequestList({ sources });
    await requestList.initialize();
    return requestList;
}

async function getRequestListForMirror(port) {
    const sources = [
        { url: `http://${HOST}:${port}/mirror?a=12` },
        { url: `http://${HOST}:${port}/mirror?a=23` },
        { url: `http://${HOST}:${port}/mirror?a=33` },
    ];
    const requestList = new Apify.RequestList({ sources });
    await requestList.initialize();
    return requestList;
}

async function startExpressAppPromise(expressApp, port) {
    return new Promise((resolve) => {
        const server = expressApp.listen(port, () => resolve(server));
    });
}
