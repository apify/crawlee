import {
    CheerioCrawler,
    EnqueueStrategy,
    MemoryStorageBackend,
    Request,
    RequestQueue,
    serviceLocator,
} from '@crawlee/cheerio';
import type {
    AddRequestsBatchedOptions,
    EnqueueLinksOptions,
    RequestQueueOperationOptions,
    Source,
} from '@crawlee/cheerio';
import { BaseHttpClient, ResponseWithUrl } from '@crawlee/http-client';
import { PlaywrightCrawler } from '@crawlee/playwright';
import { RobotsTxtFile } from '@crawlee/utils';

import log from '@apify/log';

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

/**
 * A real `RequestQueue` (backed by the in-memory storage), with `addRequests` wrapped to also record
 * every request it sees (other than the seed URL used to kick off the crawl) - so the queue still works
 * for the crawler (`fetchNextRequest`, `isFinished`, ...), while tests get a flat list of everything that
 * `enqueueLinks()` added.
 */
async function createRequestQueueMock(seedUrl = 'https://example.com') {
    const enqueued: Source[] = [];
    const requestQueue = await RequestQueue.open({ id: 'xxx' });
    const originalAddRequests = requestQueue.addRequests.bind(requestQueue);

    requestQueue.addRequests = async (requests, options) => {
        const items: Source[] = [];
        for await (const request of requests) {
            items.push(typeof request === 'string' ? { url: request } : (request as Source));
        }
        enqueued.push(...items.filter((item) => item.url !== seedUrl));
        return originalAddRequests(items, options);
    };

    return { enqueued, requestQueue };
}

// Serves fixed HTML for every request, reporting the request's own URL back as the loaded URL so
// `enqueueLinks()`'s hostname/domain-based strategies see whatever start URL a test navigates to,
// regardless of where the content is actually served from.
class FixtureHttpClient extends BaseHttpClient {
    constructor(protected readonly html: string) {
        super();
    }

    protected async fetch(): Promise<Response> {
        throw new Error('FixtureHttpClient.fetch() should never be called - sendRequest() is overridden directly.');
    }

    override async sendRequest(request: { url: string | URL }): Promise<Response> {
        return new ResponseWithUrl(this.html, {
            url: request.url.toString(),
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
        });
    }
}

const fixtureHttpClient = new FixtureHttpClient(HTML);

async function runCheerioEnqueueLinks(
    enqueueOptions: EnqueueLinksOptions,
    { requestManager, startUrl = 'https://example.com' }: { requestManager: RequestQueue; startUrl?: string },
) {
    const crawler = new CheerioCrawler({
        requestManager,
        httpClient: fixtureHttpClient,
        // Only the seed page extracts links - visited children would otherwise recursively re-run
        // `enqueueLinks()` against the very same fixture page.
        requestHandler: async ({ request, enqueueLinks }) => {
            if (request.url !== startUrl) return;
            await enqueueLinks(enqueueOptions);
        },
    });

    await crawler.run([startUrl]);
}

async function runPlaywrightEnqueueLinks(
    enqueueOptions: EnqueueLinksOptions,
    { requestManager, startUrl = 'https://example.com' }: { requestManager: RequestQueue; startUrl?: string },
) {
    const crawler = new PlaywrightCrawler({
        requestManager,
        preNavigationHooks: [
            async ({ page }) => {
                await page.route('**/*', (route) => route.fulfill({ body: HTML, contentType: 'text/html' }));
            },
        ],
        requestHandler: async ({ request, enqueueLinks }) => {
            if (request.url !== startUrl) return;
            await enqueueLinks(enqueueOptions);
        },
    });

    await crawler.run([startUrl]);
}

