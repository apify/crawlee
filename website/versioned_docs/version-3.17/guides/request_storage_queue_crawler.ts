import { CheerioCrawler } from 'crawlee';

// The crawler will automatically process requests from the queue.
// It's used the same way for Puppeteer/Playwright crawlers.
const crawler = new CheerioCrawler({
    // Note that we're not specifying the requestQueue here
    async requestHandler({ crawler, enqueueLinks }) {
        // Add new request to the queue
        await crawler.addRequests([{ url: 'https://example.com/new-page' }]);
        // Add links found on page to the queue
        await enqueueLinks();
    },
});

// Add the initial requests.
// Note that we are not opening the request queue explicitly before
await crawler.addRequests([
    { url: 'https://example.com/1' },
    { url: 'https://example.com/2' },
    { url: 'https://example.com/3' },
    // ...
]);

// Run the crawler
await crawler.run();
