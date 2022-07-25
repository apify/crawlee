import log, { Log } from '@apify/log';
import type { Dictionary } from '@crawlee/utils';
import { entries, sleep } from '@crawlee/utils';
import type { OptionsInit } from 'got-scraping';
import { gotScraping } from 'got-scraping';
import bodyParser from 'body-parser';
import type {
    CheerioRequestHandler,
    CheerioCrawlingContext,
    ProxyInfo,
    Source,
} from '@crawlee/cheerio';
import {
    AutoscaledPool,
    CheerioCrawler,
    CrawlerExtension,
    mergeCookies,
    ProxyConfiguration,
    Request,
    RequestList,
    Session,
    STATUS_CODES_BLOCKED,
} from '@crawlee/cheerio';
import express from 'express';
import fs from 'fs';
import type { IncomingHttpHeaders, Server } from 'http';
import iconv from 'iconv-lite';
import type { AddressInfo } from 'net';
import path from 'path';
import { Readable } from 'stream';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

const HOST = '127.0.0.1';

const responseSamples = {
    json: { foo: 'bar' },
    xml: '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<items>\n'
        + '<item>\n'
        + '    <url>https://apify.com</url>\n'
        + '    <title>Web Scraping, Data Extraction and Automation &#xb7; Apify</title>\n'
        + '</item>\n'
        + '</items>',
    image: fs.readFileSync(path.join(__dirname, 'data/apify.png')),
    html: '<!doctype html>\n'
        + '<html>\n'
        + '<head>\n'
        + '    <title>Example Domain</title>\n'
        + '\n'
        + '    <meta charset="utf-8">\n'
        + '    <meta http-equiv="Content-type" content="text/html; charset=utf-8">\n'
        + '    <meta name="viewport" content="width=device-width, initial-scale=1">\n'
        + '    <style type="text/css">\n'
        + '    body {\n'
        + '        background-color: #f0f0f2;\n'
        + '        margin: 0;\n'
        + '        padding: 0;\n'
        + '        font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", "Open Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;\n'
        + '        \n'
        + '    }\n'
        + '    div {\n'
        + '        width: 600px;\n'
        + '        margin: 5em auto;\n'
        + '        padding: 2em;\n'
        + '        background-color: #fdfdff;\n'
        + '        border-radius: 0.5em;\n'
        + '        box-shadow: 2px 3px 7px 2px rgba(0,0,0,0.02);\n'
        + '    }\n'
        + '    a:link, a:visited {\n'
        + '        color: #38488f;\n'
        + '        text-decoration: none;\n'
        + '    }\n'
        + '    @media (max-width: 700px) {\n'
        + '        div {\n'
        + '            margin: 0 auto;\n'
        + '            width: auto;\n'
        + '        }\n'
        + '    }\n'
        + '    </style>    \n'
        + '</head>\n'
        + '\n'
        + '<body>\n'
        + '<div>\n'
        + '    <h1>Example Domain</h1>\n'
        + '    <p>This domain is for use in illustrative examples in documents. You may use this\n'
        + '    domain in literature without prior coordination or asking for permission.</p>\n'
        + '    <p><a href="https://www.iana.org/domains/example">More information...</a></p>\n'
        + '</div>\n'
        + '</body>\n'
        + '</html>\n',
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

    entries(headers as Record<string, string>).forEach(([key, value]) => res.setHeader(key, value));

    res.status(statusCode).send(body);
});

app.get('/headers', (req, res) => {
    res.status(200).json({ headers: req.headers });
});

app.get('/invalidContentType', (_req, res) => {
    res.send({ some: 'json' });
});

app.post('/jsonError', (_req, res) => {
    res
        .status(500)
        .json({ message: 'CUSTOM_ERROR' });
});

app.get('/mirror', (_req, res) => {
    res.send('<html><head><title>Title</title></head><body>DATA</body></html>');
});

app.get('/html-type', (_req, res) => {
    res.type('html').send(responseSamples.html);
});

app.get('/json-type', (_req, res) => {
    res.json(responseSamples.json);
});
app.get('/xml-type', (_req, res) => {
    res.type('application/xml');
    res.send(responseSamples.xml);
});
app.get('/image-type', (_req, res) => {
    res.type('image/png');
    res.send(responseSamples.image);
});

app.get('/timeout', async (_req, res) => {
    await sleep(32000);
    res.type('html').send('<div>TEST</div>');
});

jest.mock('got-scraping', () => {
    const original: typeof import('got-scraping') = jest.requireActual('got-scraping');
    return {
        ...original,
        gotScraping: jest.fn(original.gotScraping),
    };
});

const gotScrapingSpy = gotScraping as jest.MockedFunction<typeof gotScraping>;
const originalGotScraping = gotScrapingSpy.getMockImplementation()!;

afterAll(() => {
    jest.unmock('got-scraping');
});

afterEach(() => {
    gotScrapingSpy.mockReset();
    gotScrapingSpy.mockImplementation(originalGotScraping);
});

