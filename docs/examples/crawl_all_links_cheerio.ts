import { CheerioCrawler } from 'crawlee';

const crawler = new CheerioCrawler({
    async requestHandler({ request, enqueueLinks }) {
        console.log(request.url);
        // Add all links from page to RequestQueue
        await enqueueLinks();
    },
    maxRequestsPerCrawl: 10, // Limitation for only 10 requests (do not use if you want to crawl all links)
});

await crawler.addRequests(['https://apify.com/']);

// Run the crawler
await crawler.run();
