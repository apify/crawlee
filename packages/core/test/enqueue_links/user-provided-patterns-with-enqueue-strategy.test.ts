import { load } from 'cheerio';
import type { CheerioRoot, Source } from 'crawlee';
import { cheerioCrawlerEnqueueLinks, Configuration, EnqueueStrategy, RequestQueue } from 'crawlee';

import log from '@apify/log';

const apifyClient = Configuration.getStorageClient();

const HTML = `
<html>
    <head>
        <title>Example</title>
    </head>
    <body>
        <p>
            The ships hung in the sky, much the <a class="click" href="https://example.com/a/b/first">way that</a> bricks don't.
        </p>
        <ul>
            <li>These aren't the Droids you're looking for</li>
            <li><a href="https://example.com/a/second">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
            <li><a class="click" href="https://example.com/a/b/third">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
        </ul>
        <a class="click" href="https://another.com/a/first">The Greatest Science Fiction Quotes Of All Time</a>
        <p>
            Don't know, I don't know such stuff. I just do eyes, ju-, ju-, just eyes... just genetic design,
            just eyes. You Nexus, huh? I design your <a class="click" href="http://cool.com/">eyes</a>.
        </p>
        <a href="/x/absolutepath">This is a relative link.</a>
        <a href="y/relativepath">This is a relative link.</a>
        <a href="//example.absolute.com/hello">This is a link to a different subdomain</a>
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

describe('enqueueLinks() - combining user patterns with enqueue strategies', () => {
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

    test('works with globs and same domain strategy', async () => {
        const { enqueued, requestQueue } = createRequestQueueMock();

        const globs = ['**/first'];

        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: '.click',
                globs,
                strategy: EnqueueStrategy.SameDomain,
            },
            $,
            requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        expect(enqueued).toHaveLength(1);

        expect(enqueued[0].url).toBe('https://example.com/a/b/first');
    });

    test('works with globs and all domains strategy', async () => {
        const { enqueued, requestQueue } = createRequestQueueMock();

        const globs = ['**/first'];

        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: '.click',
                globs,
                strategy: EnqueueStrategy.All,
            },
            $,
            requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        expect(enqueued).toHaveLength(2);

        expect(enqueued[0].url).toBe('https://example.com/a/b/first');
        expect(enqueued[1].url).toBe('https://another.com/a/first');
    });

    test('works with no user provided patterns but with same domain strategy', async () => {
        const { enqueued, requestQueue } = createRequestQueueMock();

        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: '.click',
                strategy: EnqueueStrategy.SameDomain,
            },
            $,
            requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        expect(enqueued).toHaveLength(2);
        expect(enqueued[0].url).toBe('https://example.com/a/b/first');
        expect(enqueued[1].url).toBe('https://example.com/a/b/third');
    });

    test('works with globs and exclude', async () => {
        const { enqueued, requestQueue } = createRequestQueueMock();

        const globs = ['**/first'];
        const exclude = ['**/first'];

        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: '.click',
                globs,
                exclude,
            },
            $,
            requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        expect(enqueued).toHaveLength(0);
    });

    test('works with exclude only', async () => {
        const { enqueued, requestQueue } = createRequestQueueMock();

        const exclude = ['**/second', '**/third', 'https://another.com/**'];

        await cheerioCrawlerEnqueueLinks({
            options: {
                selector: '.click',
                exclude,
                strategy: EnqueueStrategy.All,
            },
            $,
            requestQueue,
            originalRequestUrl: 'https://example.com',
        });

        expect(enqueued).toHaveLength(2);
        expect(enqueued[0].url).toBe('https://example.com/a/b/first');
        expect(enqueued[1].url).toBe('http://cool.com/');
    });
});
