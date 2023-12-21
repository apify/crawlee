import log from '@apify/log';
import { load } from 'cheerio';
import type { Source } from 'crawlee';
import { EnqueueStrategy, Configuration, cheerioCrawlerEnqueueLinks, RequestQueue } from 'crawlee';

const apifyClient = Configuration.getStorageClient();

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

describe('enqueueLinks() - it should store the enqueue strategy in requests', () => {
    let ll: number;
    beforeAll(() => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    afterAll(() => {
        log.setLevel(ll);
    });

    const $ = load(HTML);

    test('it should store the enqueue strategy in requests', async () => {
        const { enqueued, requestQueue } = createRequestQueueMock();

        await cheerioCrawlerEnqueueLinks({
            options: { selector: 'a', strategy: EnqueueStrategy.SameHostname },
            $,
            requestQueue,
            originalRequestUrl: 'https://menicka.cz',
        });

        expect(enqueued[0].userData!.__crawlee.enqueueStrategy).toEqual(EnqueueStrategy.SameHostname);
    });
});
