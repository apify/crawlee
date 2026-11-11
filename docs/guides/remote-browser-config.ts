import { PlaywrightCrawler } from 'crawlee';

const token = process.env.BROWSERLESS_TOKEN!;

const crawler = new PlaywrightCrawler({
    // Connect to a remote browser instead of launching locally. The crawler builds the right
    // pool for its browser — you only supply the connection details.
    remoteBrowser: {
        endpoint: `wss://production-sfo.browserless.io?token=${token}`,
        // Optional — respect the service's concurrent session limit.
        maxOpenBrowsers: 5,
    },
    async requestHandler({ page, request, log }) {
        const title = await page.title();
        log.info(`${request.loadedUrl} — "${title}"`);
    },
});

await crawler.run(['https://crawlee.dev']);
