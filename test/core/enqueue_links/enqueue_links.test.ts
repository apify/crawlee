import { type AddRequestsBatchedOptions, cheerioCrawlerEnqueueLinks } from '@crawlee/cheerio';
import { launchPlaywright } from '@crawlee/playwright';
import type { RequestQueueOperationOptions, Source } from '@crawlee/puppeteer';
import {
    browserCrawlerEnqueueLinks,
    Configuration,
    EnqueueStrategy,
    launchPuppeteer,
    RequestQueue,
} from '@crawlee/puppeteer';
import { type CheerioRoot } from '@crawlee/utils';
import { load } from 'cheerio';
import type { Browser as PlaywrightBrowser, Page as PlaywrightPage } from 'playwright';
import type { Browser as PuppeteerBrowser, Page as PuppeteerPage } from 'puppeteer';

import log from '@apify/log';

const apifyClient = Configuration.getStorageClient();

const HTML = `
<html>
    <head>
        <title>Example</title>
    </head>
    <body>
        <p>
            The ships hung in the sky, much the <a class="click" href="https://example.com/a/b/first">way that</a> bricks don't.
        </p>
        <ul>
            <li>These aren't the Droids you're looking for</li>
            <li><a href="https://example.com/a/second">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
            <li><a class="click" href="https://example.com/a/b/third">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
        </ul>
        <a class="click" href="https://another.com/a/fifth">The Greatest Science Fiction Quotes Of All Time</a>
        <p>
            Don't know, I don't know such stuff. I just do eyes, ju-, ju-, just eyes... just genetic design,
            just eyes. You Nexus, huh? I design your <a class="click" href="http://cool.com/">eyes</a>.
        </p>
        <a href="/x/absolutepath">This is a relative link.</a>
        <a href="y/relativepath">This is a relative link.</a>
        <a href="//example.absolute.com/hello">This is a link to a different subdomain</a>
        <a href="http://">Invalid URL link, this needs to be ignored</a>
    </body>
</html>
`;

function createRequestQueueMock() {
    const enqueued: Source[] = [];
    const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

    // @ts-expect-error Override method for testing
    requestQueue.addRequests = async function (requests) {
        const processedRequests: Source[] = [];
        for await (const request of requests) {
            processedRequests.push(typeof request === 'string' ? { url: request } : request);
        }
        enqueued.push(...processedRequests);
        return { processedRequests, unprocessedRequests: [] as never[] };
    };

    return { enqueued, requestQueue };
}

