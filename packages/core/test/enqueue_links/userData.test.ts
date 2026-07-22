import { cheerioCrawlerEnqueueLinks, MemoryStorageBackend, RequestQueue, serviceLocator } from '@crawlee/cheerio';
import type { CheerioAPI } from 'cheerio';
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

type MemoryRequestQueueBackend = Awaited<ReturnType<MemoryStorageBackend['createRequestQueueBackend']>>;

/** Collect all requests currently in the queue (order not significant). */
async function collect(requestQueue: RequestQueue) {
    return (requestQueue.backend as MemoryRequestQueueBackend).listItems();
}

describe("enqueueLinks() - userData shouldn't be changed and outer label must take priority", () => {
    let $: CheerioAPI;
    beforeEach(() => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        $ = load(HTML);
    });

    test('multiple enqueues with different labels', async () => {
        const requestQueue = await RequestQueue.open();

        const userData = { foo: 'bar' };
        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: 'a.first',
                userData,
                label: 'first',
            },
            $,
            requestManager: requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: 'a.second',
                userData,
                label: 'second',
            },
            $,
            requestManager: requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        const enqueued = await collect(requestQueue);
        const byUrl = Object.fromEntries(enqueued.map((r) => [r.url, r.userData?.label]));
        expect(byUrl).toEqual({
            'https://example.com/first': 'first',
            'https://example.com/second': 'second',
        });
    });

    test("JSON string of userData shouldn't change, but enqueued label should be different", async () => {
        const requestQueue = await RequestQueue.open();

        const userData = { foo: 'bar', label: 'bogus' };
        const originalUserData = JSON.stringify(userData);
        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: 'a.first',
                userData,
                label: 'first',
            },
            $,
            requestManager: requestQueue,
            originalRequestUrl: 'https://example.com',
        });
        const userDataAfterEnqueue = JSON.stringify(userData);
        expect(userDataAfterEnqueue).toEqual(originalUserData);

        const enqueued = await collect(requestQueue);
        expect(enqueued).toHaveLength(1);
        expect(enqueued[0].url).toBe('https://example.com/first');
        expect(enqueued[0].userData?.label).toBe('first');
    });

    test('sets sessionId on all enqueued requests', async () => {
        const requestQueue = await RequestQueue.open();

        await cheerioCrawlerEnqueueLinks({
            options: {
                sessionId: 'my-session',
            },
            $,
            requestManager: requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        const enqueued = await collect(requestQueue);
        expect(enqueued).toHaveLength(2);
        expect(enqueued.every((r) => r.userData?.__crawlee?.sessionId === 'my-session')).toBe(true);
    });

    test('does not set sessionId when option is not provided', async () => {
        const requestQueue = await RequestQueue.open();

        await cheerioCrawlerEnqueueLinks({
            options: {},
            $,
            requestManager: requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        const enqueued = await collect(requestQueue);
        expect(enqueued).toHaveLength(2);
        expect(enqueued.every((r) => r.userData?.__crawlee?.sessionId === undefined)).toBe(true);
    });
});
