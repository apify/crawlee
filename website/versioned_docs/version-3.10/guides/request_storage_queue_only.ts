// This is the suggested way.
// Note that we are not using the request list at all,
// and not using the request queue explicitly here.

import { PuppeteerCrawler } from 'crawlee';

// Prepare the sources array with URLs to visit (it can contain millions of URLs)
const sources = [
    { url: 'http://www.example.com/page-1' },
    { url: 'http://www.example.com/page-2' },
    { url: 'http://www.example.com/page-3' },
    // ...
];

// The crawler will automatically process requests from the queue.
// It's used the same way for Cheerio/Playwright crawlers
const crawler = new PuppeteerCrawler({
    async requestHandler({ crawler, enqueueLinks }) {
        // Add new request to the queue
        await crawler.addRequests(['http://www.example.com/new-page']);

        // Add links found on page to the queue
        await enqueueLinks();

        // The requests above would be added to the queue
        // and would be processed after the initial requests are processed.
    },
});

// Add the initial sources array to the request queue
// and run the crawler
await crawler.run(sources);
