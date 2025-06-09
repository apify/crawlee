import { Actor } from 'apify';
import { AdaptivePlaywrightCrawler } from '@crawlee/playwright';
import { LogLevel } from '@apify/log';

await Actor.init({
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
});

const crawler = new AdaptivePlaywrightCrawler({
    // Override the comparator so that it ignores `requestHandlerMode`
    resultComparator: (resultA, resultB) => {
        if (resultA.datasetItems.length === 1 && resultB.datasetItems.length === 1) {
            const itemA = resultA.datasetItems[0].item;
            const itemB = resultB.datasetItems[0].item;

            if (itemA.url === itemB.url && itemA.heading === itemB.heading) {
                return 'equal';
            }
        }

        return 'different';
    },
    requestHandler: async (context) => {
        const { url } = context.request;

        const heading = (await context.querySelector('h1')).text();

        const requestHandlerMode = await (async () => {
            try {
                await context.page.title();
                return 'browser';
            } catch {
                return 'httpOnly';
            }
        })();

        await context.pushData({ url, heading, requestHandlerMode });

        await context.enqueueLinks({
            globs: ['**/3.12/examples/*'],
        });
    },
});

crawler.log.setLevel(LogLevel.DEBUG);

await crawler.run(['https://crawlee.dev/js/docs/3.12/examples/accept-user-input']);

await Actor.exit({ exit: Actor.isAtHome() });
