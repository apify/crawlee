import { load } from 'cheerio';
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
    const $ = load(HTML);

    beforeEach(() => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    test('it should store the enqueue strategy in requests', async () => {
        const requestQueue = await RequestQueue.open();

        await cheerioCrawlerEnqueueLinks({
            options: { selector: 'a', strategy: EnqueueStrategy.SameHostname },
            $,
            requestManager: requestQueue,
            originalRequestUrl: 'https://menicka.cz',
        });

        const enqueued = await requestQueue.fetchNextRequest();
        expect(enqueued!.userData.__crawlee.enqueueStrategy).toEqual(EnqueueStrategy.SameHostname);
    });
});
