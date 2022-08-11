import { PlaywrightCrawler, Dataset } from 'crawlee';

const crawler = new PlaywrightCrawler({
    // When you turn off headless mode, the crawler
    // will run with a visible browser window.
    headless: false,
    async requestHandler({ request, page, enqueueLinks, log }) {
        const { url } = request;
        const title = await page.title();
        log.info(`Title of ${url}: ${title}`);
        await enqueueLinks({ strategy: 'same-domain' });
        await Dataset.pushData({ url, title });
    },
});

await crawler.run(['https://crawlee.dev/']);
