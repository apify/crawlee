import { getStats, harness, hasNestedKey, listUserKeys, scenario } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { CheerioCrawler } = await import('@crawlee/cheerio');
    const { Statistics } = await import('@crawlee/basic');
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
        const crawler = new CheerioCrawler({
            requestHandlerTimeoutSecs: 2,
            maxRequestRetries: 0,
            statistics: new Statistics({ saveErrorSnapshots: true }),
            async requestHandler({ $, request, log }) {
                const {
                    userData: { label },
                } = request;

                if (label === LABELS.TIMEOUT) {
                    log.error('Timeout error');
                    await sleep(20_000);
                }
                if (label === LABELS.TYPE_ERROR) {
                    log.error('TypeError: $(...).error is not a function');
                    // @ts-expect-error calls a method that doesn't exist, to make the handler throw a TypeError
                    $().error();
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

                    // Post navigation errors snapshots are not saved as we don't get the body in the context
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

test('cheerio-error-snapshot', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('cheerio-error-snapshot', {
        source: scenario(import.meta.filename, main),
        memory: 4096,
    });
    const result = await runActor(actor);
    const stats = await getStats(result);

    expect(result.status).toBe('SUCCEEDED');
    // All requests fail, to exercise the error snapshots.
    expect(stats.requestsFailed).toBe(4);
    const errorsWithHtml = Object.values(stats.errors).filter((error) => hasNestedKey(error, 'firstErrorHtmlUrl'));
    expect(errorsWithHtml).toHaveLength(3);
    expect(await listUserKeys(result), 'HTML error snapshots in the store').toHaveLength(3);
});
