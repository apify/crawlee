import { PlaywrightCrawler, Dataset } from 'crawlee';

const crawler = new PlaywrightCrawler({
    async requestHandler({ request, page, enqueueLinks, log }) {
        const title = await page.title();
        log.info(`Title of ${request.loadedUrl} is '${title}'`);
        await Dataset.pushData({ title, url: request.loadedUrl });
        await enqueueLinks();
    },
    // When you turn off headless mode, the crawler
    // will run with a visible browser window.
    headless: false,
});

// Add first URL to the queue and start the crawl.
await crawler.run(['https://crawlee.dev']);
