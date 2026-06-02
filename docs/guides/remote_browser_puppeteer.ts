import { PuppeteerCrawler } from 'crawlee';

const token = process.env.BROWSERLESS_TOKEN!;

const crawler = new PuppeteerCrawler({
    launchContext: {
        // Puppeteer connects to remote browsers via CDP.
        connectOverCDPOptions: {
            browserWSEndpoint: `wss://production-sfo.browserless.io?token=${token}`,
        },
    },
    async requestHandler({ page, request, log }) {
        const title = await page.title();
        log.info(`${request.loadedUrl} — "${title}"`);
    },
});

await crawler.run(['https://crawlee.dev']);
