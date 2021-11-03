---
id: request-storage
title: Request Storage
---

The Apify SDK has several request storage types that are useful for specific tasks. The requests are stored either on local disk to a directory defined by the
`APIFY_LOCAL_STORAGE_DIR` environment variable, or on the [Apify platform](/docs/guides/apify-platform) under the user account identified by the API token defined by the `APIFY_TOKEN` environment variable. If neither of these variables is defined, by default Apify SDK sets `APIFY_LOCAL_STORAGE_DIR` to `./apify_storage` in the current working directory and prints a warning.

Typically, you will be developing the code on your local computer and thus set the `APIFY_LOCAL_STORAGE_DIR` environment variable. Once the code is ready, you will deploy it to the Apify platform, where it will automatically set the `APIFY_TOKEN` environment variable and thus use cloud storage. No code changes are needed.

**Related links**

-   [Apify platform storage documentation](https://docs.apify.com/storage)
-   [View storage in Apify app](https://console.apify.com/storage)
-   [Request queues API reference](https://docs.apify.com/api/v2#/reference/request-queues)

## Request queue

The request queue is a storage of URLs to crawl. The queue is used for the deep crawling of websites, where you start with several URLs and then recursively follow links to other pages. The data structure supports both breadth-first and depth-first crawling orders.

Each actor run is associated with a **default request queue**, which is created exclusively for the actor run. Typically, it is used to store URLs to crawl in the specific actor run. Its usage is optional.

In Apify SDK, the request queue is represented by the [`RequestQueue`](/docs/api/request-queue) class.

In local configuration, the request queue is emulated by [@apify/storage-local](https://github.com/apify/apify-storage-local-js) NPM package and its data is stored in SQLite database in the directory specified by the `APIFY_LOCAL_STORAGE_DIR` environment variable as follows:

```
{APIFY_LOCAL_STORAGE_DIR}/request_queues/{QUEUE_ID}/db.sqlite
```

Note that `{QUEUE_ID}` is the name or ID of the request queue. The default queue has ID `default`, unless you override it by setting the `APIFY_DEFAULT_REQUEST_QUEUE_ID` environment variable.

The following code demonstrates basic operations of the request queue:

```javascript
// Open the default request queue associated with the actor run
const requestQueue = await Apify.openRequestQueue();
// Enqueue the initial request
await requestQueue.addRequest({ url: 'https://example.com' });

// The crawler will automatically process requests from the queue
const crawler = new Apify.CheerioCrawler({
    requestQueue,
    handlePageFunction: async ({ $, request }) => {
        // Add new request to the queue
        await requestQueue.addRequest({ url: 'https://example.com/new-page' });
        // Add links found on page to the queue
        await Apify.utils.enqueueLinks({ $, requestQueue });
    },
});
```

To see more detailed example of how to use the request queue with a crawler, see the [Puppeteer Crawler](/docs/examples/puppeteer-crawler) example.

## Request list

The request list is not a storage per se - it represents the list of URLs to crawl that is stored in a run memory (or optionally in default [Key-Value Store](../guides/results-storage#key-value-store) associated with the run, if specified). The list is used for the crawling of a large number of URLs, when you know all the URLs which should be visited by the crawler and no URLs would be added during the run. The URLs can be provided either in code or parsed from a text file hosted on the web.

Request list is created exclusively for the actor run and only if its usage is explicitly specified in the code. Its usage is optional.

In Apify SDK, the request list is represented by the [`RequestList`](/docs/api/request-list) class.

The following code demonstrates basic operations of the request list:

```javascript
// Prepare the sources array with URLs to visit
const sources = [
    { url: 'http://www.example.com/page-1' },
    { url: 'http://www.example.com/page-2' },
    { url: 'http://www.example.com/page-3' },
];
// Open the request list.
// List name is used to persist the sources and the list state in the key-value store
const requestList = await Apify.openRequestList('my-list', sources);

// The crawler will automatically process requests from the list
const crawler = new Apify.PuppeteerCrawler({
    requestList,
    handlePageFunction: async ({ page, request }) => {
        // Process the page (extract data, take page screenshot, etc).
        // No more requests could be added to the request list here
    },
});
```

To see more detailed example of how to use the request list with a crawler, see the [Puppeteer with proxy](/docs/examples/puppeteer-with-proxy) example.

## Which one to choose?

When using Request queue - you would normally have several start URLs (e.g. category pages on e-commerce website) and then recursively add more (e.g. individual item pages) programmatically to the queue, it supports dynamic adding and removing of requests. No more URLs can be added to Request list after its initialization as it is immutable, URLs cannot be removed from the list either.

On the other hand, the Request queue is not optimized for adding or removing numerous URLs in a batch. This is technically possible, but requests are added one by one to the queue, and thus it would take significant time with a larger number of requests. Request list however can contain even millions of URLs, and it would take significantly less time to add them to the list, compared to the queue.

Note that Request queue and Request list can be used together by the same crawler.
In such cases, each request from the Request list is enqueued into the Request queue first (to the foremost position in the queue, even if Request queue is not empty) and then consumed from the latter.
This is necessary to avoid the same URL being processed more than once (from the list first and then possibly from the queue).
In practical terms, such a combination can be useful when there are numerous initial URLs, but more URLs would be added dynamically by the crawler.

The following code demonstrates how to use Request queue and Request list in the same crawler:
```javascript
// Prepare the sources array with URLs to visit (it can contain millions of URLs)
const sources = [
    { url: 'http://www.example.com/page-1' },
    { url: 'http://www.example.com/page-2' },
    { url: 'http://www.example.com/page-3' },
];
// Open the request list
const requestList = await Apify.openRequestList('my-list', sources);

// Open the default request queue. It's not necessary to add any requests to the queue
const requestQueue = await Apify.openRequestQueue();

// The crawler will automatically process requests from the list and the queue
const crawler = new Apify.PuppeteerCrawler({
    requestList,
    requestQueue,
    // Each request from the request list is enqueued to the request queue one by one.
    // At this point request with the same URL would exist in the list and the queue
    handlePageFunction: async ({ request, page }) => {
        // Add new request to the queue
        await requestQueue.addRequest({ url: 'http://www.example.com/new-page' });

        // Add links found on page to the queue
        await Apify.utils.enqueueLinks({ page, requestQueue });

        // The requests above would be added to the queue (but not to the list)
        // and would be processed after the request list is empty.
        // No more requests could be added to the list here
    },
});
```
