import {
    CheerioCrawler,
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
        <ul>
            <li><a class="first" href="https://example.com/first">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
            <li><a class="second" href="http://example.com/second">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
        </ul>
    </body>
</html>
`;

/**
 * Runs `crawler.addRequests()` against the links extracted from `HTML`, resolved relative to `baseUrl` -
 * the address `enqueueLinks()` would normally anchor the strategy to - and returns the resulting URLs.
 */
async function enqueuedUrls(strategy: EnqueueStrategy, baseUrl: string): Promise<Set<string>> {
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
    const urls = extractUrlsFromCheerio(load(HTML), 'a', baseUrl);
    await crawler.addRequests(urls, { baseUrl, strategy });

    return new Set(enqueued.map((item) => item.url!));
}

describe('enqueueLinks() - matching and ignoring http/https protocol differences', () => {
    beforeEach(() => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    test('SameHostname should ignore protocol difference', async () => {
        expect(await enqueuedUrls(EnqueueStrategy.SameHostname, 'https://example.com')).toEqual(
            new Set(['https://example.com/first', 'http://example.com/second']),
        );
    });

    test('SameDomain should ignore protocol difference', async () => {
        expect(await enqueuedUrls(EnqueueStrategy.SameDomain, 'http://example.com')).toEqual(
            new Set(['https://example.com/first', 'http://example.com/second']),
        );
    });

    test('SameOrigin should respect protocol', async () => {
        expect(await enqueuedUrls(EnqueueStrategy.SameOrigin, 'https://example.com')).toEqual(
            new Set(['https://example.com/first']),
        );
    });
});
