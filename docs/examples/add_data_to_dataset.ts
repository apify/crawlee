import { Dataset, CheerioCrawler } from 'crawlee';

// Create a dataset where we will store the results.
const dataset = await Dataset.open();

const crawler = new CheerioCrawler({
    // Function called for each URL
    async requestHandler({ request, body }) {
        // Save data to default dataset
        await dataset.pushData({
            url: request.url,
            html: body,
        });
    },
});

await crawler.addRequests([
    { url: 'http://www.example.com/page-1' },
    { url: 'http://www.example.com/page-2' },
    { url: 'http://www.example.com/page-3' },
]);

// Run the crawler
await crawler.run();
