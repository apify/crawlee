import { PuppeteerCrawler } from '@crawlee/puppeteer';
import { sleep } from '@crawlee/utils';
import { Actor } from 'apify';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

const LABELS = {
    TIMEOUT: 'TIMEOUT',
    TYPE_ERROR: 'TYPE_ERROR',
    ERROR_OPENING_PAGE: 'ERROR_OPENING_PAGE',
    POST_NAVIGATION_ERROR: 'POST_NAVIGATION_ERROR',
};

// Pre Navigation errors snapshots will not be saved as we don't get the response in the context
await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        requestHandlerTimeoutSecs: 15,
        maxRequestRetries: 0,
        statisticsOptions: {
            saveErrorSnapshots: true,
        },
        async requestHandler({ request, log, page }) {
            const {
                userData: { label },
            } = request;

            if (label === LABELS.TIMEOUT) {
                log.error('Timeout error');
                await sleep(30_000);
            }
            if (label === LABELS.TYPE_ERROR) {
                log.error('TypeError: page.error is not a function');
                page.error();
            } else if (label === LABELS.ERROR_OPENING_PAGE) {
                log.error('Error opening page');
                throw new Error('An error occurred while opening the page');
            }
        },
        postNavigationHooks: [
            async ({ request, log }) => {
                const {
                    userData: { label },
                } = request;

                if (label === LABELS.POST_NAVIGATION_ERROR) {
                    log.error('Post navigation error');
                    throw new Error('Unable to navigate to the requested post');
                }
            },
        ],
    });

    await crawler.run(
        Object.values(LABELS).map((label) => ({ url: 'https://example.com', userData: { label }, uniqueKey: label })),
    );
}, mainOptions);
