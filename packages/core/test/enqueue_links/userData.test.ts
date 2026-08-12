import {
    CheerioCrawler,
    type EnqueueLinksOptions,
    MemoryStorageBackend,
    RequestQueue,
    serviceLocator,
    type Source,
} from '@crawlee/cheerio';
import { ResponseWithUrl } from '@crawlee/http-client';

const HTML = `
<html>
    <head>
        <title>Example</title>
    </head>
    <body>
        <ul>
            <li><a class="first" href="https://example.com/first">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
            <li><a class="second" href="https://example.com/second">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
        </ul>
    </body>
</html>
`;

// Each call gets its own seed URL - a queue that's already handled a seed won't re-run the handler for it,
// which matters here since some tests call `runEnqueueLinks()` more than once against the same queue.
const SEED_HOSTNAME = 'seed.example';
let seedCounter = 0;

/**
 * Runs `enqueueLinks(options)` against a single-page crawl of `HTML`, seeded at a fresh URL each time, and
 * returns everything it added (captured as it's added, since the crawl processes - and thus removes from
 * the pending queue - everything it enqueues).
 */
async function runEnqueueLinks(options: EnqueueLinksOptions, requestManager: RequestQueue): Promise<Source[]> {
    const seedUrl = `https://${SEED_HOSTNAME}/${seedCounter++}`;
    const enqueued: Source[] = [];
    const originalAddRequests = requestManager.addRequests.bind(requestManager);
    requestManager.addRequests = async (requests, addOptions) => {
        const items: Source[] = [];
        for await (const request of requests) {
            items.push(typeof request === 'string' ? { url: request } : (request as Source));
        }
        enqueued.push(...items.filter((item) => new URL(item.url!).hostname !== SEED_HOSTNAME));
        return originalAddRequests(items, addOptions);
    };

    const crawler = new CheerioCrawler({
        requestManager,
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
            if (request.url !== seedUrl) return;
            await enqueueLinks({ ...options, baseUrl: 'https://example.com' });
        },
    });

    await crawler.run([seedUrl]);

    return enqueued;
}

describe("enqueueLinks() - userData shouldn't be changed and outer label must take priority", () => {
    beforeEach(() => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    test('multiple enqueues with different labels', async () => {
        const requestQueue = await RequestQueue.open();

        const userData = { foo: 'bar' };
        const first = await runEnqueueLinks({ selector: 'a.first', userData, label: 'first' }, requestQueue);
        const second = await runEnqueueLinks({ selector: 'a.second', userData, label: 'second' }, requestQueue);

        const byUrl = Object.fromEntries([...first, ...second].map((r) => [r.url, (r as any).userData?.label]));
        expect(byUrl).toEqual({
            'https://example.com/first': 'first',
            'https://example.com/second': 'second',
        });
    });

    test("JSON string of userData shouldn't change, but enqueued label should be different", async () => {
        const requestQueue = await RequestQueue.open();

        const userData = { foo: 'bar', label: 'bogus' };
        const originalUserData = JSON.stringify(userData);
        const enqueued = await runEnqueueLinks({ selector: 'a.first', userData, label: 'first' }, requestQueue);
        const userDataAfterEnqueue = JSON.stringify(userData);
        expect(userDataAfterEnqueue).toEqual(originalUserData);

        expect(enqueued).toHaveLength(1);
        expect(enqueued[0].url).toBe('https://example.com/first');
        expect((enqueued[0] as any).userData?.label).toBe('first');
    });

    test('sets sessionId on all enqueued requests', async () => {
        const requestQueue = await RequestQueue.open();

        const enqueued = await runEnqueueLinks({ sessionId: 'my-session' }, requestQueue);

        expect(enqueued).toHaveLength(2);
        expect(enqueued.every((r) => (r as any).userData?.__crawlee?.sessionId === 'my-session')).toBe(true);
    });

    test('does not set sessionId when option is not provided', async () => {
        const requestQueue = await RequestQueue.open();

        const enqueued = await runEnqueueLinks({}, requestQueue);

        expect(enqueued).toHaveLength(2);
        expect(enqueued.every((r) => (r as any).userData?.__crawlee?.sessionId === undefined)).toBe(true);
    });
});
