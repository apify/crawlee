import log from '@apify/log';
import { load } from 'cheerio';
import type { CheerioRoot, Source } from 'crawlee';
import { EnqueueStrategy, Configuration, cheerioCrawlerEnqueueLinks, RequestQueue } from 'crawlee';

const apifyClient = Configuration.getStorageClient();

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

function createRequestQueueMock() {
    const enqueued: Source[] = [];
    const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

    // @ts-expect-error Override method for testing
    requestQueue.addRequests = async function (requests) {
        enqueued.push(...requests);
        return { processedRequests: requests, unprocessedRequests: [] as never[] };
    };

    return { enqueued, requestQueue };
}

describe('enqueueLinks() - matching and ignoring http/https protocol differences', () => {
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

    test('SameHostname should ignore protocol difference', async () => {
        const { enqueued, requestQueue } = createRequestQueueMock();

        await cheerioCrawlerEnqueueLinks({
            options: { selector: 'a', strategy: EnqueueStrategy.SameHostname },
            $,
            requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        expect(enqueued).toHaveLength(2);
        expect(enqueued[0].url).toBe('https://example.com/first');
        expect(enqueued[1].url).toBe('http://example.com/second');
    });

    test('SameDomain should ignore protocol difference', async () => {
        const { enqueued, requestQueue } = createRequestQueueMock();

        await cheerioCrawlerEnqueueLinks({
            options: { selector: 'a', strategy: EnqueueStrategy.SameDomain },
            $,
            requestQueue,
            originalRequestUrl: 'http://example.com',
        });

        expect(enqueued).toHaveLength(2);
        expect(enqueued[0].url).toBe('https://example.com/first');
        expect(enqueued[1].url).toBe('http://example.com/second');
    });

    test('SameOrigin should respect protocol', async () => {
        const { enqueued, requestQueue } = createRequestQueueMock();

        await cheerioCrawlerEnqueueLinks({
            options: { selector: 'a', strategy: EnqueueStrategy.SameOrigin },
            $,
            requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        expect(enqueued).toHaveLength(1);
        expect(enqueued[0].url).toBe('https://example.com/first');
    });
});
