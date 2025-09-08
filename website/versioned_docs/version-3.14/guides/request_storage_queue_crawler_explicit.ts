import { RequestQueue, CheerioCrawler } from 'crawlee';

// Open the default request queue associated with the current run
const requestQueue = await RequestQueue.open();

// Enqueue the initial requests
await requestQueue.addRequests([
    { url: 'https://example.com/1' },
    { url: 'https://example.com/2' },
    { url: 'https://example.com/3' },
    // ...
]);

// The crawler will automatically process requests from the queue.
// It's used the same way for Puppeteer/Playwright crawlers
const crawler = new CheerioCrawler({
    requestQueue,
    async requestHandler({ $, request, enqueueLinks }) {
        // Add new request to the queue
        await requestQueue.addRequests([{ url: 'https://example.com/new-page' }]);
        // Add links found on page to the queue
        await enqueueLinks();
    },
});

// Run the crawler
await crawler.run();
