import { PlaywrightCrawler, remotePlaywrightBrowserPool } from 'crawlee';

const browserPool = remotePlaywrightBrowserPool({
    // A Lightpanda server started with `lightpanda serve` or the Docker image.
    endpoint: 'ws://127.0.0.1:9222',
    // Each browser is one CDP connection. Lightpanda accepts 16 by default (`--cdp-max-connections`).
    maxOpenBrowsers: 8,
    browserPoolOptions: {
        // Lightpanda allows one browser context per CDP connection, so open one page per browser.
        maxOpenPagesPerBrowser: 1,
        useFingerprints: false,
    },
});

const crawler = new PlaywrightCrawler({
    browserPool,
    maxConcurrency: 8,
    async requestHandler({ page, request, enqueueLinks, log }) {
        const title = await page.title();
        log.info(`${request.loadedUrl} — "${title}"`);
        await enqueueLinks();
    },
});

await crawler.run(['https://crawlee.dev']);
// The crawler does not destroy a pool passed as `browserPool`.
await browserPool.destroy();
