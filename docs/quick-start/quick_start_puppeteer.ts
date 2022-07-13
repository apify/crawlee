import { PuppeteerCrawler, Dataset } from 'crawlee';

const crawler = new PuppeteerCrawler({
    async requestHandler({ request, page, enqueueLinks, log }) {
        const { url } = request;

        // Extract HTML title of the page.
        const title = await page.title();
        log.info(`Title of ${url}: ${title}`);

        // Add URLs that match the provided pattern.
        await enqueueLinks({
            globs: ['https://www.iana.org/*'],
        });

        // Save extracted data to dataset.
        await Dataset.pushData({ url, title });
    },
});

// Enqueue the initial request and run the crawler.
await crawler.run(['https://www.iana.org/']);
