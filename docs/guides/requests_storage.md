---
id: requests-storage
title: Requests Storage
---

The Apify SDK has several requests storage types that are useful for specific tasks. The requests are stored either in a run memory (applies to Request List only, see below), on local disk to a directory defined by the
`APIFY_LOCAL_STORAGE_DIR` environment variable, or on the [Apify platform](/docs/guides/apify-platform) under the user account identified by the API token defined by the `APIFY_TOKEN` environment variable. If neither of these variables is defined, by default Apify SDK sets `APIFY_LOCAL_STORAGE_DIR` to `./apify_storage` in the current working directory and prints a warning.

Typically, you will be developing the code on your local computer and thus set the `APIFY_LOCAL_STORAGE_DIR` environment variable. Once the code is ready, you will deploy it to the Apify platform, where it will automatically set the `APIFY_TOKEN` environment variable and thus use cloud storage. No code changes are needed.

**Related links**

-   [Apify platform storage documentation](https://docs.apify.com/storage)
-   [View storage in Apify app](https://my.apify.com/storage)
-   [Request queues API reference](https://docs.apify.com/api/v2#/reference/request-queues)

## Request queue

The request queue is a storage of URLs to crawl. The queue is used for the deep crawling of websites, where you start with several URLs and then recursively follow links to other pages. The data structure supports both breadth-first and depth-first crawling orders.

Each actor run is associated with a **default request queue**, which is created exclusively for the actor run. Typically, it is used to store URLs to crawl in the specific actor run. Its usage is optional.

In Apify SDK, the request queue is represented by the [`RequestQueue`](/docs/api/request-queue) class.

In local configuration, the request queue data is stored in the directory specified by the `APIFY_LOCAL_STORAGE_DIR` environment variable as follows:

```
{APIFY_LOCAL_STORAGE_DIR}/request_queues/{QUEUE_ID}/{STATE}/{NUMBER}.json
```

Note that `{QUEUE_ID}` is the name or ID of the request queue. The default queue has ID `default`, unless you override it by setting the `APIFY_DEFAULT_REQUEST_QUEUE_ID` environment variable. Each request in the queue is stored as a separate JSON file, where `{STATE}` is either `handled` or `pending`, and `{NUMBER}` is an integer indicating the position of the request in the queue.

The following code demonstrates basic operations of the request queue:

```javascript
// Open the default request queue associated with the actor run
const queue = await Apify.openRequestQueue();

// Open a named request queue
const queueWithName = await Apify.openRequestQueue('some-name');

// Enqueue few requests
await queue.addRequest({ url: 'http://example.com/aaa' });
await queue.addRequest({ url: 'http://example.com/bbb' });
await queue.addRequest({ url: 'http://example.com/foo/bar' }, { forefront: true });

// Get requests from queue
const request1 = await queue.fetchNextRequest();
const request2 = await queue.fetchNextRequest();
const request3 = await queue.fetchNextRequest();

// Mark a request as handled
await queue.markRequestHandled(request1);

// If processing fails then reclaim the request back to the queue, so that it's crawled again
await queue.reclaimRequest(request2);
```

To see how to use the request queue with a crawler, see the [Puppeteer Crawler](/docs/examples/puppeteer-crawler) example.

## Request list

The request list is not a storage per se - it represents the list of URLs to crawl that is stored in a run memory (or optionally in default [Key-Value Store](../guides/results-storage#key-value-store) associated with the run, if specified). The list is used for the crawling of a large number of URLs, when you know all the URLs which should be visited by the crawler and no URLs would be added during the run. The URLs can be provided either in code or parsed from a text file hosted on the web.

Request list is created exclusively for the actor run and only if its usage is explicitly specified in the code. Its usage is optional.

In Apify SDK, the request list is represented by the [`RequestList`](/docs/api/request-list) class.

The following code demonstrates basic operations of the request list:

```javascript
// Prepare the sources array with URLs to visit and open the request list.
// List name is used to persist the sources and the list state in the key-value store
const sources = [
    { url: 'http://www.example.com/page-1' },
    { url: 'http://www.example.com/page-2' },
    { url: 'http://www.example.com/page-3' },
];
const requestList = await Apify.openRequestList('my-list', sources);

// Get number of requests added to the request list
const requestsNumber = requestList.length();

// Get number of handled requests
const handledRequestsNumber = requestList.handledCount();
```

To see how to use the request list with a crawler, see the [Puppeteer with proxy](/docs/examples/puppeteer-with-proxy) example.

## Which one to choose?

When using Request queue - you would normally have several start URLs (e.g. category pages on e-commerce website) and then recursively add more (e.g. individual item pages) programmatically to the queue, it supports dynamic adding and removing of requests. No more URLs can be added to Request list after its initialization as it is static, URLs could not be removed from the list either.

On the other hand, the Request queue is not optimized for adding or removing numerous URLs in a batch. Request list however could contain even millions of URLs, and it would take significantly less time to add them to the list.

Request queue and Request list could be used together by the same crawler.
In such cases, each request from Request list is enqueued into Request queue first (to the foremost position in the queue, even if Request queue is not empty) and then consumed from the latter.
This is necessary to avoid the same URL being processed more than once (from the list first and then possibly from the queue).
In practical terms, such a combination could be useful when there are numerous initial URLs, but more URLs would be added dynamically by the crawler.

The following code demonstrates how to use Request Queue and Request List in the same crawler:
```javascript
// Prepare the sources array with URLs to visit and open the request list.
// It could contain millions of URLs
const sources = [
    { url: 'http://www.example.com/page-1' },
    { url: 'http://www.example.com/page-2' },
    { url: 'http://www.example.com/page-3' },
];
const requestList = await Apify.openRequestList('my-list', sources);

// Open the default request queue. It's not necessary to add any requests to the queue
const requestQueue = await Apify.openRequestQueue();

// Create an instance of the PuppeteerCrawler class
const crawler = new Apify.PuppeteerCrawler({
    // Note that both requestList and reqestQueue are used by the crawler
    requestList,
    requestQueue,
    // Each request from the request list is enqueued to the request queue one by one.
    // At this point request with the same URL would exist in the list and the queue
    handlePageFunction: async ({ request, page }) => {
        console.log(`Processing ${request.url}...`);

        // Add more requests to the queue during the run

        // The following request would not be added as it is already in the queue
        await requestQueue.addRequest({ url: 'http://www.example.com/page-1' });

        // The following request would be added to the queue (but not to the list)
        // and would be processed after all the requests from the list are processed
        await requestQueue.addRequest({ url: 'http://www.example.com/new-page' });
    },
});

await crawler.run();
```
