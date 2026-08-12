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
            <li>
                <a class="first" href="https://menicka.cz/redirect.php?w=akce&id=f1ab8ae200bddaa17fd50150943d1e06">
                    I'm sorry, Dave. I'm afraid I can't do that.
                </a>
            </li>
        </ul>
    </body>
</html>
`;

/**
 * Runs `enqueueLinks(options)` against a single-page crawl of `html`, seeded at `originalRequestUrl`, and
 * returns everything `enqueueLinks()` added (captured as it's added, since the crawl processes - and thus
 * removes from the pending queue - everything it enqueues).
 */
async function runEnqueueLinks(html: string, options: EnqueueLinksOptions, originalRequestUrl: string) {
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
                return new ResponseWithUrl(html, {
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

    return enqueued;
}

describe('enqueueLinks() - it should store the enqueue strategy in requests', () => {
    beforeEach(() => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    test('it should store the enqueue strategy in requests', async () => {
        const enqueued = await runEnqueueLinks(
            HTML,
            { selector: 'a', strategy: EnqueueStrategy.SameHostname },
            'https://menicka.cz',
        );

        expect((enqueued[0] as any).userData.__crawlee.enqueueStrategy).toEqual(EnqueueStrategy.SameHostname);
    });
});
