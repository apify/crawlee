// This is technically correct, but
// we need to explicitly open/use both the request queue and the request list.
// We suggest using the request queue and batch add the requests instead.

import { RequestList, RequestQueue, PuppeteerCrawler } from 'crawlee';

// Prepare the sources array with URLs to visit (it can contain millions of URLs)
const sources = [
    { url: 'http://www.example.com/page-1' },
    { url: 'http://www.example.com/page-2' },
    { url: 'http://www.example.com/page-3' },
    // ...
];

// Open the request list with the initial sources array
const requestList = await RequestList.open('my-list', sources);

// Open the default request queue. It's not necessary to add any requests to the queue
const requestQueue = await RequestQueue.open();

// The crawler will automatically process requests from the list and the queue.
// It's used the same way for Cheerio/Playwright crawlers
const crawler = new PuppeteerCrawler({
    requestList,
    requestQueue,
    // Each request from the request list is enqueued to the request queue one by one.
    // At this point request with the same URL would exist in the list and the queue
    async requestHandler({ crawler, enqueueLinks }) {
        // Add new request to the queue
        await crawler.addRequests(['http://www.example.com/new-page']);

        // Add links found on page to the queue
        await enqueueLinks();

        // The requests above would be added to the queue (but not to the list)
        // and would be processed after the request list is empty.
        // No more requests could be added to the list here
    },
});

// Run the crawler
await crawler.run();