/* eslint-disable no-underscore-dangle */
describe('CheerioCrawler', () => {
    let logLevel: number;
    let server: Server;
    let port: number;
    const localStorageEmulator = new MemoryStorageEmulator();

    beforeAll(async () => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
        server = await startExpressAppPromise(app, 0);
        port = (server.address() as AddressInfo).port;

        server.on('connect', (_request, socket) => {
            socket.write(`HTTP/1.1 200 Connection Established\r\n\r\n`);

            socket.resume();

            setTimeout(() => {
                const body = 'from proxy';

                socket.end(`HTTP/1.1 200 OK\r\ncontent-type: text/html\r\ncontent-length: ${body.length}\r\n\r\n${body}`);
            }, 100);
        });
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
        const processed: Request[] = [];
        const failed: Request[] = [];
        const requestHandler: CheerioRequestHandler = ({ $, body, request }) => {
            request.userData.title = $('title').text();
            request.userData.body = body;
            processed.push(request);
        };

        const cheerioCrawler = new CheerioCrawler({
            requestList,
            minConcurrency: 2,
            maxConcurrency: 2,
            requestHandler,
            failedRequestHandler: ({ request }) => {
                failed.push(request);
            },
        });

        await cheerioCrawler.run();

        expect(cheerioCrawler.autoscaledPool.minConcurrency).toBe(2);
        expect(processed).toHaveLength(4);
        expect(failed).toHaveLength(0);

        processed.forEach((request) => {
            expect(request.userData.title).toBe('Title');
            expect(typeof request.userData.body).toBe('string');
            expect((request.userData.body as string).length).not.toBe(0);
        });
    });

    test('should work with router', async () => {
        const requestList = await getRequestListForMirror(port);
        const processed: Request[] = [];
        const failed: Request[] = [];

        const cheerioCrawler = new CheerioCrawler({
            requestList,
            minConcurrency: 2,
            maxConcurrency: 2,
            failedRequestHandler: ({ request }) => {
                failed.push(request);
            },
        });

        cheerioCrawler.router.addDefaultHandler(({ $, body, request }) => {
            request.userData.title = $('title').text();
            request.userData.body = body;
            processed.push(request);
        });

        await cheerioCrawler.run();

        expect(cheerioCrawler.autoscaledPool.minConcurrency).toBe(2);
        expect(processed).toHaveLength(4);
        expect(failed).toHaveLength(0);

        processed.forEach((request) => {
            expect(request.userData.title).toBe('Title');
            expect(typeof request.userData.body).toBe('string');
            expect((request.userData.body as string).length).not.toBe(0);
        });
    });

    test('should throw when no requestHandler nor default route provided', async () => {
        const requestList = await getRequestListForMirror(port);

        const cheerioCrawler = new CheerioCrawler({
            requestList,
            minConcurrency: 2,
            maxConcurrency: 2,
        });

        // eslint-disable-next-line max-len
        await expect(cheerioCrawler.run()).rejects.toThrow(`No default route set up. Please specify 'requestHandler' option or provide default route via 'crawler.router.addDefaultRoute()'.`);
    });

    test('should ignore ssl by default', async () => {
        const sources = [
            { url: 'http://example.com/?q=1' },
        ];
        const requestList = await RequestList.open(null, sources);
        const requestHandler = () => {};

        const cheerioCrawler = new CheerioCrawler({
            requestList,
            maxConcurrency: 1,
            requestHandler,
        });

        await cheerioCrawler.run();

        // @ts-expect-error Accessing private prop
        expect(cheerioCrawler.ignoreSslErrors).toBeTruthy();
    });

    test('should work with not encoded urls', async () => {
        const sources = [
            { url: `http://${HOST}:${port}/mirror?q=abc` },
            { url: `http://${HOST}:${port}/mirror?q=%` },
            { url: `http://${HOST}:${port}/mirror?q=%cf` },
        ];
        const requestList = await RequestList.open(null, sources);
        const processed: Request[] = [];
        const failed: Request[] = [];
        const requestHandler: CheerioRequestHandler = ({ $, body, request }) => {
            request.userData.title = $('title').text();
            request.userData.body = body;
            processed.push(request);
        };

        const cheerioCrawler = new CheerioCrawler({
            requestList,
            minConcurrency: 2,
            maxConcurrency: 2,
            requestHandler,
            failedRequestHandler: ({ request }) => {
                failed.push(request);
            },
        });

        await cheerioCrawler.run();

        expect(processed).toHaveLength(3);
        expect(failed).toHaveLength(0);

        expect(processed[0].loadedUrl).toBe(`http://${HOST}:${port}/mirror?q=abc`);
        expect(processed[1].loadedUrl).toBe(`http://${HOST}:${port}/mirror?q=%`);
        expect(processed[2].loadedUrl).toBe(`http://${HOST}:${port}/mirror?q=%cf`);
    });

    test('should serialize body and html', async () => {
        expect.assertions(2);
        const sources = [`http://${HOST}:${port}/html-type`];
        const requestList = await RequestList.open(null, sources);

        const cheerioCrawler = new CheerioCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: ({ $, body }) => {
                expect(body).toBe(responseSamples.html);
                expect($.html()).toBe(body);
            },
        });

        await cheerioCrawler.run();
    });

    describe('should timeout', () => {
        let ll: number;
        beforeAll(() => {
            ll = log.getLevel();
            log.setLevel(log.LEVELS.OFF);
        });

        afterAll(() => {
            log.setLevel(ll);
        });

        test('after navigationTimeoutSecs', async () => {
            const sources = [
                { url: 'http://example.com/?q=0' },
                { url: 'http://example.com/?q=1' },
                { url: 'http://example.com/?q=2' },
            ];
            const processed: Request[] = [];
            const failed: Request[] = [];
            const requestList = await RequestList.open(null, sources);
            const requestHandler: CheerioRequestHandler = ({ request }) => {
                processed.push(request);
            };

            const cheerioCrawler = new CheerioCrawler({
                requestList,
                navigationTimeoutSecs: 5 / 1000,
                maxRequestRetries: 1,
                minConcurrency: 2,
                maxConcurrency: 2,
                requestHandler,
                failedRequestHandler: ({ request }) => {
                    failed.push(request);
                },
            });

            // @ts-expect-error Overriding private method
            cheerioCrawler._requestFunction = async () => {
                await sleep(300);
                return '<html><head></head><body>Body</body></html>';
            };

            await cheerioCrawler.run();

            expect(processed).toHaveLength(0);
            expect(failed).toHaveLength(3);

            failed.forEach((request) => {
                expect(request.errorMessages).toHaveLength(2);
                expect(request.errorMessages[0]).toMatch('request timed out');
                expect(request.errorMessages[1]).toMatch('request timed out');
            });
        });

        test('after requestHandlerTimeoutSecs', async () => {
            const failed: Request[] = [];
            const requestList = await getRequestListForMirror(port);
            const requestHandler = async () => {
                await sleep(2000);
            };

            const cheerioCrawler = new CheerioCrawler({
                requestList,
                requestHandlerTimeoutSecs: 1,
                maxRequestRetries: 1,
                minConcurrency: 2,
                maxConcurrency: 2,
                requestHandler,
                failedRequestHandler: ({ request }) => {
                    failed.push(request);
                },
            });

            // Override low value to prevent seeing timeouts from BasicCrawler
            // @ts-expect-error Overriding private property
            cheerioCrawler.handleRequestTimeoutMillis = 10000;

            await cheerioCrawler.run();

            expect(failed).toHaveLength(4);

            failed.forEach((request) => {
                expect(request.errorMessages).toHaveLength(2);
                expect(request.errorMessages[0]).toMatch('requestHandler timed out');
                expect(request.errorMessages[1]).toMatch('requestHandler timed out');
            });
        });
    });

    describe('should not timeout by the default httpRequest timeoutSecs', () => {
        it('when navigationTimeoutSecs is greater than 30', async () => {
            const sources = [
                { url: `http://${HOST}:${port}/timeout?a=12` },
                { url: `http://${HOST}:${port}/timeout?a=23` },
            ];
            const processed: Request[] = [];
            const failed: Request[] = [];
            const requestList = await RequestList.open(null, sources);
            const requestHandler: CheerioRequestHandler = ({ request }) => {
                processed.push(request);
            };

            const cheerioCrawler = new CheerioCrawler({
                requestList,
                maxRequestRetries: 1,
                navigationTimeoutSecs: 35,
                minConcurrency: 2,
                maxConcurrency: 2,
                requestHandler,
                failedRequestHandler: ({ request }) => {
                    failed.push(request);
                },
            });

            await cheerioCrawler.run();

            expect(processed).toHaveLength(2);
            expect(failed).toHaveLength(0);
        }, 40000);
    });

    describe('should ensure text/html Content-Type', () => {
        test('by setting a correct Accept header', async () => {
            const headers: IncomingHttpHeaders[] = [];
            const requestList = await getRequestListForMirror(port);
            const crawler = new CheerioCrawler({
                requestList,
                requestHandler: ({ response }) => {
                    // TODO: this accesses IncomingMessage#request, which doesn't exist according to types
                    // @ts-expect-error
                    headers.push(response.request.options.headers);
                },
            });

            await crawler.run();
            expect(headers).toHaveLength(4);
            headers.forEach((h) => {
                const acceptHeader = h.accept || h.Accept;
                expect(acceptHeader.includes('text/html')).toBe(true);
                expect(acceptHeader.includes('application/xhtml+xml')).toBe(true);
            });
        });

        describe('by throwing', () => {
            let crawler;
            let handlePageInvocationCount = 0;
            let errorMessages: string[] = [];

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

                crawler = new CheerioCrawler({
                    requestList: await getRequestListForMock(port, {
                        headers: {
                            'content-type': 'text/plain',
                        },
                        statusCode: 200,
                    }),
                    maxRequestRetries: 1,
                    requestHandler: () => {
                        handlePageInvocationCount++;
                    },
                    failedRequestHandler: ({ request }) => {
                        errorMessages = [...errorMessages, ...request.errorMessages];
                    },
                });

                await crawler.run();

                expect(handlePageInvocationCount).toBe(0);
                expect(errorMessages).toHaveLength(4);
                errorMessages.forEach((msg) => expect(msg).toMatch(
                    ' Content-Type text/plain, but only text/html, text/xml, application/xhtml+xml, application/xml, application/json are allowed.'
                    + ' Skipping resource.',
                ));
            });

            test('when statusCode >= 500 and text/html is received', async () => {
                // sometimes if you get blocked you can get 500+ with some html inside
                crawler = new CheerioCrawler({
                    requestList: await getRequestListForMock(port, {
                        statusCode: 508,
                        headers: {
                            'content-type': 'text/html',
                        },
                        body: 'DATABASE ERRROR',
                    }),
                    maxRequestRetries: 1,
                    requestHandler: () => {
                        handlePageInvocationCount++;
                    },
                    failedRequestHandler: ({ request }) => {
                        errorMessages = [...errorMessages, ...request.errorMessages];
                    },
                });
                await crawler.run();

                expect(handlePageInvocationCount).toBe(0);
                expect(errorMessages).toHaveLength(8);
                errorMessages.forEach((msg) => expect(msg).toMatch('Internal Server Error'));
            });

            test('when statusCode >= 500 and application/json is received', async () => {
                crawler = new CheerioCrawler({
                    requestList: await getRequestListForMock(port, {}, 'jsonError'),
                    maxRequestRetries: 1,
                    requestHandler: () => {
                        handlePageInvocationCount++;
                    },
                    failedRequestHandler: ({ request }) => {
                        errorMessages = [...errorMessages, ...request.errorMessages];
                    },
                });
                await crawler.run();

                expect(handlePageInvocationCount).toBe(0);
                expect(errorMessages).toHaveLength(8);
                errorMessages.forEach((msg) => expect(msg).toMatch('CUSTOM_ERROR'));
            });

            test('when 406 is received', async () => {
                // Mock Request to respond with a 406.
                crawler = new CheerioCrawler({
                    requestList: await getRequestListForMock(port, {
                        headers: {
                            'content-type': 'text/plain',
                        },
                        statusCode: 406,
                    }),
                    maxRequestRetries: 1,
                    requestHandler: () => {
                        handlePageInvocationCount++;
                    },
                    failedRequestHandler: ({ request }) => {
                        errorMessages = [...errorMessages, ...request.errorMessages];
                    },
                });
                await crawler.run();

                expect(handlePageInvocationCount).toBe(0);
                expect(errorMessages).toHaveLength(4);
                errorMessages.forEach((msg) => {
                    expect(msg).toMatch('is not available in the format requested by the Accept header. Skipping resource.');
                });
            });
        });
    });

    test('should work with all defaults content types', async () => {
        let handledRequests = 0;
        const contentTypes = ['text/html', 'application/xhtml+xml', 'text/xml', 'application/xml', 'application/json'];
        const sources: Source[] = contentTypes.map((contentType) => ({
            url: `http://${HOST}:${port}/mock?ct=${contentType}`,
            payload: JSON.stringify({ headers: { 'Content-Type': contentType }, statusCode: 200 }),
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }));
        const requestList = await RequestList.open({
            sources,
        });
        const crawler = new CheerioCrawler({
            requestList,
            requestHandler: () => {
                handledRequests++;
            },
        });
        await crawler.run();
        expect(handledRequests).toEqual(contentTypes.length);
    });

    describe('should work with all content types from options.additionalMimeTypes', () => {
        let handlePageInvocationParams: CheerioCrawlingContext;
        let handleFailedInvoked = false;
        const runCrawler = async (url: string) => {
            const sources = [url];
            const requestList = await RequestList.open(null, sources);
            const crawler = new CheerioCrawler({
                requestList,
                additionalMimeTypes: ['application/json', 'image/png', 'application/xml'],
                maxRequestRetries: 1,
                requestHandler: (params) => {
                    handlePageInvocationParams = params;
                },
                failedRequestHandler: () => {
                    handleFailedInvoked = true;
                },
            });
            await crawler.run();
        };

        test('when response is application/json', async () => {
            const url = `http://${HOST}:${port}/json-type`;
            await runCrawler(url);
            expect(handlePageInvocationParams.json).toBeInstanceOf(Object);
            expect(handlePageInvocationParams.body).toEqual(Buffer.from(JSON.stringify(responseSamples.json)));
            expect(handlePageInvocationParams.contentType.type).toBe('application/json');
            expect(handleFailedInvoked).toBe(false);
        });
        test('when response is application/xml', async () => {
            const url = `http://${HOST}:${port}/xml-type`;
            await runCrawler(url);
            expect(typeof handlePageInvocationParams.body).toBe('string');
            expect(handlePageInvocationParams.body).toEqual(responseSamples.xml);
            expect(handlePageInvocationParams.$).toBeInstanceOf(Function);
            expect(handlePageInvocationParams.contentType.type).toBe('application/xml');
        });
        test('when response is image/png', async () => {
            const url = `http://${HOST}:${port}/image-type`;
            await runCrawler(url);
            expect(handlePageInvocationParams.body).toBeInstanceOf(Buffer);
            expect(handlePageInvocationParams.body).toEqual(responseSamples.image);
            expect(handlePageInvocationParams.contentType.type).toBe('image/png');
        });
    });

    describe('should use response encoding', () => {
        const html = '<html>Žluťoučký kůň</html>';

        test('as a fallback', async () => {
            const requestList = await RequestList.open({
                sources: ['http://useless.x'],
            });
            const suggestResponseEncoding = 'windows-1250';
            const buf = iconv.encode(html, suggestResponseEncoding);
            // Ensure it's really encoded.
            expect(buf.toString('utf8')).not.toBe(html);

            const crawler = new CheerioCrawler({
                requestList,
                requestHandler: () => {},
                suggestResponseEncoding,
            });

            const stream = Readable.from([buf]);

            // @ts-expect-error Using private method
            const { response, encoding } = crawler._encodeResponse({}, stream);
            expect(encoding).toBe('utf8');
            for await (const chunk of response) {
                const string = chunk.toString('utf8');
                expect(string).toBe(html);
            }
        });

        test('always when forced', async () => {
            const requestList = await RequestList.open({
                sources: ['http://useless.x'],
            });
            const forceResponseEncoding = 'win1250';
            const buf = iconv.encode(html, forceResponseEncoding);
            // Ensure it's really encoded.
            expect(buf.toString('utf8')).not.toBe(html);

            const crawler = new CheerioCrawler({
                requestList,
                requestHandler: () => {},
                forceResponseEncoding,
            });

            const stream = Readable.from([buf]);

            // @ts-expect-error Using private method
            const { response, encoding } = crawler._encodeResponse({}, stream, 'ascii');
            expect(encoding).toBe('utf8');
            for await (const chunk of response) {
                const string = chunk.toString('utf8');
                expect(string).toBe(html);
            }
        });
    });

    describe('proxy', () => {
        beforeEach(async () => {
            // Do not use clearAllMocks: https://github.com/facebook/jest/issues/7136
            jest.restoreAllMocks();
        });

        test('should work with Apify Proxy configuration', async () => {
            const proxyUrl = `http://${HOST}:${port}/`;
            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls: [proxyUrl],
            });

            const requestList = await getRequestListForMirror(port);

            const proxies: string[] = [];
            const crawler = new CheerioCrawler({
                requestList,
                requestHandler: ({ proxyInfo }) => {
                    proxies.push(proxyInfo.url);
                },
                proxyConfiguration,
            });

            await crawler.run();

            expect(proxies[0]).toEqual(proxyUrl);
            expect(proxies[1]).toEqual(proxyUrl);
            expect(proxies[2]).toEqual(proxyUrl);
            expect(proxies[3]).toEqual(proxyUrl);
        });

        test('requestHandler should expose the proxyInfo object with sessions correctly', async () => {
            const proxyUrls = [0, 1, 2, 3].map((n) => `http://${HOST}:${port}/proxy?x=${n}`);
            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls,
            });

            const proxies: ProxyInfo[] = [];
            const sessions: Session[] = [];
            const requestHandler = ({ session, proxyInfo }: CheerioCrawlingContext) => {
                proxies.push(proxyInfo);
                sessions.push(session);
            };

            const requestList = await getRequestListForMirror(port);

            const crawler = new CheerioCrawler({
                requestList,
                requestHandler,
                proxyConfiguration,
                useSessionPool: true,
            });

            await crawler.run();

            for (let i = 0; i < 4; i++) {
                const proxyInfo = proxies[i];
                const session = sessions[i];
                expect(typeof proxyInfo.url).toBe('string');
                expect(typeof session.id).toBe('string');
                expect(proxyInfo.sessionId).toBe(session.id);
                expect(proxyInfo).toEqual(await proxyConfiguration.newProxyInfo(session.id));
            }
        });
    });

    describe('SessionPool', () => {
        const sources = ['http://example.com/'];
        let requestList: RequestList;

        beforeEach(async () => {
            requestList = await RequestList.open(null, sources.slice());
        });

        test('should work', async () => {
            const crawler = new CheerioCrawler({
                requestList,
                useSessionPool: true,
                persistCookiesPerSession: false,
                requestHandler: ({ session }) => {
                    expect(session).toBeInstanceOf(Session);
                },
            });
            await crawler.run();
            expect.assertions(1);
        });

        test('should correctly set session pool options', async () => {
            const crawler = new CheerioCrawler({
                requestList,
                useSessionPool: true,
                persistCookiesPerSession: false,
                sessionPoolOptions: {
                    sessionOptions: {
                        maxUsageCount: 1,
                    },
                    persistStateKeyValueStoreId: 'abc',
                },
                requestHandler: () => {},
            });
            // @ts-expect-error Accessing private prop
            expect(crawler.sessionPoolOptions.sessionOptions.maxUsageCount).toBe(1);
            // @ts-expect-error Accessing private prop
            expect(crawler.sessionPoolOptions.persistStateKeyValueStoreId).toBe('abc');
        });

        test('should markBad sessions after request timeout', async () => {
            // log.setLevel(log.LEVELS.OFF);
            const cheerioCrawler = new CheerioCrawler({
                requestList: await RequestList.open(null, [
                    `http://${HOST}:${port}/timeout?a=12`,
                    `http://${HOST}:${port}/timeout?a=23`,
                ]),
                maxRequestRetries: 1,
                navigationTimeoutSecs: 1,
                maxConcurrency: 1,
                useSessionPool: true,
                requestHandler: async () => {
                    await sleep(1);
                },
            });

            await cheerioCrawler.run();

            const { sessions } = cheerioCrawler.sessionPool;
            expect(sessions.length).toBe(4);
            sessions.forEach((session) => {
                // TODO this test is flaky in CI and we need some more info to debug why.
                // @ts-expect-error Accessing private prop
                if (session.errorScore !== 1) {
                    // eslint-disable-next-line no-console
                    console.log('SESSIONS:');
                    // eslint-disable-next-line no-console
                    console.dir(sessions);
                }

                // TODO too flaky
                // expect(session.errorScore).toEqual(1);
            });

            // log.setLevel(log.LEVELS.ERROR);
        });

        test('should retire session on "blocked" status codes', async () => {
            for (const code of STATUS_CODES_BLOCKED) {
                const failed: Request[] = [];
                const sessions: Session[] = [];
                const crawler = new CheerioCrawler({
                    requestList: await getRequestListForMock(port, {
                        statusCode: code,
                        error: false,
                        headers: { 'Content-type': 'text/html' },
                    }),
                    useSessionPool: true,
                    persistCookiesPerSession: false,
                    maxRequestRetries: 0,
                    requestHandler: ({ session }) => {
                        sessions.push(session);
                    },
                    failedRequestHandler: ({ request }) => {
                        failed.push(request);
                    },
                });
                await crawler.run();

                expect(crawler.sessionPool.sessions.length).toBe(4);
                // eslint-disable-next-line no-loop-func
                crawler.sessionPool.sessions.forEach((session) => {
                    // @ts-expect-error Accessing private prop
                    expect(session.errorScore).toBeGreaterThanOrEqual(session.maxErrorScore);
                });

                expect(failed.length).toBe(4);
                // eslint-disable-next-line no-loop-func
                failed.forEach((request) => {
                    expect(request.errorMessages[0].includes(`Request blocked - received ${code} status code`)).toBeTruthy();
                });
            }
        });

        test('should throw when "options.useSessionPool" false and "options.persistCookiesPerSession" is true', async () => {
            try {
                // eslint-disable-next-line no-new
                new CheerioCrawler({
                    requestList: await getRequestListForMock(port, {}),
                    useSessionPool: false,
                    persistCookiesPerSession: true,
                    maxRequestRetries: 0,
                    requestHandler: () => {
                    },
                });
            } catch (e) {
                expect((e as Error).message).toEqual('You cannot use "persistCookiesPerSession" without "useSessionPool" set to true.');
            }
        });

        test('should send cookies', async () => {
            const cookie = 'SESSID=abcd123';
            const requests: Request[] = [];
            const crawler = new CheerioCrawler({
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
                requestHandler: ({ request }) => {
                    requests.push(request);
                },

            });

            await crawler.run();
            requests.forEach((_req, i) => {
                if (i >= 1) {
                    // @ts-expect-error FIXME
                    expect(gotScrapingSpy.mock.calls[i][0].headers.Cookie).toBe(cookie);
                }
            });
        });

        test('should merge cookies set in pre-nav hook with the session ones', async () => {
            const responses: unknown[] = [];
            const gotOptions: OptionsInit[] = [];
            const crawler = new CheerioCrawler({
                requestList: await RequestList.open(null, [{
                    url: `http://${HOST}:${port}/headers`,
                    headers: { cookie: 'foo=bar2; baz=123' },
                }]),
                useSessionPool: true,
                persistCookiesPerSession: false,
                sessionPoolOptions: {
                    maxPoolSize: 1,
                },
                requestHandler: ({ json }) => {
                    responses.push(json);
                },
                preNavigationHooks: [(_context, options) => {
                    gotOptions.push(options);
                }],
            });

            const sessSpy = jest.spyOn(Session.prototype, 'getCookieString');
            sessSpy.mockReturnValueOnce('foo=bar1; other=cookie1; coo=kie');
            await crawler.run();
            expect(responses).toHaveLength(1);
            expect(responses[0]).toMatchObject({
                headers: {
                    cookie: 'foo=bar2; other=cookie1; coo=kie; baz=123',
                },
            });
            expect(gotOptions).toHaveLength(1);
            expect(gotOptions[0]).toMatchObject({
                headers: {
                    Cookie: 'foo=bar2; other=cookie1; coo=kie; baz=123', // header name normalized to `Cookie`
                },
            });
        });

        test('should work with cookies adjusted on `context.request` in pre-nav hook', async () => {
            const responses: unknown[] = [];
            const crawler = new CheerioCrawler({
                requestList: await RequestList.open(null, [{
                    url: `http://${HOST}:${port}/headers`,
                    headers: { cookie: 'foo=bar2; baz=123' },
                }]),
                useSessionPool: true,
                persistCookiesPerSession: false,
                sessionPoolOptions: {
                    maxPoolSize: 1,
                },
                requestHandler: ({ json }) => {
                    responses.push(json);
                },
                preNavigationHooks: [({ request }) => {
                    request.headers.Cookie = 'foo=override; coo=kie';
                }],
            });

            await crawler.run();
            expect(responses).toHaveLength(1);
            expect(responses[0]).toMatchObject({
                headers: {
                    cookie: 'foo=override; baz=123; coo=kie',
                },
            });
        });

        test('should work with `context.request.headers` being undefined', async () => {
            const requests: Request[] = [];
            const responses: unknown[] = [];
            const crawler = new CheerioCrawler({
                requestList: await RequestList.open(null, [{
                    url: `http://${HOST}:${port}/headers`,
                }]),
                useSessionPool: true,
                requestHandler: async ({ json, request }) => {
                    responses.push(json);
                    requests.push(request);
                },
                preNavigationHooks: [({ request }) => {
                    request.headers.Cookie = 'foo=override; coo=kie';
                }],
            });

            await crawler.run();
            expect(requests).toHaveLength(1);
            expect(requests[0].retryCount).toBe(0);
            expect(responses).toHaveLength(1);
            expect(responses[0]).toMatchObject({
                headers: {
                    cookie: 'foo=override; coo=kie',
                },
            });
        });

        test('mergeCookies()', async () => {
            const deprecatedSpy = jest.spyOn(Log.prototype, 'deprecated');
            const cookie1 = mergeCookies('https://example.com', [
                'foo=bar1; other=cookie1 ; coo=kie',
                'foo=bar2; baz=123',
                'other=cookie2;foo=bar3',
            ]);
            expect(cookie1).toBe('foo=bar3; other=cookie2; coo=kie; baz=123');
            expect(deprecatedSpy).not.toBeCalled();

            const cookie2 = mergeCookies('https://example.com', [
                'Foo=bar1; other=cookie1 ; coo=kie',
                'foo=bar2; baz=123',
                'Other=cookie2;foo=bar3',
            ]);
            expect(cookie2).toBe('Foo=bar1; other=cookie1; coo=kie; foo=bar3; baz=123; Other=cookie2');
            expect(deprecatedSpy).toBeCalledTimes(3);
            expect(deprecatedSpy).toBeCalledWith(`Found cookies with similar name during cookie merging: 'foo' and 'Foo'`);
            expect(deprecatedSpy).toBeCalledWith(`Found cookies with similar name during cookie merging: 'Other' and 'other'`);
            deprecatedSpy.mockClear();

            const cookie3 = mergeCookies('https://example.com', [
                'foo=bar1; Other=cookie1 ; Coo=kie',
                'foo=bar2; baz=123',
                'Other=cookie2;Foo=bar3;coo=kee',
            ]);
            expect(cookie3).toBe('foo=bar2; Other=cookie2; Coo=kie; baz=123; Foo=bar3; coo=kee');
            expect(deprecatedSpy).toBeCalledTimes(2);
            expect(deprecatedSpy).toBeCalledWith(`Found cookies with similar name during cookie merging: 'Foo' and 'foo'`);
            expect(deprecatedSpy).toBeCalledWith(`Found cookies with similar name during cookie merging: 'coo' and 'Coo'`);
        });

        test('should use sessionId in proxyUrl when the session pool is enabled', async () => {
            const sourcesNew = [
                { url: 'http://example.com/?q=1' },
            ];
            const requestListNew = await RequestList.open({ sources: sourcesNew });
            let usedSession: Session;

            const proxyConfiguration = new ProxyConfiguration({ proxyUrls: ['http://localhost:8080'] });
            const newUrlSpy = jest.spyOn(proxyConfiguration, 'newUrl');
            const cheerioCrawler = new CheerioCrawler({
                requestList: requestListNew,
                maxRequestRetries: 0,
                requestHandler: () => {},
                failedRequestHandler: () => {},
                useSessionPool: true,
                proxyConfiguration,
            });

            // @ts-expect-error Accessing private method
            const oldHandleRequestF = cheerioCrawler._runRequestHandler;
            // @ts-expect-error Overriding private method
            cheerioCrawler._runRequestHandler = (opts) => {
                usedSession = opts.session;
                return oldHandleRequestF.call(cheerioCrawler, opts);
            };

            await cheerioCrawler.run();

            expect(newUrlSpy).toBeCalledWith(usedSession.id);
        });
    });

    describe('Crawling context', () => {
        const sources = ['http://example.com/'];
        let requestList: RequestList;
        let actualLogLevel: number;
        beforeEach(async () => {
            actualLogLevel = log.getLevel();
            log.setLevel(log.LEVELS.OFF);
            requestList = await RequestList.open(null, sources.slice());
        });

        afterAll(() => {
            log.setLevel(actualLogLevel);
        });

        test('uses correct crawling context', async () => {
            let prepareCrawlingContext: CheerioCrawlingContext;

            const prepareRequestFunction = (crawlingContext: CheerioCrawlingContext) => {
                prepareCrawlingContext = crawlingContext;
                expect(crawlingContext.request).toBeInstanceOf(Request);
                expect(crawlingContext.crawler.autoscaledPool).toBeInstanceOf(AutoscaledPool);
                expect(crawlingContext.session).toBeInstanceOf(Session);
            };

            const requestHandler = (crawlingContext: CheerioCrawlingContext) => {
                expect(crawlingContext === prepareCrawlingContext).toEqual(true);
                expect(crawlingContext.request).toBeInstanceOf(Request);
                expect(crawlingContext.crawler.autoscaledPool).toBeInstanceOf(AutoscaledPool);
                expect(crawlingContext.session).toBeInstanceOf(Session);
                expect(typeof crawlingContext.$).toBe('function');
                expect(typeof crawlingContext.response).toBe('object');
                expect(typeof crawlingContext.contentType).toBe('object');

                throw new Error('some error');
            };

            const failedRequestHandler = (crawlingContext: CheerioCrawlingContext, error: Error) => {
                expect(crawlingContext === prepareCrawlingContext).toEqual(true);
                expect(crawlingContext.request).toBeInstanceOf(Request);
                expect(crawlingContext.crawler.autoscaledPool).toBeInstanceOf(AutoscaledPool);
                expect(crawlingContext.session).toBeInstanceOf(Session);
                expect(typeof crawlingContext.$).toBe('function');
                expect(typeof crawlingContext.response).toBe('object');
                expect(typeof crawlingContext.contentType).toBe('object');

                expect(crawlingContext.error).toBeUndefined();
                expect(error).toBeInstanceOf(Error);
                expect(error.message).toEqual('some error');
            };

            const cheerioCrawler = new CheerioCrawler({
                requestList,
                maxRequestRetries: 0,
                maxConcurrency: 1,
                useSessionPool: true,
                preNavigationHooks: [prepareRequestFunction],
                requestHandler,
                failedRequestHandler,
            });
            await cheerioCrawler.run();
        });

        test('failedRequestHandler contains proxyInfo', async () => {
            const proxyConfiguration = new ProxyConfiguration({ proxyUrls: ['http://localhost:8080'] });

            const cheerioCrawler = new CheerioCrawler({
                requestList,
                maxRequestRetries: 0,
                maxConcurrency: 1,
                proxyConfiguration,
                requestHandler: () => {
                    throw new Error('some error');
                },
                failedRequestHandler: (crawlingContext) => {
                    expect(typeof crawlingContext.proxyInfo).toEqual('object');
                    expect(crawlingContext.proxyInfo.hasOwnProperty('url')).toEqual(true);
                },
                useSessionPool: true,
            });
            await cheerioCrawler.run();
        });
    });

    describe('use', () => {
        const sources = ['http://example.com/'];
        let requestList: RequestList;

        class DummyExtension extends CrawlerExtension {
            constructor(readonly options: Dictionary) {
                super();
            }

            override getCrawlerOptions() {
                return this.options;
            }
        }

        beforeEach(async () => {
            requestList = await RequestList.open(null, sources.slice());
        });

        test('should throw if "CrawlerExtension" class is not used', () => {
            const cheerioCrawler = new CheerioCrawler({
                requestList,
                maxRequestRetries: 0,
                requestHandler: () => {
                },
                failedRequestHandler: () => {
                },
            });
            expect(
                // @ts-expect-error Validating JS side checks
                () => cheerioCrawler.use({}),
            ).toThrow('Expected object `{}` to be of type `CrawlerExtension`');
        });

        test('Should throw if "CrawlerExtension" is trying to override non existing property', () => {
            const extension = new DummyExtension({
                doesNotExist: true,
            });
            const cheerioCrawler = new CheerioCrawler({
                requestList,
                maxRequestRetries: 0,
                requestHandler: () => {},
                failedRequestHandler: () => {},
            });
            expect(
                () => cheerioCrawler.use(extension),
            )
                .toThrow('DummyExtension tries to set property "doesNotExist" that is not configurable on CheerioCrawler instance.');
        });

        test('should override crawler properties', () => {
            const extension = new DummyExtension({
                useSessionPool: true,
                requestHandler: undefined,
            });
            const cheerioCrawler = new CheerioCrawler({
                requestList,
                useSessionPool: false,
                maxRequestRetries: 0,
                requestHandler: () => {
                },
                failedRequestHandler: () => {
                },
            });
            // @ts-expect-error Accessing private prop
            expect(cheerioCrawler.useSessionPool).toEqual(false);
            cheerioCrawler.use(extension);
            // @ts-expect-error Accessing private prop
            expect(cheerioCrawler.useSessionPool).toEqual(true);
            // @ts-expect-error Accessing private prop
            expect(cheerioCrawler.requestHandler).toBeUndefined();
            // @ts-expect-error Accessing private prop
            expect(cheerioCrawler.requestHandler).toBeUndefined();
        });
    });
});

async function getRequestListForMock(port: number, mockData: Dictionary, pathName = 'mock') {
    const sources: Source[] = [1, 2, 3, 4].map((num) => {
        return {
            url: `http://${HOST}:${port}/${pathName}?a=${num}`,
            payload: JSON.stringify(mockData),
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        };
    });
    const requestList = await RequestList.open(null, sources);
    return requestList;
}

async function getRequestListForMirror(port: number) {
    const sources = [
        { url: `http://${HOST}:${port}/mirror?a=12` },
        { url: `http://${HOST}:${port}/mirror?a=23` },
        { url: `http://${HOST}:${port}/mirror?a=33` },
        { url: `http://${HOST}:${port}/mirror?a=43` },
    ];
    const requestList = await RequestList.open(null, sources);
    return requestList;
}

async function startExpressAppPromise(expressApp: express.Application, port: number) {
    return new Promise<Server>((resolve) => {
        const server = expressApp.listen(port, () => resolve(server));
    });
}
