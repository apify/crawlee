import { CheerioCrawler, RequestList, RequestManagerTandem, RequestQueue } from 'crawlee';

// A static list of URLs to start from (can hold millions of URLs).
const requestList = await RequestList.open('my-list', ['https://crawlee.dev/', 'https://crawlee.dev/docs']);

// A writable queue that holds requests discovered during the crawl.
const requestQueue = await RequestQueue.open();

// Combine them: the tandem reads from the list first, transferring each request
// into the queue, and lets you enqueue new requests during the crawl.
const requestManager = new RequestManagerTandem(requestList, requestQueue);

const crawler = new CheerioCrawler({
    requestManager,
    async requestHandler({ enqueueLinks }) {
        // Newly discovered links go to the queue side of the tandem.
        await enqueueLinks();
    },
});

await crawler.run();
