import { PlaywrightCrawler, Dataset } from 'crawlee';

const crawler = new PlaywrightCrawler({
    async requestHandler({ request, page, enqueueLinks, log }) {
        const { url } = request;

        // Extract HTML title of the page.
        const title = await page.title();
        log.info(`Title of ${url}: ${title}`);

        // Add links from the page that point
        // to the same domain as the original request.
        await enqueueLinks({ strategy: 'same-domain' });

        // Save extracted data to storage.
        await Dataset.pushData({ url, title });
    },
});

// Add a start URL to the queue and run the crawler.
await crawler.run(['https://crawlee.dev/']);
