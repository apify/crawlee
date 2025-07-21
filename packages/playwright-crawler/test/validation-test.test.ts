import { PlaywrightCrawler } from 'crawlee';
import { test, expect } from 'vitest';
import { chromium } from 'playwright';

test('Timeouts are isolated between navigation and request handler', async () => {
    // Initialize with default values
    let navStartTime = 0;
    let handlerStartTime = 0;
    let handlerFinished = false;
    let requestErrors: Error[] = [];

    const crawler = new PlaywrightCrawler({
        navigationTimeoutSecs: 2,
        requestHandlerTimeoutSecs: 3,
        launchContext: {
            launcher: chromium,
        },
        preNavigationHooks: [
            async () => {
                navStartTime = Date.now();
                console.log(`Navigation started at ${navStartTime}`);
            },
        ],
        requestHandler: async ({ page }) => {
            handlerStartTime = Date.now();
            const navDuration = (handlerStartTime - navStartTime) / 1000;
            console.log(`Handler started after ${navDuration}s (should be <2s)`);

            try {
                await new Promise((res) => setTimeout(res, 5000)); // 5s > handler timeout
                await page.title();
                handlerFinished = true;
            } catch (err) {
                requestErrors.push(err as Error);
                throw err;
            } finally {
                console.log(`Handler completed after ${(Date.now() - handlerStartTime) / 1000}s`);
            }
        },
    });

    const stats = await crawler.run(['http://example.com']);

    // Verify execution flow
    expect(navStartTime).toBeGreaterThan(0);
    expect(handlerStartTime).toBeGreaterThan(0);
    expect(handlerStartTime).toBeGreaterThan(navStartTime);

    const navDuration = (handlerStartTime - navStartTime) / 1000;
    expect(navDuration).toBeLessThan(2);

    // Verify timeout occurred
    expect(handlerFinished).toBe(false);
    expect(stats.requestsFailed).toBe(1);

    // Verify error message
    expect(requestErrors.length).toBeGreaterThan(0);
    expect(requestErrors[0]?.message).toMatch(/requestHandler timed out after 3 seconds/);

    // Verify total timing
    const totalDuration = (Date.now() - navStartTime) / 1000;
    console.log(`Total execution: ${totalDuration}s`);
    expect(totalDuration).toBeGreaterThan(3);
    expect(totalDuration).toBeLessThan(10);
}, 30_000);
