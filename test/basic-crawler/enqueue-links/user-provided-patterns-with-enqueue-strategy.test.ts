import {
    CheerioCrawler,
    type EnqueueUrlsOptions,
    EnqueueStrategy,
    MemoryStorageBackend,
    RequestQueue,
    serviceLocator,
    type Source,
} from 'crawlee';
import { extractUrlsFromCheerio } from '@crawlee/utils/internal';
import { load } from 'cheerio';

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

const SEED_URL = 'https://example.com';

/**
 * Runs `crawler.addRequests()` against the `.click` links extracted from `HTML`, resolved relative to
 * `SEED_URL` - the address `enqueueLinks()` would normally anchor the strategy to - and returns the
 * resulting URLs.
 */
async function enqueuedUrls(options: EnqueueUrlsOptions): Promise<Set<string>> {
    const enqueued: Source[] = [];
    const requestQueue = await RequestQueue.open();
    const originalAddRequests = requestQueue.addRequests.bind(requestQueue);
    requestQueue.addRequests = async (requests, addOptions) => {
        const items: Source[] = [];
        for await (const request of requests) {
            items.push(typeof request === 'string' ? { url: request } : (request as Source));
        }
        enqueued.push(...items);
        return originalAddRequests(items, addOptions);
    };

    const crawler = new CheerioCrawler({ requestManager: requestQueue });
    const urls = extractUrlsFromCheerio(load(HTML), '.click', SEED_URL);
    await crawler.addRequests(urls, { baseUrl: SEED_URL, ...options });

    return new Set(enqueued.map((item) => item.url!));
}

describe('enqueueLinks() - combining user patterns with enqueue strategies', () => {
    beforeEach(() => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    test('works with include and same domain strategy', async () => {
        const include = ['**/first'];

        expect(await enqueuedUrls({ include, strategy: EnqueueStrategy.SameDomain })).toEqual(
            new Set(['https://example.com/a/b/first']),
        );
    });

    test('works with include and all domains strategy', async () => {
        const include = ['**/first'];

        expect(await enqueuedUrls({ include, strategy: EnqueueStrategy.All })).toEqual(
            new Set(['https://example.com/a/b/first', 'https://another.com/a/first']),
        );
    });

    test('works with no user provided patterns but with same domain strategy', async () => {
        expect(await enqueuedUrls({ strategy: EnqueueStrategy.SameDomain })).toEqual(
            new Set(['https://example.com/a/b/first', 'https://example.com/a/b/third']),
        );
    });

    test('works with include and exclude', async () => {
        const include = ['**/first'];
        const exclude = ['**/first'];

        expect(await enqueuedUrls({ include, exclude })).toEqual(new Set());
    });

    test('works with exclude only', async () => {
        const exclude = ['**/second', '**/third', 'https://another.com/**'];

        expect(await enqueuedUrls({ exclude, strategy: EnqueueStrategy.All })).toEqual(
            new Set(['https://example.com/a/b/first', 'http://cool.com/']),
        );
    });
});
