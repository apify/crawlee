import { expect, test } from 'vitest';
import { TimeoutError } from '@apify/timeout';
import { HttpCrawler } from '@crawlee/http';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getStats(crawler: HttpCrawler<any>) {
    const statsAny = (crawler as any).stats;
    if (statsAny?.toJSON) return statsAny.toJSON();
    if (statsAny?.getState) return statsAny.getState();
    return {};
}

test('Navigation timeout (preNavigationHooks delay)', async () => {
    let handlerCalled = false;
    let failedError: Error | undefined;
    let failedCalled = 0;

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        navigationTimeoutSecs: 1,
        preNavigationHooks: [
            async () => {
                await sleep(1500);
            },
        ],
        requestHandler: async () => {
            handlerCalled = true;
        },
        failedRequestHandler: async (_ctx, error) => {
            failedCalled++;
            failedError = error as Error;
        },
    });

    const start = Date.now();
    await crawler.run([`https://example.com/?http_nav=${Date.now()}`]);
    const elapsed = Date.now() - start;
    const stats = getStats(crawler);

    expect(handlerCalled).toBe(false);
    expect(failedCalled).toBe(1);
    expect(stats.requestsFailed).toBe(1);
    expect(failedError).toBeInstanceOf(TimeoutError);
    expect(failedError!.message).toMatch(/^Navigation timed out after 1/);
    expect(elapsed).toBeLessThan(4000); // proves early cut-off
});

test('Navigation timeout via postNavigationHooks delay', async () => {
    let handlerCalled = false;
    let failedError: Error | undefined;
    let failedCalled = 0;

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        navigationTimeoutSecs: 1,
        postNavigationHooks: [
            async () => {
                await sleep(1_500);
            },
        ],
        requestHandler: async () => {
            handlerCalled = true;
        },
        failedRequestHandler: async (_ctx, error) => {
            failedCalled++;
            failedError = error as Error;
        },
    });

    await crawler.run([`https://example.com/?http_post=${Date.now()}`]);
    const stats = getStats(crawler);

    expect(handlerCalled).toBe(false);
    expect(failedCalled).toBe(1);
    expect(stats.requestsFailed).toBe(1);
    expect(failedError).toBeInstanceOf(TimeoutError);
    expect((failedError as Error).message).toMatch(/Navigation timed out/);
});

test('Request handler timeout (post-navigation)', async () => {
    let handlerEntered = false;
    let failedError: Error | undefined;
    let failedCalled = 0;

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        navigationTimeoutSecs: 10,
        requestHandlerTimeoutSecs: 2,
        requestHandler: async () => {
            handlerEntered = true;
            await sleep(12_000);
        },
        failedRequestHandler: async (_ctx, error) => {
            failedCalled++;
            failedError = error as Error;
        },
    });

    const start = Date.now();
    await crawler.run([`https://example.com/?http_handler=${Date.now()}`]);
    const elapsed = Date.now() - start;
    const stats = getStats(crawler);

    expect(handlerEntered).toBe(true);
    expect(failedCalled).toBe(1);
    expect(stats.requestsFailed).toBe(1);
    expect(failedError).toBeInstanceOf(TimeoutError);
    expect(failedError!.message).toMatch(/requestHandler timed out after 2 seconds\./i);
    expect(failedError!.message).not.toMatch(/Navigation timed out/i);
    expect(elapsed).toBeLessThan(6000);
});

test('Succeeds when under both timeouts', async () => {
    let handlerRan = false;
    let failedError: Error | undefined;

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        navigationTimeoutSecs: 2,
        requestHandlerTimeoutSecs: 2,
        preNavigationHooks: [
            async () => {
                await sleep(300);
            },
        ],
        requestHandler: async () => {
            handlerRan = true;
            await sleep(400);
        },
        failedRequestHandler: async (_ctx, error) => {
            failedError = error as Error;
        },
    });

    await crawler.run([`https://example.com/?http_ok=${Date.now()}`]);
    const stats = getStats(crawler);

    expect(handlerRan).toBe(true);
    expect(stats.requestsFinished).toBe(1);
    expect(stats.requestsFailed || 0).toBe(0);
    expect(failedError).toBeUndefined();
});
