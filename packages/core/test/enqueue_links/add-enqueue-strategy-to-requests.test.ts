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
            <li>
                <a class="first" href="https://menicka.cz/redirect.php?w=akce&id=f1ab8ae200bddaa17fd50150943d1e06">
                    I'm sorry, Dave. I'm afraid I can't do that.
                </a>
            </li>
        </ul>
    </body>
</html>
`;

describe('enqueueLinks() - it should store the enqueue strategy in requests', () => {
    beforeEach(() => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    test('it should store the enqueue strategy in requests', async () => {
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
        const baseUrl = 'https://menicka.cz';
        const urls = extractUrlsFromCheerio(load(HTML), 'a', baseUrl);
        await crawler.addRequests(urls, { baseUrl, strategy: EnqueueStrategy.SameHostname });

        expect((enqueued[0] as any).userData.__crawlee.enqueueStrategy).toEqual(EnqueueStrategy.SameHostname);
    });
});
