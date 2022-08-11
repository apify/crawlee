import { CheerioCrawler, Dataset } from 'crawlee';

const crawler = new CheerioCrawler({
    async requestHandler({ request, $, enqueueLinks, log }) {
        const { url } = request;

        // Extract HTML title of the page.
        const title = $('title').text();
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