describe('enqueueLinks()', () => {
    let ll: number;
    beforeAll(() => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    beforeEach(async () => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    afterAll(async () => {
        log.setLevel(ll);
    });

    describe('using Playwright', () => {
        test('works with item limit', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            await runPlaywrightEnqueueLinks(
                { limit: 3, selector: '.click', strategy: EnqueueStrategy.All },
                { requestManager: requestQueue },
            );

            expect(enqueued).toHaveLength(3);
            expect(enqueued.map((r) => r.url)).toEqual([
                'https://example.com/a/b/first',
                'https://example.com/a/b/third',
                'https://another.com/a/fifth',
            ]);
        });

        test('works with include (globs)', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            const include = ['https://example.com/**/*', '?(http|https)://cool.com/'];

            await runPlaywrightEnqueueLinks(
                { selector: '.click', strategy: EnqueueStrategy.All, label: 'COOL', include },
                { requestManager: requestQueue },
            );

            expect(enqueued).toHaveLength(3);
            expect(enqueued.map((r) => r.url)).toEqual([
                'https://example.com/a/b/first',
                'https://example.com/a/b/third',
                'http://cool.com/',
            ]);
            for (const request of enqueued) {
                expect(request.userData).toEqual({ label: 'COOL' });
            }
        });

        test('correctly resolves relative URLs with the strategy of same-domain', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            await runPlaywrightEnqueueLinks(
                { baseUrl: 'http://www.absolute.com/removethis/', strategy: EnqueueStrategy.SameDomain },
                { requestManager: requestQueue },
            );

            expect(enqueued.map((r) => r.url)).toEqual([
                'http://www.absolute.com/x/absolutepath',
                'http://www.absolute.com/removethis/y/relativepath',
                'http://example.absolute.com/hello',
            ]);
        });
    });

    describe('using Cheerio', () => {
        test('works with include (globs)', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            const include = ['https://example.com/**/*', '?(http|https)://cool.com/'];

            await runCheerioEnqueueLinks(
                {
                    selector: '.click',
                    strategy: EnqueueStrategy.All,
                    include,
                    transformRequestFunction: (request) => {
                        if (/example\.com\/a\/b\/third/.exec(request.url)) {
                            request.method = 'OPTIONS';
                        }
                        return request;
                    },
                },
                { requestManager: requestQueue },
            );

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('OPTIONS');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});
        });

        test('does not throw with empty include patterns', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            const include = [
                'https://example.com/**/*',
                '',
                { glob: ' ' },
                // Empty string used to throw an error (https://console.apify.com/actors/aYG0l9s7dbB7j3gbS/issues/Wd0Ahfk9Vd2OPk4Uf)
                { glob: '' },
                '?(http|https)://cool.com/',
            ];

            await expect(
                runCheerioEnqueueLinks(
                    { selector: '.click', include, strategy: EnqueueStrategy.All },
                    { requestManager: requestQueue },
                ),
            ).resolves.not.toThrow();

            expect(enqueued).toHaveLength(3);
        });

        test('works with include (regexps)', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            const include = [/^https:\/\/example\.com\/(\w|\/)+/, /^(http|https):\/\/cool\.com\//];

            await runCheerioEnqueueLinks(
                {
                    selector: '.click',
                    strategy: EnqueueStrategy.All,
                    include,
                    transformRequestFunction: (request) => {
                        if (/example\.com\/a\/b\/third/.exec(request.url)) {
                            request.method = 'OPTIONS';
                        }
                        return request;
                    },
                },
                { requestManager: requestQueue },
            );

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('OPTIONS');

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('GET');
        });

        test('works with include (mixed globs and regexps)', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            const include = ['https://example.com/**/*', /^(http|https):\/\/cool\.com\//];

            await runCheerioEnqueueLinks(
                { selector: '.click', strategy: EnqueueStrategy.All, include },
                { requestManager: requestQueue },
            );

            expect(enqueued).toHaveLength(3);
            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[2].url).toBe('http://cool.com/');
        });

        test('include patterns are AND-ed with the default same-hostname strategy', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            // `cool.com` matches the include pattern but lives on a different hostname than the page
            // (`example.com`). With no explicit strategy, the default `same-hostname` strategy still
            // applies, so the cross-hostname URL is filtered out (aligned with crawlee-python).
            const include = ['https://example.com/**/*', '?(http|https)://cool.com/'];

            await runCheerioEnqueueLinks({ selector: '.click', include }, { requestManager: requestQueue });

            expect(enqueued).toHaveLength(2);
            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
        });

        test('throws when include is an empty array', async () => {
            const { requestQueue } = await createRequestQueueMock();
            let caughtError: unknown;

            const crawler = new CheerioCrawler({
                requestManager: requestQueue,
                httpClient: fixtureHttpClient,
                requestHandler: async ({ enqueueLinks }) => {
                    try {
                        await enqueueLinks({ selector: '.click', include: [] });
                    } catch (error) {
                        caughtError = error;
                    }
                },
            });

            await crawler.run(['https://example.com']);

            expect(caughtError).toBeInstanceOf(Error);
            expect((caughtError as Error).message).toMatch(/at `include`/);
        });

        test('works with no include/exclude filters (enqueues all matching strategy)', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            await runCheerioEnqueueLinks(
                { selector: '.click', strategy: EnqueueStrategy.All },
                { requestManager: requestQueue },
            );

            expect(enqueued.map((r) => r.url)).toEqual([
                'https://example.com/a/b/first',
                'https://example.com/a/b/third',
                'https://another.com/a/fifth',
                'http://cool.com/',
            ]);
        });

        test('works with exclude glob', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            const include = ['https://example.com/**/*', '?(http|https)://cool.com/'];
            const exclude = ['**/first'];

            await runCheerioEnqueueLinks(
                { selector: '.click', strategy: EnqueueStrategy.All, include, exclude },
                { requestManager: requestQueue },
            );

            expect(enqueued.map((r) => r.url)).toEqual(['https://example.com/a/b/third', 'http://cool.com/']);
        });

        test('works with exclude regexp', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            const include = ['https://example.com/**/*', '?(http|https)://cool.com/'];
            const exclude = [/first/];

            await runCheerioEnqueueLinks(
                { selector: '.click', strategy: EnqueueStrategy.All, include, exclude },
                { requestManager: requestQueue },
            );

            expect(enqueued.map((r) => r.url)).toEqual(['https://example.com/a/b/third', 'http://cool.com/']);
        });

        test('works with skipNavigation', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();

            await runCheerioEnqueueLinks(
                { selector: '.click', skipNavigation: true },
                { requestManager: requestQueue },
            );

            expect(enqueued).toHaveLength(2);
            for (const request of enqueued) {
                expect(request.skipNavigation).toBe(true);
            }
        });

        test('correctly resolves relative URLs with the default strategy of same-hostname', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            await runCheerioEnqueueLinks(
                { baseUrl: 'http://www.absolute.com/removethis/' },
                { requestManager: requestQueue },
            );

            expect(enqueued.map((r) => r.url)).toEqual([
                'http://www.absolute.com/x/absolutepath',
                'http://www.absolute.com/removethis/y/relativepath',
            ]);
        });

        test('correctly resolves relative URLs with the strategy of same-domain', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            await runCheerioEnqueueLinks(
                { baseUrl: 'http://www.absolute.com/removethis/', strategy: EnqueueStrategy.SameDomain },
                { requestManager: requestQueue },
            );

            expect(enqueued.map((r) => r.url)).toEqual([
                'http://www.absolute.com/x/absolutepath',
                'http://www.absolute.com/removethis/y/relativepath',
                'http://example.absolute.com/hello',
            ]);
        });

        test('keeps filtering by the original domain with the strategy of same-domain after an off-domain redirect', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            // Serves the fixture HTML while reporting the load as if it had redirected off-domain.
            const redirectingHttpClient = new (class extends FixtureHttpClient {
                override async sendRequest(): Promise<Response> {
                    return new ResponseWithUrl(this.html, {
                        url: 'https://another.com/',
                        status: 200,
                        headers: { 'content-type': 'text/html; charset=utf-8' },
                    });
                }
            })(HTML);

            const crawler = new CheerioCrawler({
                requestManager: requestQueue,
                httpClient: redirectingHttpClient,
                requestHandler: async ({ request, enqueueLinks }) => {
                    if (request.url !== 'https://example.com') return;
                    await enqueueLinks({ strategy: EnqueueStrategy.SameDomain });
                },
            });
            await crawler.run(['https://example.com']);

            expect(enqueued.map((r) => r.url)).toEqual([
                'https://example.com/a/b/first',
                'https://example.com/a/second',
                'https://example.com/a/b/third',
            ]);
        });

        test('ignores an explicitly undefined baseUrl and keeps the resolved one', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            await runCheerioEnqueueLinks(
                { strategy: EnqueueStrategy.SameDomain, baseUrl: undefined },
                { requestManager: requestQueue },
            );

            expect(enqueued.map((r) => r.url)).toEqual([
                'https://example.com/a/b/first',
                'https://example.com/a/second',
                'https://example.com/a/b/third',
                'https://example.com/x/absolutepath',
                'https://example.com/y/relativepath',
            ]);
        });

        test('correctly resolves relative URLs with the strategy of all', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            await runCheerioEnqueueLinks(
                { baseUrl: 'http://www.absolute.com/removethis/', strategy: EnqueueStrategy.All },
                { requestManager: requestQueue },
            );

            expect(enqueued.map((r) => r.url)).toEqual([
                'https://example.com/a/b/first',
                'https://example.com/a/second',
                'https://example.com/a/b/third',
                'https://another.com/a/fifth',
                'http://cool.com/',
                'http://www.absolute.com/x/absolutepath',
                'http://www.absolute.com/removethis/y/relativepath',
                'http://example.absolute.com/hello',
            ]);
        });

        test('correctly works with transformRequestFunction', async () => {
            const { enqueued, requestQueue } = await createRequestQueueMock();
            const include = ['https://example.com/**/*', '?(http|https)://cool.com/'];

            await runCheerioEnqueueLinks(
                {
                    selector: '.click',
                    strategy: EnqueueStrategy.All,
                    include,
                    transformRequestFunction: (request) => {
                        if (request.url.includes('example.com')) {
                            request.method = 'POST';
                        } else if (request.url.includes('cool.com')) {
                            request.userData!.foo = 'bar';
                        }
                        return request;
                    },
                },
                { requestManager: requestQueue },
            );

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('POST');

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('POST');

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData!.foo).toBe('bar');
        });

        test('accepts forefront option', async () => {
            const enqueued: { request: Source; options?: RequestQueueOperationOptions }[] = [];
            const requestQueue = await RequestQueue.open({ id: 'xxx' });
            const originalAddRequests = requestQueue.addRequests.bind(requestQueue);

            requestQueue.addRequests = async (requests, options) => {
                const items: Source[] = [];
                for await (const request of requests) {
                    const source = typeof request === 'string' ? { url: request } : request;
                    items.push(source);
                    if (source.url !== 'https://example.com') enqueued.push({ request: source, options });
                }
                return originalAddRequests(items, options);
            };

            await runCheerioEnqueueLinks({ forefront: true }, { requestManager: requestQueue });

            expect(enqueued).toHaveLength(5);
            for (const { options } of enqueued) {
                expect(options!.forefront).toBe(true);
            }
        });

        test('accepts waitForAllRequestsToBeAdded option', async () => {
            const enqueued: { request: string | Source; options?: AddRequestsBatchedOptions }[] = [];
            const requestQueue = await RequestQueue.open({ id: 'xxx' });
            const originalAddRequestsBatched = requestQueue.addRequestsBatched.bind(requestQueue);

            requestQueue.addRequestsBatched = async (requests, options) => {
                const items: Source[] = [];
                for await (const request of requests) {
                    const source = typeof request === 'string' ? { url: request } : request;
                    items.push(source);
                    if (source.url !== 'https://example.com') enqueued.push({ request: source, options });
                }
                return originalAddRequestsBatched(items, options);
            };

            await runCheerioEnqueueLinks({ waitForAllRequestsToBeAdded: true }, { requestManager: requestQueue });

            expect(enqueued).toHaveLength(5);
            for (const { options } of enqueued) {
                expect(options!.waitForAllRequestsToBeAdded).toBe(true);
            }
        });

        describe('label precedence', () => {
            test('global label option is applied if no other label is provided', async () => {
                const { enqueued, requestQueue } = await createRequestQueueMock();

                await runCheerioEnqueueLinks(
                    { selector: '.click', label: 'global-label', include: ['https://example.com/**/*'] },
                    { requestManager: requestQueue },
                );

                expect(enqueued).toHaveLength(2);
                expect(enqueued[0].userData).toEqual({ label: 'global-label' });
                expect(enqueued[1].userData).toEqual({ label: 'global-label' });
            });

            test('transformRequestFunction overrides global label', async () => {
                const { enqueued, requestQueue } = await createRequestQueueMock();

                await runCheerioEnqueueLinks(
                    {
                        selector: '.click',
                        label: 'global-label',
                        include: [/example\.com/],
                        transformRequestFunction: (request) => {
                            if (request.url.includes('/a/b/first')) {
                                request.label = 'transformed-label';
                            }
                            return request;
                        },
                    },
                    { requestManager: requestQueue },
                );

                expect(enqueued).toHaveLength(2);
                expect(enqueued[0].url).toBe('https://example.com/a/b/first');
                expect(enqueued[0].userData).toEqual({ label: 'transformed-label' });
                expect(enqueued[1].url).toBe('https://example.com/a/b/third');
                expect(enqueued[1].userData).toEqual({ label: 'global-label' });
            });

            test('transformRequestFunction can override global label for all requests', async () => {
                const { enqueued, requestQueue } = await createRequestQueueMock();

                await runCheerioEnqueueLinks(
                    {
                        selector: '.click',
                        strategy: EnqueueStrategy.All,
                        label: 'global-label',
                        include: ['https://example.com/a/b/first', 'https://example.com/a/b/third', 'http://cool.com/'],
                        transformRequestFunction: (request) => {
                            request.label = 'final-label';
                            return request;
                        },
                    },
                    { requestManager: requestQueue },
                );

                expect(enqueued).toHaveLength(3);
                for (const request of enqueued) {
                    expect(request.userData).toEqual({ label: 'final-label' });
                }
            });

            test('transformRequestFunction can modify request properties', async () => {
                const { enqueued, requestQueue } = await createRequestQueueMock();

                await runCheerioEnqueueLinks(
                    {
                        selector: '.click',
                        include: [/example\.com/],
                        transformRequestFunction: (request) => {
                            request.method = 'PUT';
                            request.userData = { ...request.userData, transformed: true };
                            return request;
                        },
                    },
                    { requestManager: requestQueue },
                );

                expect(enqueued).toHaveLength(2);
                expect(enqueued[0].method).toBe('PUT');
                expect(enqueued[1].method).toBe('PUT');
                expect(enqueued[0].userData).toEqual({ transformed: true });
                expect(enqueued[1].userData).toEqual({ transformed: true });
            });

            test('transformRequestFunction can return a new plain object instead of modifying in place', async () => {
                const enqueued: Source[] = [];
                const requestQueue = await RequestQueue.open({ id: 'xxx' });
                const originalAddRequestsBatched = requestQueue.addRequestsBatched.bind(requestQueue);

                // Custom mock that checks for Request instances - we wrap addRequestsBatched to verify that
                // request options returned by transformRequestFunction are converted to Request instances
                requestQueue.addRequestsBatched = async (requests, options) => {
                    const items: Request[] = [];
                    for await (const request of requests) {
                        if (!(request instanceof Request)) {
                            throw new Error(
                                `Expected Request instance but got plain object: ${JSON.stringify(request)}`,
                            );
                        }
                        items.push(request);
                        if (request.url !== 'https://example.com') enqueued.push(request);
                    }
                    return originalAddRequestsBatched(items, options);
                };

                await runCheerioEnqueueLinks(
                    {
                        selector: '.click',
                        include: ['https://example.com/**/*'],
                        transformRequestFunction: (request) => ({
                            url: request.url,
                            method: 'DELETE' as const,
                            userData: { replaced: true },
                        }),
                    },
                    { requestManager: requestQueue },
                );

                expect(enqueued).toHaveLength(2);
                expect(enqueued[0].url).toBe('https://example.com/a/b/first');
                expect(enqueued[0].method).toBe('DELETE');
                expect(enqueued[0].userData).toEqual({ replaced: true });
                expect(enqueued[1].url).toBe('https://example.com/a/b/third');
                expect(enqueued[1].method).toBe('DELETE');
                expect(enqueued[1].userData).toEqual({ replaced: true });
            });

            test('transformRequestFunction supports "skip" and "unchanged" string returns', async () => {
                const { enqueued, requestQueue } = await createRequestQueueMock();
                const onSkippedRequest = vi.fn();

                await runCheerioEnqueueLinks(
                    {
                        selector: '.click',
                        label: 'global-label',
                        include: ['https://example.com/**/*'],
                        transformRequestFunction: (request) => {
                            if (request.url.includes('/a/b/first')) {
                                return 'skip';
                            }
                            return 'unchanged';
                        },
                        onSkippedRequest,
                    },
                    { requestManager: requestQueue },
                );

                expect(enqueued).toHaveLength(1);
                expect(enqueued[0].url).toBe('https://example.com/a/b/third');
                expect(enqueued[0].userData).toEqual({ label: 'global-label' });

                const skippedCalls = onSkippedRequest.mock.calls.map(
                    (call: unknown[]) => call[0] as { request: Request; reason: string },
                );
                const transformSkipped = skippedCalls.filter((s) => s.request.url === 'https://example.com/a/b/first');
                expect(transformSkipped).toHaveLength(1);
                expect(transformSkipped[0].reason).toBe('transform');
                const unchangedSkipped = skippedCalls.filter((s) => s.request.url === 'https://example.com/a/b/third');
                expect(unchangedSkipped).toHaveLength(0);
            });

            test('transformRequestFunction returning falsy correctly triggers onSkippedRequest', async () => {
                const { enqueued, requestQueue } = await createRequestQueueMock();
                const onSkippedRequest = vi.fn();

                await runCheerioEnqueueLinks(
                    {
                        selector: '.click',
                        include: ['https://example.com/**/*'],
                        transformRequestFunction: (request) => {
                            if (request.url.includes('/a/b/first')) {
                                return false;
                            }
                            return request;
                        },
                        onSkippedRequest,
                    },
                    { requestManager: requestQueue },
                );

                expect(enqueued).toHaveLength(1);
                expect(enqueued[0].url).toBe('https://example.com/a/b/third');

                const skippedCalls = onSkippedRequest.mock.calls.map(
                    (call: unknown[]) => call[0] as { request: Request; reason: string },
                );
                const transformSkipped = skippedCalls.filter((s) => s.request.url === 'https://example.com/a/b/first');
                expect(transformSkipped).toHaveLength(1);
                expect(transformSkipped[0].reason).toBe('transform');
            });
        });
    });

    describe('respectRobotsTxtFile option', () => {
        const robotsTxtFile = RobotsTxtFile.from(
            'http://example.com/robots.txt',
            `User-agent: *
             Disallow: /
             Allow: /yes

             User-agent: MyCrawler
             Disallow: /no
             Allow: /my-crawler
            `,
        );

        const urls = [
            'http://example.com/yes',
            'http://example.com/no',
            'http://example.com/no-globally',
            'http://example.com/my-crawler/anything',
        ];

        const robotsHtml = `<html><body>${urls.map((url) => `<a href="${url}">link</a>`).join('')}</body></html>`;
        const robotsHttpClient = new FixtureHttpClient(robotsHtml);

        async function runWithRobotsTxt(respectRobotsTxtFile?: boolean | { userAgent?: string }) {
            const { enqueued, requestQueue } = await createRequestQueueMock();

            const crawler = new (class extends CheerioCrawler {
                override async getRobotsTxtFileForUrl(_url: string) {
                    return robotsTxtFile;
                }
            })({
                requestManager: requestQueue,
                httpClient: robotsHttpClient,
                respectRobotsTxtFile: respectRobotsTxtFile ?? true,
                requestHandler: async ({ request, enqueueLinks }) => {
                    if (request.url !== 'https://example.com') return;
                    await enqueueLinks({ strategy: EnqueueStrategy.All });
                },
            });

            await crawler.run(['https://example.com']);

            return enqueued;
        }

        test('defaults to the catch-all user-agent when not provided', async () => {
            const enqueued = await runWithRobotsTxt();
            expect(enqueued.map((r) => r.url)).toEqual(['http://example.com/yes']);
        });

        test('applies rules for the configured user-agent', async () => {
            const enqueued = await runWithRobotsTxt({ userAgent: 'MyCrawler' });
            expect(enqueued.map((r) => r.url)).toEqual([
                'http://example.com/yes',
                'http://example.com/my-crawler/anything',
            ]);
        });

        test('skips filtering when set to false even if robotsTxtFile is provided', async () => {
            const enqueued = await runWithRobotsTxt(false);
            expect(enqueued.map((r) => r.url)).toEqual(urls);
        });
    });
});
