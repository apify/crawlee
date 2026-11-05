import {
    CheerioCrawler,
    type EnqueueUrlsOptions,
    MemoryStorageBackend,
    RequestQueue,
    serviceLocator,
    type Source,
} from '@crawlee/cheerio';
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
            <li><a class="second" href="https://example.com/second">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
        </ul>
    </body>
</html>
`;

const BASE_URL = 'https://example.com';

/**
 * Runs `crawler.addRequests()` against the `selector`-matched links extracted from `HTML`, resolved relative
 * to `BASE_URL`, and returns everything added.
 */
async function runEnqueueLinks(
    { selector = 'a', ...options }: EnqueueUrlsOptions & { selector?: string },
    requestManager: RequestQueue,
): Promise<Source[]> {
    const enqueued: Source[] = [];
    const originalAddRequests = requestManager.addRequests.bind(requestManager);
    requestManager.addRequests = async (requests, addOptions) => {
        const items: Source[] = [];
        for await (const request of requests) {
            items.push(typeof request === 'string' ? { url: request } : (request as Source));
        }
        enqueued.push(...items);
        return originalAddRequests(items, addOptions);
    };

    const crawler = new CheerioCrawler({ requestManager });
    const urls = extractUrlsFromCheerio(load(HTML), selector, BASE_URL);
    await crawler.addRequests(urls, { baseUrl: BASE_URL, ...options });

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