describe('enqueueLinks()', () => {
    let ll: number;
    beforeAll(() => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    afterAll(() => {
        log.setLevel(ll);
    });

    describe.each([[launchPuppeteer], [launchPlaywright]] as const)('using %s', (method) => {
        let browser: PuppeteerBrowser | PlaywrightBrowser;
        let page: PuppeteerPage | PlaywrightPage;

        beforeEach(async () => {
            browser = (await method({ launchOptions: { headless: true } })) as PlaywrightBrowser | PuppeteerBrowser;
            page = await browser.newPage();
            await page.setContent(HTML);
        });

        afterEach(async () => {
            if (browser) await browser.close();
            page = null!;
            browser = null!;
        });

        test('works with item limit', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            await browserCrawlerEnqueueLinks({
                options: { limit: 3, selector: '.click', strategy: EnqueueStrategy.All },
                page,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://another.com/a/fifth');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3]).toBe(undefined);
        });

        test('works with globs', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            const globs = ['https://example.com/**/*', { glob: '?(http|https)://cool.com/', method: 'POST' as const }];

            await browserCrawlerEnqueueLinks({
                options: {
                    selector: '.click',
                    label: 'COOL',
                    globs,
                    transformRequestFunction: (request) => {
                        if (request.url.match(/example\.com\/a\/b\/third/)) {
                            request.method = 'OPTIONS';
                        }
                        return request;
                    },
                },
                page,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({ label: 'COOL' });

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('OPTIONS');
            expect(enqueued[1].userData).toEqual({ label: 'COOL' });

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('POST');
            expect(enqueued[2].userData).toEqual({ label: 'COOL' });
        });

        test('does not throw with empty globs', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            const globs = [
                'https://example.com/**/*',
                '',
                { glob: ' ' },
                // Empty string used to throw an error (https://console.apify.com/actors/aYG0l9s7dbB7j3gbS/issues/Wd0Ahfk9Vd2OPk4Uf)
                { glob: '' },
                { glob: '?(http|https)://cool.com/', method: 'POST' as const },
            ];

            await expect(
                browserCrawlerEnqueueLinks({
                    options: { selector: '.click', globs },
                    page,
                    requestQueue,
                    originalRequestUrl: 'https://example.com',
                }),
            ).resolves.not.toThrow();

            expect(enqueued).toHaveLength(3);
        });

        test('works with regexps', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            const regexps = [
                /^https:\/\/example\.com\/(\w|\/)+/,
                { regexp: /^(http|https):\/\/cool\.com\//, method: 'POST' as const, userData: { label: 'COOL' } },
            ];

            await browserCrawlerEnqueueLinks({
                options: {
                    selector: '.click',
                    regexps,
                    transformRequestFunction: (request) => {
                        if (request.url.match(/example\.com\/a\/b\/third/)) {
                            request.method = 'OPTIONS';
                        }
                        return request;
                    },
                },
                page,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('OPTIONS');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('POST');
            expect(enqueued[2].userData).toEqual({ label: 'COOL' });
        });

        test('works with skipNavigation', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();

            await browserCrawlerEnqueueLinks({
                options: {
                    selector: '.click',
                    skipNavigation: true,
                },
                page,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(2);

            for (const request of enqueued) {
                expect(request.skipNavigation).toBe(true);
            }
        });

        test('works with exclude glob', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            const globs = ['https://example.com/**/*', { glob: '?(http|https)://cool.com/', method: 'POST' as const }];

            const exclude = ['**/first'];

            await browserCrawlerEnqueueLinks({
                options: {
                    selector: '.click',
                    label: 'COOL',
                    globs,
                    exclude,
                    transformRequestFunction: (request) => {
                        if (request.url.match(/example\.com\/a\/b\/third/)) {
                            request.method = 'OPTIONS';
                        }
                        return request;
                    },
                },
                page,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(2);

            expect(enqueued[0].url).not.toBe('https://example.com/a/b/first');
            expect(enqueued[1].url).not.toBe('https://example.com/a/b/first');

            expect(enqueued[0].url).toBe('https://example.com/a/b/third');
            expect(enqueued[0].method).toBe('OPTIONS');
            expect(enqueued[0].userData).toEqual({ label: 'COOL' });

            expect(enqueued[1].url).toBe('http://cool.com/');
            expect(enqueued[1].method).toBe('POST');
            expect(enqueued[1].userData).toEqual({ label: 'COOL' });
        });

        test('works with exclude regexp', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            const globs = ['https://example.com/**/*', { glob: '?(http|https)://cool.com/', method: 'POST' as const }];

            const exclude = [/first/];

            await browserCrawlerEnqueueLinks({
                options: {
                    selector: '.click',
                    label: 'COOL',
                    globs,
                    exclude,
                    transformRequestFunction: (request) => {
                        if (request.url.match(/example\.com\/a\/b\/third/)) {
                            request.method = 'OPTIONS';
                        }
                        return request;
                    },
                },
                page,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(2);

            expect(enqueued[0].url).not.toBe('https://example.com/a/b/first');
            expect(enqueued[1].url).not.toBe('https://example.com/a/b/first');

            expect(enqueued[0].url).toBe('https://example.com/a/b/third');
            expect(enqueued[0].method).toBe('OPTIONS');
            expect(enqueued[0].userData).toEqual({ label: 'COOL' });

            expect(enqueued[1].url).toBe('http://cool.com/');
            expect(enqueued[1].method).toBe('POST');
            expect(enqueued[1].userData).toEqual({ label: 'COOL' });
        });

        test('works with pseudoUrls', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            const pseudoUrls = [
                'https://example.com/[(\\w|-|/)*]',
                { purl: '[http|https]://cool.com/', method: 'POST' as const, userData: { label: 'COOL' } },
            ];

            await browserCrawlerEnqueueLinks({
                options: {
                    selector: '.click',
                    pseudoUrls,
                    transformRequestFunction: (request) => {
                        if (request.url.match(/example\.com\/a\/b\/third/)) {
                            request.method = 'OPTIONS';
                        }
                        return request;
                    },
                },
                page,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('OPTIONS');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('POST');
            expect(enqueued[2].userData).toEqual({ label: 'COOL' });
        });

        test('throws with RegExp pseudoUrls', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();

            const pseudoUrls = [/https:\/\/example\.com\/(\w|-|\/)*/, /(http|https):\/\/cool\.com\//];

            await expect(
                browserCrawlerEnqueueLinks({
                    // @ts-expect-error Type 'RegExp[]' is not assignable to type 'PseudoUrlInput[]'
                    options: { selector: '.click', pseudoUrls },
                    page,
                    requestQueue,
                    originalRequestUrl: 'https://example.com',
                }),
            ).rejects.toThrow(/to be of type `string` but received type `RegExp`/);
        });

        test('works with undefined pseudoUrls[]', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();

            await browserCrawlerEnqueueLinks({
                options: { selector: '.click', strategy: EnqueueStrategy.All },
                page,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(4);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://another.com/a/fifth');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3].url).toBe('http://cool.com/');
            expect(enqueued[3].method).toBe('GET');
            expect(enqueued[3].userData).toEqual({});
        });

        test('throws with null pseudoUrls[]', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            await expect(
                browserCrawlerEnqueueLinks({
                    // @ts-expect-error invalid input
                    options: { selector: '.click', pseudoUrls: null },
                    page,
                    requestQueue,
                    originalRequestUrl: 'https://example.com',
                }),
            ).rejects.toThrow(/Expected property `pseudoUrls` to be of type `array` but received type `null`/);
        });

        test('works with empty pseudoUrls[]', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            await browserCrawlerEnqueueLinks({
                options: { selector: '.click', pseudoUrls: [], strategy: EnqueueStrategy.All },
                page,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(4);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://another.com/a/fifth');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3].url).toBe('http://cool.com/');
            expect(enqueued[3].method).toBe('GET');
            expect(enqueued[3].userData).toEqual({});
        });

        test('throws with sparse pseudoUrls[]', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            const pseudoUrls = ['https://example.com/[(\\w|-|/)*]', null, '[http|https]://cool.com/'];

            await expect(
                browserCrawlerEnqueueLinks({
                    // @ts-expect-error invalid input
                    options: { selector: '.click', pseudoUrls },
                    page,
                    requestQueue,
                    originalRequestUrl: 'https://example.com',
                }),
            ).rejects.toThrow(/\(array `pseudoUrls`\) Any predicate failed with the following errors/);
            expect(enqueued).toHaveLength(0);
        });

        test('correctly resolves relative URLs with default strategy of same-hostname', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            await browserCrawlerEnqueueLinks({
                options: { baseUrl: 'http://www.absolute.com/removethis/' },
                page,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(2);

            expect(enqueued[0].url).toBe('http://www.absolute.com/x/absolutepath');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('http://www.absolute.com/removethis/y/relativepath');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});
        });

        test('correctly resolves relative URLs with the strategy of same-domain', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            await browserCrawlerEnqueueLinks({
                options: { baseUrl: 'http://www.absolute.com/removethis/', strategy: EnqueueStrategy.SameDomain },
                page,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('http://www.absolute.com/x/absolutepath');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('http://www.absolute.com/removethis/y/relativepath');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://example.absolute.com/hello');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});
        });

        test('correctly resolves relative URLs with the strategy of all', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            await browserCrawlerEnqueueLinks({
                options: { baseUrl: 'http://www.absolute.com/removethis/', strategy: EnqueueStrategy.All },
                page,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(8);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/second');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://example.com/a/b/third');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3].url).toBe('https://another.com/a/fifth');
            expect(enqueued[3].method).toBe('GET');
            expect(enqueued[3].userData).toEqual({});

            expect(enqueued[4].url).toBe('http://cool.com/');
            expect(enqueued[4].method).toBe('GET');
            expect(enqueued[4].userData).toEqual({});

            expect(enqueued[5].url).toBe('http://www.absolute.com/x/absolutepath');
            expect(enqueued[5].method).toBe('GET');
            expect(enqueued[5].userData).toEqual({});

            expect(enqueued[6].url).toBe('http://www.absolute.com/removethis/y/relativepath');
            expect(enqueued[6].method).toBe('GET');
            expect(enqueued[6].userData).toEqual({});

            expect(enqueued[7].url).toBe('http://example.absolute.com/hello');
            expect(enqueued[7].method).toBe('GET');
            expect(enqueued[7].userData).toEqual({});
        });

        test('correctly works with transformRequestFunction', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();

            const pseudoUrls = ['https://example.com/[(\\w|-|/)*]', '[http|https]://cool.com/'];

            await browserCrawlerEnqueueLinks({
                options: {
                    selector: '.click',
                    pseudoUrls,
                    transformRequestFunction: (request) => {
                        if (request.url.includes('example.com')) {
                            request.method = 'POST';
                        } else if (request.url.includes('cool.com')) {
                            request.userData!.foo = 'bar';
                        }
                        return request;
                    },
                },
                page,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('POST');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('POST');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData!.foo).toBe('bar');
        });
    });

    describe('using Cheerio', () => {
        let $: CheerioRoot;

        beforeEach(async () => {
            $ = load(HTML);
        });

        afterEach(async () => {
            $ = null!;
        });

        test('works with globs', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            const globs = [
                'https://example.com/**/*',
                { glob: '?(http|https)://cool.com/', method: 'POST' as const, userData: { label: 'COOL' } },
            ];

            await cheerioCrawlerEnqueueLinks({
                options: {
                    selector: '.click',
                    globs,
                    transformRequestFunction: (request) => {
                        if (request.url.match(/example\.com\/a\/b\/third/)) {
                            request.method = 'OPTIONS';
                        }
                        return request;
                    },
                },
                $,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('OPTIONS');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('POST');
            expect(enqueued[2].userData).toEqual({ label: 'COOL' });
        });

        test('does not throw with empty globs', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            const globs = [
                'https://example.com/**/*',
                { glob: '?(http|https)://cool.com/', method: 'POST' as const, userData: { label: 'COOL' } },
                '',
                { glob: ' ' },
            ];

            await expect(
                cheerioCrawlerEnqueueLinks({
                    options: { selector: '.click', globs },
                    $,
                    requestQueue,
                    originalRequestUrl: 'https://example.com',
                }),
            ).resolves.not.toThrow();

            expect(enqueued).toHaveLength(3);
        });

        test('works with RegExps', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            const regexps = [
                /^https:\/\/example\.com\/(\w|\/)+/,
                { regexp: /^(http|https):\/\/cool\.com\//, method: 'POST' as const, userData: { label: 'COOL' } },
            ];

            await cheerioCrawlerEnqueueLinks({
                options: {
                    selector: '.click',
                    regexps,
                    transformRequestFunction: (request) => {
                        if (request.url.match(/example\.com\/a\/b\/third/)) {
                            request.method = 'OPTIONS';
                        }
                        return request;
                    },
                },
                $,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('OPTIONS');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('POST');
            expect(enqueued[2].userData).toEqual({ label: 'COOL' });
        });

        test('works with string pseudoUrls', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            const pseudoUrls = [
                'https://example.com/[(\\w|-|/)*]',
                { purl: '[http|https]://cool.com/', method: 'POST' as const, userData: { label: 'COOL' } },
            ];

            await cheerioCrawlerEnqueueLinks({
                options: {
                    selector: '.click',
                    userData: { label: 'DEFAULT' },
                    pseudoUrls,
                    transformRequestFunction: (request) => {
                        if (request.url.match(/example\.com\/a\/b\/third/)) {
                            request.method = 'OPTIONS';
                        }
                        return request;
                    },
                },
                $,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({ label: 'DEFAULT' });

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('OPTIONS');
            expect(enqueued[1].userData).toEqual({ label: 'DEFAULT' });

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('POST');
            expect(enqueued[2].userData).toEqual({ label: 'COOL' });
        });

        test('throws with RegExp pseudoUrls', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            const pseudoUrls = [/https:\/\/example\.com\/(\w|-|\/)*/, /(http|https):\/\/cool\.com\//];

            await expect(
                cheerioCrawlerEnqueueLinks({
                    // @ts-expect-error Type 'RegExp[]' is not assignable to type 'PseudoUrlInput[]'
                    options: { selector: '.click', pseudoUrls },
                    $,
                    requestQueue,
                    originalRequestUrl: 'https://example.com',
                }),
            ).rejects.toThrow(/to be of type `string` but received type `RegExp`/);
        });

        test('works with undefined pseudoUrls[]', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            await cheerioCrawlerEnqueueLinks({
                options: { selector: '.click', strategy: EnqueueStrategy.All },
                $,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(4);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://another.com/a/fifth');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3].url).toBe('http://cool.com/');
            expect(enqueued[3].method).toBe('GET');
            expect(enqueued[3].userData).toEqual({});
        });

        test('throws with null pseudoUrls[]', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            await expect(
                cheerioCrawlerEnqueueLinks({
                    // @ts-expect-error invalid input
                    options: { selector: '.click', pseudoUrls: null },
                    $,
                    requestQueue,
                    originalRequestUrl: 'https://example.com',
                }),
            ).rejects.toThrow(/Expected property `pseudoUrls` to be of type `array` but received type `null`/);
        });

        test('works with empty pseudoUrls[]', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            await cheerioCrawlerEnqueueLinks({
                options: { selector: '.click', pseudoUrls: [], strategy: EnqueueStrategy.All },
                $,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(4);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://another.com/a/fifth');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3].url).toBe('http://cool.com/');
            expect(enqueued[3].method).toBe('GET');
            expect(enqueued[3].userData).toEqual({});
        });

        test('throws with sparse pseudoUrls[]', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            const pseudoUrls = ['https://example.com/[(\\w|-|/)*]', null, '[http|https]://cool.com/'];

            await expect(
                cheerioCrawlerEnqueueLinks({
                    // @ts-expect-error invalid input
                    options: { selector: '.click', pseudoUrls },
                    $,
                    requestQueue,
                    originalRequestUrl: 'https://example.com',
                }),
            ).rejects.toThrow(/\(array `pseudoUrls`\) Any predicate failed with the following errors/);
            expect(enqueued).toHaveLength(0);
        });

        test('correctly resolves relative URLs with the strategy of all', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            await cheerioCrawlerEnqueueLinks({
                options: { baseUrl: 'http://www.absolute.com/removethis/', strategy: EnqueueStrategy.All },
                $,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(8);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/second');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://example.com/a/b/third');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3].url).toBe('https://another.com/a/fifth');
            expect(enqueued[3].method).toBe('GET');
            expect(enqueued[3].userData).toEqual({});

            expect(enqueued[4].url).toBe('http://cool.com/');
            expect(enqueued[4].method).toBe('GET');
            expect(enqueued[4].userData).toEqual({});

            expect(enqueued[5].url).toBe('http://www.absolute.com/x/absolutepath');
            expect(enqueued[5].method).toBe('GET');
            expect(enqueued[5].userData).toEqual({});

            expect(enqueued[6].url).toBe('http://www.absolute.com/removethis/y/relativepath');
            expect(enqueued[6].method).toBe('GET');
            expect(enqueued[6].userData).toEqual({});

            expect(enqueued[7].url).toBe('http://example.absolute.com/hello');
            expect(enqueued[7].method).toBe('GET');
            expect(enqueued[7].userData).toEqual({});
        });

        test('correctly resolves relative URLs with the default strategy of same-hostname', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            await cheerioCrawlerEnqueueLinks({
                options: { baseUrl: 'http://www.absolute.com/removethis/' },
                $,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(2);

            expect(enqueued[0].url).toBe('http://www.absolute.com/x/absolutepath');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('http://www.absolute.com/removethis/y/relativepath');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});
        });

        test('correctly resolves relative URLs with the strategy of same-domain', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            await cheerioCrawlerEnqueueLinks({
                options: { baseUrl: 'http://www.absolute.com/removethis/', strategy: EnqueueStrategy.SameDomain },
                $,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('http://www.absolute.com/x/absolutepath');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('http://www.absolute.com/removethis/y/relativepath');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://example.absolute.com/hello');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});
        });

        test('correctly resolves relative URLs with `urls` option', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            await cheerioCrawlerEnqueueLinks({
                options: {
                    baseUrl: 'http://www.absolute.com/removethis/',
                    urls: ['/relative/url1', '/relative/url2'],
                },
                $,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(2);

            expect(enqueued[0].url).toBe('http://www.absolute.com/relative/url1');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('http://www.absolute.com/relative/url2');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});
        });

        test('correctly works with transformRequestFunction', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            const pseudoUrls = ['https://example.com/[(\\w|-|/)*]', '[http|https]://cool.com/'];

            await cheerioCrawlerEnqueueLinks({
                options: {
                    selector: '.click',
                    pseudoUrls,
                    transformRequestFunction: (request) => {
                        if (request.url.includes('example.com')) {
                            request.method = 'POST';
                        } else if (request.url.includes('cool.com')) {
                            request.userData!.foo = 'bar';
                        }
                        return request;
                    },
                },
                $,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('POST');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('POST');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData!.foo).toBe('bar');
        });

        test('accepts forefront option', async () => {
            const enqueued: { request: Source; options?: RequestQueueOperationOptions }[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            requestQueue.addRequests = async (requests, options) => {
                // copy the requests to the enqueued list, along with options that were passed to addRequests,
                // so that it doesn't matter how many calls were made
                for await (const request of requests) {
                    enqueued.push({ request: typeof request === 'string' ? { url: request } : request, options });
                }
                return { processedRequests: [], unprocessedRequests: [] };
            };

            await cheerioCrawlerEnqueueLinks({
                options: {
                    forefront: true,
                },
                $,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(5);

            for (let i = 0; i < 5; i++) {
                expect(enqueued[i].options!.forefront).toBe(true);
            }
        });

        test('accepts waitForAllRequestsToBeAdded option', async () => {
            const enqueued: { request: string | Source; options?: AddRequestsBatchedOptions }[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            requestQueue.addRequestsBatched = async (requests, options) => {
                // copy the requests to the enqueued list, along with options that were passed to addRequests,
                // so that it doesn't matter how many calls were made
                for await (const request of requests) {
                    enqueued.push({ request: typeof request === 'string' ? { url: request } : request, options });
                }
                return { addedRequests: [], waitForAllRequestsToBeAdded: Promise.resolve([]) };
            };

            await cheerioCrawlerEnqueueLinks({
                options: {
                    waitForAllRequestsToBeAdded: true,
                },
                $,
                requestQueue,
                originalRequestUrl: 'https://example.com',
            });

            expect(enqueued).toHaveLength(5);

            for (let i = 0; i < 5; i++) {
                expect(enqueued[i].options!.waitForAllRequestsToBeAdded).toBe(true);
            }
        });
    });
});
