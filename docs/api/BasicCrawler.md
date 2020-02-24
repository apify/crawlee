---
id: basic-crawler
title: BasicCrawler
---

<a name="basiccrawler"></a>

Provides a simple framework for parallel crawling of web pages. The URLs to crawl are fed either from a static list of URLs or from a dynamic queue of
URLs enabling recursive crawling of websites.

`BasicCrawler` is a low-level tool that requires the user to implement the page download and data extraction functionality themselves. If you want a
crawler that already facilitates this functionality, please consider using [`PuppeteerCrawler`](/docs/api/puppeteer-crawler) or
[`CheerioCrawler`](/docs/api/cheerio-crawler).

`BasicCrawler` invokes the user-provided [`BasicCrawlerOptions.handleRequestFunction`](/docs/typedefs/basic-crawler-options#handlerequestfunction) for
each [`Request`](/docs/api/request) object, which represents a single URL to crawl. The [`Request`](/docs/api/request) objects are fed from the
[`RequestList`](/docs/api/request-list) or the [`RequestQueue`](/docs/api/request-queue) instances provided by the
[`BasicCrawlerOptions.requestList`](/docs/typedefs/basic-crawler-options#requestlist) or
[`BasicCrawlerOptions.requestQueue`](/docs/typedefs/basic-crawler-options#requestqueue) constructor options, respectively.

If both [`BasicCrawlerOptions.requestList`](/docs/typedefs/basic-crawler-options#requestlist) and
[`BasicCrawlerOptions.requestQueue`](/docs/typedefs/basic-crawler-options#requestqueue) options are used, the instance first processes URLs from the
[`RequestList`](/docs/api/request-list) and automatically enqueues all of them to [`RequestQueue`](/docs/api/request-queue) before it starts their
processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes if there are no more [`Request`](/docs/api/request) objects to crawl.

New requests are only dispatched when there is enough free CPU and memory available, using the functionality provided by the
[`AutoscaledPool`](/docs/api/autoscaled-pool) class. All [`AutoscaledPool`](/docs/api/autoscaled-pool) configuration options can be passed to the
`autoscaledPoolOptions` parameter of the `BasicCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
[`AutoscaledPool`](/docs/api/autoscaled-pool) options are available directly in the `BasicCrawler` constructor.

**Example usage:**

```javascript
const rp = require('request-promise-native');

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
        await Apify.pushData({
            url: request.url,
            html: await rp(request.url),
        });
    },
});

await crawler.run();
```

---

<a name="basiccrawler"></a>

## `new BasicCrawler(options)`

**Params**

-   **`options`**: [`BasicCrawlerOptions`](/docs/typedefs/basic-crawler-options) - All `BasicCrawler` parameters are passed via an options object.

---

<a name="run"></a>

## `basicCrawler.run()`

**Returns**: `Promise<void>`

Runs the crawler. Returns a promise that gets resolved once all the requests are processed.

---
