import log from '@apify/log';
import { load } from 'cheerio';
import type { CheerioRoot, Request, RequestOptions } from 'crawlee';
import { Configuration, cheerioCrawlerEnqueueLinks, RequestQueue, EnqueueStrategy } from 'crawlee';

const apifyClient = Configuration.getStorageClient();

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

function getMockRequestQueue() {
    const enqueued: (Request | RequestOptions)[] = [];

    const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

    // @ts-expect-error Override method for testing
    requestQueue.addRequests = (requests) => {
        enqueued.push(...requests);
    };

    return { enqueued, requestQueue };
}

describe('enqueueLinks() - userData shouldn\'t be changed and outer label must take priority', () => {
    let ll: number;
    beforeAll(() => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    afterAll(() => {
        log.setLevel(ll);
    });

    let $: CheerioRoot;
    beforeEach(() => {
        $ = load(HTML);
    });

    test('multiple enqueues with different labels', async () => {
        const { enqueued, requestQueue } = getMockRequestQueue();

        const userData = { foo: 'bar' };
        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: 'a.first',
                userData,
                label: 'first',
            },
            $,
            requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: 'a.second',
                userData,
                label: 'second',
            },
            $,
            requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        expect(enqueued).toHaveLength(2);

        expect(enqueued[0].url).toBe('https://example.com/first');
        expect(enqueued[0].userData.label).toBe('first');
        expect(enqueued[1].url).toBe('https://example.com/second');
        expect(enqueued[1].userData.label).toBe('second');
    });

    test('JSON string of userData shouldn\'t change, but enqueued label should be different', async () => {
        const { enqueued, requestQueue } = getMockRequestQueue();

        const userData = { foo: 'bar', label: 'bogus' };
        const originalUserData = JSON.stringify(userData);
        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: 'a.first',
                userData,
                label: 'first',
            },
            $,
            requestQueue,
            originalRequestUrl: 'https://example.com',
        });
        const userDataAfterEnqueue = JSON.stringify(userData);
        expect(userDataAfterEnqueue).toEqual(originalUserData);
        expect(enqueued).toHaveLength(1);
        expect(enqueued[0].url).toBe('https://example.com/first');
        expect(enqueued[0].label).toBe('first');
    });
});
