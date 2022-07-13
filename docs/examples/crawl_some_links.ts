import { CheerioCrawler } from 'crawlee';

// Create a CheerioCrawler
const crawler = new CheerioCrawler({
    // Limits the crawler to only 10 requests (do not use if you want to crawl all links)
    maxRequestsPerCrawl: 10,
    // Function called for each URL
    async requestHandler({ request, enqueueLinks }) {
        console.log(request.url);
        // Add some links from page to the crawler's RequestQueue
        await enqueueLinks({
            globs: ['http?(s)://apify.com/*/*'],
        });
    },
});

// Define the starting URL
await crawler.addRequests(['https://apify.com/store']);

// Run the crawler
await crawler.run();
