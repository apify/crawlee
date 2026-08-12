import {
    CheerioCrawler,
    type EnqueueLinksOptions,
    EnqueueStrategy,
    MemoryStorageBackend,
    RequestQueue,
    serviceLocator,
    type Source,
} from 'crawlee';
import { ResponseWithUrl } from '@crawlee/http-client';

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
 * Runs `enqueueLinks(options)` against a single-page crawl of `HTML`, seeded at `originalRequestUrl`, and
 * returns the URLs `enqueueLinks()` added (captured as it's added, since the crawl processes - and thus
 * removes from the pending queue - everything it enqueues).
 */
async function enqueuedUrls(options: EnqueueLinksOptions, originalRequestUrl: string): Promise<Set<string>> {
    const enqueued: Source[] = [];
    const requestQueue = await RequestQueue.open();
    const originalAddRequests = requestQueue.addRequests.bind(requestQueue);
    requestQueue.addRequests = async (requests, addOptions) => {
        const items: Source[] = [];
        for await (const request of requests) {
            items.push(typeof request === 'string' ? { url: request } : (request as Source));
        }
        enqueued.push(...items.filter((item) => item.url !== originalRequestUrl));
        return originalAddRequests(items, addOptions);
    };

    const crawler = new CheerioCrawler({
        requestManager: requestQueue,
        httpClient: {
            async sendRequest(request) {
                return new ResponseWithUrl(HTML, {
                    url: request.url.toString(),
                    status: 200,
                    headers: { 'content-type': 'text/html; charset=utf-8' },
                });
            },
        },
        requestHandler: async ({ request, enqueueLinks }) => {
            if (request.url !== originalRequestUrl) return;
            await enqueueLinks(options);
        },
    });

    await crawler.run([originalRequestUrl]);

    return new Set(enqueued.map((item) => item.url!));
}

describe('enqueueLinks() - matching and ignoring http/https protocol differences', () => {
    beforeEach(() => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    test('SameHostname should ignore protocol difference', async () => {
        expect(
            await enqueuedUrls({ selector: 'a', strategy: EnqueueStrategy.SameHostname }, 'https://example.com'),
        ).toEqual(new Set(['https://example.com/first', 'http://example.com/second']));
    });

    test('SameDomain should ignore protocol difference', async () => {
        expect(
            await enqueuedUrls({ selector: 'a', strategy: EnqueueStrategy.SameDomain }, 'http://example.com'),
        ).toEqual(new Set(['https://example.com/first', 'http://example.com/second']));
    });

    test('SameOrigin should respect protocol', async () => {
        expect(
            await enqueuedUrls({ selector: 'a', strategy: EnqueueStrategy.SameOrigin }, 'https://example.com'),
        ).toEqual(new Set(['https://example.com/first']));
    });
});
