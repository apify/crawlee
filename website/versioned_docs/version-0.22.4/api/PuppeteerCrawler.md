---
id: version-0.22.4-puppeteer-crawler
title: PuppeteerCrawler
original_id: puppeteer-crawler
---

<a name="puppeteercrawler"></a>

Provides a simple framework for parallel crawling of web pages using headless Chrome with [Puppeteer](https://github.com/puppeteer/puppeteer). The
URLs to crawl are fed either from a static list of URLs or from a dynamic queue of URLs enabling recursive crawling of websites.

Since `PuppeteerCrawler` uses headless Chrome to download web pages and extract data, it is useful for crawling of websites that require to execute
JavaScript. If the target website doesn't need JavaScript, consider using [`CheerioCrawler`](../api/cheerio-crawler), which downloads the pages using
raw HTTP requests and is about 10x faster.

The source URLs are represented using [`Request`](../api/request) objects that are fed from [`RequestList`](../api/request-list) or
[`RequestQueue`](../api/request-queue) instances provided by the
[`PuppeteerCrawlerOptions.requestList`](../typedefs/puppeteer-crawler-options#requestlist) or
[`PuppeteerCrawlerOptions.requestQueue`](../typedefs/puppeteer-crawler-options#requestqueue) constructor options, respectively.

If both [`PuppeteerCrawlerOptions.requestList`](../typedefs/puppeteer-crawler-options#requestlist) and
[`PuppeteerCrawlerOptions.requestQueue`](../typedefs/puppeteer-crawler-options#requestqueue) are used, the instance first processes URLs from the
[`RequestList`](../api/request-list) and automatically enqueues all of them to [`RequestQueue`](../api/request-queue) before it starts their
processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes when there are no more [`Request`](../api/request) objects to crawl.

`PuppeteerCrawler` opens a new Chrome page (i.e. tab) for each [`Request`](../api/request) object to crawl and then calls the function provided by
user as the [`PuppeteerCrawlerOptions.handlePageFunction`](../typedefs/puppeteer-crawler-options#handlepagefunction) option.

New pages are only opened when there is enough free CPU and memory available, using the functionality provided by the
[`AutoscaledPool`](../api/autoscaled-pool) class. All [`AutoscaledPool`](../api/autoscaled-pool) configuration options can be passed to the
[`PuppeteerCrawlerOptions.autoscaledPoolOptions`](../typedefs/puppeteer-crawler-options#autoscaledpooloptions) parameter of the `PuppeteerCrawler`
constructor. For user convenience, the `minConcurrency` and `maxConcurrency` [`AutoscaledPoolOptions`](../typedefs/autoscaled-pool-options) are
available directly in the `PuppeteerCrawler` constructor.

Note that the pool of Puppeteer instances is internally managed by the [`PuppeteerPool`](../api/puppeteer-pool) class. Many constructor options such
as [`PuppeteerPoolOptions.maxOpenPagesPerInstance`](../typedefs/puppeteer-pool-options#maxopenpagesperinstance) or
[`PuppeteerPoolOptions.launchPuppeteerFunction`](../typedefs/puppeteer-pool-options#launchpuppeteerfunction) are passed directly to the
[`PuppeteerPool`](../api/puppeteer-pool) constructor.

**Example usage:**

```javascript
const crawler = new Apify.PuppeteerCrawler({
    requestList,
    handlePageFunction: async ({ page, request }) => {
        // This function is called to extract data from a single web page
        // 'page' is an instance of Puppeteer.Page with page.goto(request.url) already called
        // 'request' is an instance of Request class with information about the page to load
        await Apify.pushData({
            title: await page.title(),
            url: request.url,
            succeeded: true,
        });
    },
    handleFailedRequestFunction: async ({ request }) => {
        // This function is called when the crawling of a request failed too many times
        await Apify.pushData({
            url: request.url,
            succeeded: false,
            errors: request.errorMessages,
        });
    },
});

await crawler.run();
```

## Properties

### `autoscaledPool`

**Type**: [`AutoscaledPool`](../api/autoscaled-pool)

A reference to the underlying [`AutoscaledPool`](../api/autoscaled-pool) class that manages the concurrency of the crawler. Note that this property is
only initialized after calling the [`PuppeteerCrawler.run()`](../api/puppeteer-crawler#run) function. You can use it to change the concurrency
settings on the fly, to pause the crawler by calling [`AutoscaledPool.pause()`](../api/autoscaled-pool#pause) or to abort it by calling
[`AutoscaledPool.abort()`](../api/autoscaled-pool#abort).

---

<a name="puppeteercrawler"></a>

## `new PuppeteerCrawler(options)`

**Parameters**:

-   **`options`**: [`PuppeteerCrawlerOptions`](../typedefs/puppeteer-crawler-options) - All `PuppeteerCrawler` parameters are passed via an options
    object.

---

<a name="run"></a>

## `puppeteerCrawler.run()`

Runs the crawler. Returns promise that gets resolved once all the requests got processed.

**Returns**:

`Promise<void>`

---
