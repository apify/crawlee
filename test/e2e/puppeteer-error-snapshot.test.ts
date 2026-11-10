import { getStats, harness, hasNestedKey, listUserKeys, scenario } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { Statistics } = await import('@crawlee/basic');
    const { PuppeteerCrawler } = await import('@crawlee/puppeteer');
    const { sleep } = await import('@crawlee/utils');
    const { Actor } = await import('apify');

    const mainOptions = { exit: Actor.isAtHome() };

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
            statistics: new Statistics({ saveErrorSnapshots: true }),
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
                    // @ts-expect-error calls a method that doesn't exist, to make the handler throw a TypeError
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
            Object.values(LABELS).map((label) => ({
                url: 'https://crawlee.dev',
                userData: { label },
                uniqueKey: label,
            })),
        );
    }, mainOptions);
};

test('puppeteer-error-snapshot', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('puppeteer-error-snapshot', {
        source: scenario(import.meta.filename, main, { image: 'puppeteer' }),
        memory: 4096,
    });
    const result = await runActor(actor);
    const stats = await getStats(result);

    expect(result.status).toBe('SUCCEEDED');
    // All requests fail, to exercise the error snapshots.
    expect(stats.requestsFailed).toBe(4);
    const errors = Object.values(stats.errors);
    expect(errors.filter((error) => hasNestedKey(error, 'firstErrorHtmlUrl'))).toHaveLength(4);
    expect(errors.filter((error) => hasNestedKey(error, 'firstErrorScreenshotUrl'))).toHaveLength(4);
    expect(await listUserKeys(result), 'HTML and screenshot error snapshots in the store').toHaveLength(8);
});
