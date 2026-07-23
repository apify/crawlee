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
        <ul>
            <li><a class="first" href="https://example.com/first">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
            <li><a class="second" href="http://example.com/second">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
        </ul>
    </body>
</html>
`;

type MemoryRequestQueueBackend = Awaited<ReturnType<MemoryStorageBackend['createRequestQueueBackend']>>;

/** Collect the URLs of all requests in the queue, regardless of order. */
async function enqueuedUrls(requestQueue: RequestQueue): Promise<Set<string>> {
    const items = await (requestQueue.backend as MemoryRequestQueueBackend).listItems();
    return new Set(items.map((item) => item.url));
}

describe('enqueueLinks() - matching and ignoring http/https protocol differences', () => {
    let $: CheerioRoot;
    beforeEach(() => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        $ = load(HTML);
    });

    test('SameHostname should ignore protocol difference', async () => {
        const requestQueue = await RequestQueue.open();

        await cheerioCrawlerEnqueueLinks({
            options: { selector: 'a', strategy: EnqueueStrategy.SameHostname },
            $,
            requestManager: requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        expect(await enqueuedUrls(requestQueue)).toEqual(
            new Set(['https://example.com/first', 'http://example.com/second']),
        );
    });

    test('SameDomain should ignore protocol difference', async () => {
        const requestQueue = await RequestQueue.open();

        await cheerioCrawlerEnqueueLinks({
            options: { selector: 'a', strategy: EnqueueStrategy.SameDomain },
            $,
            requestManager: requestQueue,
            originalRequestUrl: 'http://example.com',
        });

        expect(await enqueuedUrls(requestQueue)).toEqual(
            new Set(['https://example.com/first', 'http://example.com/second']),
        );
    });

    test('SameOrigin should respect protocol', async () => {
        const requestQueue = await RequestQueue.open();

        await cheerioCrawlerEnqueueLinks({
            options: { selector: 'a', strategy: EnqueueStrategy.SameOrigin },
            $,
            requestManager: requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        expect(await enqueuedUrls(requestQueue)).toEqual(new Set(['https://example.com/first']));
    });
});
