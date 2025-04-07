import { CheerioCrawler } from 'crawlee';

const crawler = new CheerioCrawler({
    // Function called for each URL
    async requestHandler({ pushData, request, body }) {
        // Save data to default dataset
        await pushData({
            url: request.url,
            html: body,
        });
    },
});

await crawler.addRequests([
    'http://www.example.com/page-1',
    'http://www.example.com/page-2',
    'http://www.example.com/page-3',
]);

// Run the crawler
await crawler.run();
