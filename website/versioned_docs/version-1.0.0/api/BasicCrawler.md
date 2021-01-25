---
id: version-1.0.0-basic-crawler
title: BasicCrawler
original_id: basic-crawler
---

<a name="basiccrawler"></a>

Provides a simple framework for parallel crawling of web pages. The URLs to crawl are fed either from a static list of URLs or from a dynamic queue of
URLs enabling recursive crawling of websites.

`BasicCrawler` is a low-level tool that requires the user to implement the page download and data extraction functionality themselves. If you want a
crawler that already facilitates this functionality, please consider using [`CheerioCrawler`](../api/cheerio-crawler),
[`PuppeteerCrawler`](../api/puppeteer-crawler) or [`PlaywrightCrawler`](../api/playwright-crawler).

`BasicCrawler` invokes the user-provided [`BasicCrawlerOptions.handleRequestFunction`](../typedefs/basic-crawler-options#handlerequestfunction) for
each [`Request`](../api/request) object, which represents a single URL to crawl. The [`Request`](../api/request) objects are fed from the
[`RequestList`](../api/request-list) or the [`RequestQueue`](../api/request-queue) instances provided by the
[`BasicCrawlerOptions.requestList`](../typedefs/basic-crawler-options#requestlist) or
[`BasicCrawlerOptions.requestQueue`](../typedefs/basic-crawler-options#requestqueue) constructor options, respectively.

If both [`BasicCrawlerOptions.requestList`](../typedefs/basic-crawler-options#requestlist) and
[`BasicCrawlerOptions.requestQueue`](../typedefs/basic-crawler-options#requestqueue) options are used, the instance first processes URLs from the
[`RequestList`](../api/request-list) and automatically enqueues all of them to [`RequestQueue`](../api/request-queue) before it starts their
processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes if there are no more [`Request`](../api/request) objects to crawl.

New requests are only dispatched when there is enough free CPU and memory available, using the functionality provided by the
[`AutoscaledPool`](../api/autoscaled-pool) class. All [`AutoscaledPool`](../api/autoscaled-pool) configuration options can be passed to the
`autoscaledPoolOptions` parameter of the `BasicCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
[`AutoscaledPool`](../api/autoscaled-pool) options are available directly in the `BasicCrawler` constructor.

**Example usage:**

```javascript
// Prepare a list of URLs to crawl
const requestList = new Apify.RequestList({
    sources: [{ url: 'http://www.example.com/page-1' }, { url: 'http://www.example.com/page-2' }],
});
await requestList.initialize();

// Crawl the URLs
const crawler = new Apify.BasicCrawler({
    requestList,
    handleRequestFunction: async ({ request }) => {
        // 'request' contains an instance of the Request class
        // Here we simply fetch the HTML of the page and store it to a dataset
        const { body } = await Apify.utils.requestAsBrowser(request);
        await Apify.pushData({
            url: request.url,
            html: body,
        });
    },
});

await crawler.run();
```

## Properties

### `stats`

**Type**: [`Statistics`](../api/statistics)

Contains statistics about the current run.

---

### `requestList`

**Type**: [`RequestList`](../api/request-list)

A reference to the underlying [`RequestList`](../api/request-list) class that manages the crawler's [`Request`](../api/request)s. Only available if
used by the crawler.

---

### `requestQueue`

**Type**: [`RequestQueue`](../api/request-queue)

A reference to the underlying [`RequestQueue`](../api/request-queue) class that manages the crawler's [`Request`](../api/request)s. Only available if
used by the crawler.

---

### `sessionPool`

**Type**: [`SessionPool`](../api/session-pool)

A reference to the underlying [`SessionPool`](../api/session-pool) class that manages the crawler's [`Session`](../api/session)s. Only available if
used by the crawler.

---

### `autoscaledPool`

**Type**: [`AutoscaledPool`](../api/autoscaled-pool)

A reference to the underlying [`AutoscaledPool`](../api/autoscaled-pool) class that manages the concurrency of the crawler. Note that this property is
only initialized after calling the [`BasicCrawler.run()`](../api/basic-crawler#run) function. You can use it to change the concurrency settings on the
fly, to pause the crawler by calling [`AutoscaledPool.pause()`](../api/autoscaled-pool#pause) or to abort it by calling
[`AutoscaledPool.abort()`](../api/autoscaled-pool#abort).

---

<a name="basiccrawler"></a>

## `new BasicCrawler(options)`

**Parameters**:

-   **`options`**: [`BasicCrawlerOptions`](../typedefs/basic-crawler-options) - All `BasicCrawler` parameters are passed via an options object.

---

<a name="run"></a>

## `basicCrawler.run()`

Runs the crawler. Returns a promise that gets resolved once all the requests are processed.

**Returns**:

`Promise<void>`

---
