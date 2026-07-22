import { load } from 'cheerio';
import type { CheerioRoot } from 'crawlee';
import {
    cheerioCrawlerEnqueueLinks,
    EnqueueStrategy,
    MemoryStorageBackend,
    RequestQueue,
    serviceLocator,
} from 'crawlee';

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
        <a class="click" href="https://another.com/a/first">The Greatest Science Fiction Quotes Of All Time</a>
        <p>
            Don't know, I don't know such stuff. I just do eyes, ju-, ju-, just eyes... just genetic design,
            just eyes. You Nexus, huh? I design your <a class="click" href="http://cool.com/">eyes</a>.
        </p>
        <a href="/x/absolutepath">This is a relative link.</a>
        <a href="y/relativepath">This is a relative link.</a>
        <a href="//example.absolute.com/hello">This is a link to a different subdomain</a>
    </body>
</html>
`;

type MemoryRequestQueueBackend = Awaited<ReturnType<MemoryStorageBackend['createRequestQueueBackend']>>;

/** Collect the URLs of all requests in the queue, regardless of order. */
async function enqueuedUrls(requestQueue: RequestQueue): Promise<Set<string>> {
    const items = await (requestQueue.backend as MemoryRequestQueueBackend).listItems();
    return new Set(items.map((item) => item.url));
}

describe('enqueueLinks() - combining user patterns with enqueue strategies', () => {
    let $: CheerioRoot;
    beforeEach(() => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        $ = load(HTML);
    });

    test('works with globs and same domain strategy', async () => {
        const requestQueue = await RequestQueue.open();

        const globs = ['**/first'];

        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: '.click',
                globs,
                strategy: EnqueueStrategy.SameDomain,
            },
            $,
            requestManager: requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        expect(await enqueuedUrls(requestQueue)).toEqual(new Set(['https://example.com/a/b/first']));
    });

    test('works with globs and all domains strategy', async () => {
        const requestQueue = await RequestQueue.open();

        const globs = ['**/first'];

        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: '.click',
                globs,
                strategy: EnqueueStrategy.All,
            },
            $,
            requestManager: requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        expect(await enqueuedUrls(requestQueue)).toEqual(
            new Set(['https://example.com/a/b/first', 'https://another.com/a/first']),
        );
    });

    test('works with no user provided patterns but with same domain strategy', async () => {
        const requestQueue = await RequestQueue.open();

        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: '.click',
                strategy: EnqueueStrategy.SameDomain,
            },
            $,
            requestManager: requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        expect(await enqueuedUrls(requestQueue)).toEqual(
            new Set(['https://example.com/a/b/first', 'https://example.com/a/b/third']),
        );
    });

    test('works with globs and exclude', async () => {
        const requestQueue = await RequestQueue.open();

        const globs = ['**/first'];
        const exclude = ['**/first'];

        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: '.click',
                globs,
                exclude,
            },
            $,
            requestManager: requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        expect(await enqueuedUrls(requestQueue)).toEqual(new Set());
    });

    test('works with exclude only', async () => {
        const requestQueue = await RequestQueue.open();

        const exclude = ['**/second', '**/third', 'https://another.com/**'];

        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: '.click',
                exclude,
                strategy: EnqueueStrategy.All,
            },
            $,
            requestManager: requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        expect(await enqueuedUrls(requestQueue)).toEqual(
            new Set(['https://example.com/a/b/first', 'http://cool.com/']),
        );
    });
});
