import { getStats, harness, scenario } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { Actor } = await import('apify');
    const { ApifyLogAdapter, BasicCrawler, log: defaultLog, LogLevel } = await import('@crawlee/basic');

    const crawlerLogger = new ApifyLogAdapter(
        defaultLog.child({
            prefix: 'AutoscalingTest',
            level: LogLevel.INFO,
        }),
    );

    const mainOptions = { exit: Actor.isAtHome() };

    let crawlCalledAt = Date.now();

    await Actor.main(async () => {
        const crawler = new BasicCrawler({
            logger: crawlerLogger,
            maxRequestsPerMinute: 1,
            requestHandler({ log }) {
                log.info(`Crawler requestHandler called after ${Date.now() - crawlCalledAt}ms`);
                crawlCalledAt = Date.now();
            },
        });

        await crawler.run(['https://example.com/1', 'https://example.com/2']);
    }, mainOptions);
};

test('autoscaling-max-tasks-per-minute', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('autoscaling-max-tasks-per-minute', {
        source: scenario(import.meta.filename, main),
        memory: 4096,
    });
    const result = await runActor(actor);
    const stats = await getStats(result);

    expect(result.status).toBe('SUCCEEDED');
    expect(stats.requestsSucceeded).toBe(2);
    // One task per minute: ~1 minute to complete, but no more than that.
    expect(stats.crawlerRuntimeMillis).toBeGreaterThan(60_000);
    expect(stats.crawlerRuntimeMillis).toBeLessThan(70_000);
});
