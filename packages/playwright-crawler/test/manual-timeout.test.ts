import { expect, test } from 'vitest';
import { TimeoutError } from '@apify/timeout';
import { PlaywrightCrawler } from '@crawlee/playwright';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getStats(crawler: PlaywrightCrawler) {
    const anyStats = crawler.stats as any;
    if (typeof anyStats.toJSON === 'function') return anyStats.toJSON();
    if (typeof anyStats.getState === 'function') return anyStats.getState();
    return {};
}

test('Navigation timeout triggers TimeoutError (preNavigationHooks delay)', async () => {
    let handlerCalled = false;
    let failedError: Error | undefined;

    const crawler = new PlaywrightCrawler({
        maxRequestRetries: 0,
        navigationTimeoutSecs: 1,
        preNavigationHooks: [
            async () => {
                await sleep(1_500);
            },
        ],
        requestHandler: async () => {
            handlerCalled = true;
        },
        failedRequestHandler: async (_ctx, error) => {
            failedError = error as Error;
        },
    });

    await crawler.run([`https://example.com/?nav=${Date.now()}`]);

    const stats = getStats(crawler);
    expect(handlerCalled).toBe(false);
    expect(stats.requestsFailed).toBe(1);
    expect(failedError).toBeInstanceOf(TimeoutError);
    expect(failedError!.message).toMatch(/Navigation timed out/i);
});

test('Navigation timeout via postNavigationHooks delay', async () => {
    let failedError: Error | undefined;
    const crawler = new PlaywrightCrawler({
        maxRequestRetries: 0,
        navigationTimeoutSecs: 1,
        postNavigationHooks: [
            async () => {
                await sleep(1500);
            },
        ],
        requestHandler: async () => {},
        failedRequestHandler: async (_c, e) => {
            failedError = e as Error;
        },
    });
    await crawler.run([`https://example.com/?post=${Date.now()}`]);
    expect(failedError).toBeInstanceOf(TimeoutError);
    expect((failedError as Error).message).toMatch(/Navigation timed out/);
});

test('Request handler timeout triggers TimeoutError (post-navigation)', async () => {
    let failedError: Error | undefined;
    let reachedHandler = false;
    let reachedNavigation = false;

    const crawler = new PlaywrightCrawler({
        maxRequestRetries: 0,
        navigationTimeoutSecs: 30,
        requestHandlerTimeoutSecs: 2,
        preNavigationHooks: [
            async () => {
                reachedNavigation = true;
            },
        ],
        requestHandler: async () => {
            reachedHandler = true;
            await sleep(12_000);
        },
        failedRequestHandler: async (_ctx, error) => {
            failedError = error as Error;
        },
    });

    await crawler.run([`https://example.com/?handler=${Date.now()}`]);

    const stats = getStats(crawler);
    expect(reachedNavigation).toBe(true);
    expect(reachedHandler).toBe(true);
    expect(stats.requestsFailed).toBe(1);
    expect(failedError).toBeInstanceOf(TimeoutError);
    expect(failedError!.message).not.toMatch(/Navigation timed out/i);
    expect(failedError!.message.toLowerCase()).toMatch(/requesthandler timed out|timed out/);
});

test('Request handler and navigation succeed under timeouts', async () => {
    let handlerRan = false;
    let failedError: Error | undefined;

    const crawler = new PlaywrightCrawler({
        maxRequestRetries: 0,
        navigationTimeoutSecs: 3,
        requestHandlerTimeoutSecs: 3,
        preNavigationHooks: [
            async () => {
                // below navigation timeout
                await sleep(500);
            },
        ],
        requestHandler: async () => {
            handlerRan = true;
            // below handler timeout
            await sleep(600);
        },
        failedRequestHandler: async (_ctx, error) => {
            failedError = error as Error;
        },
    });

    await crawler.run([`https://example.com/?ok=${Date.now()}`]);

    const stats = getStats(crawler);
    expect(handlerRan).toBe(true);
    expect(stats.requestsFinished).toBe(1);
    expect(stats.requestsFailed || 0).toBe(0);
    expect(failedError).toBeUndefined();
});
