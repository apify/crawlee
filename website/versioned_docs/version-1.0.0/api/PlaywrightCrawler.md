---
id: version-1.0.0-playwright-crawler
title: PlaywrightCrawler
original_id: playwright-crawler
---

<a name="playwrightcrawler"></a>

Provides a simple framework for parallel crawling of web pages using headless Chromium, Firefox and Webkit browsers with
[Playwright](https://github.com/microsoft/playwright). The URLs to crawl are fed either from a static list of URLs or from a dynamic queue of URLs
enabling recursive crawling of websites.

Since `Playwright` uses headless browser to download web pages and extract data, it is useful for crawling of websites that require to execute
JavaScript. If the target website doesn't need JavaScript, consider using [`CheerioCrawler`](../api/cheerio-crawler), which downloads the pages using
raw HTTP requests and is about 10x faster.

The source URLs are represented using [`Request`](../api/request) objects that are fed from [`RequestList`](../api/request-list) or
[`RequestQueue`](../api/request-queue) instances provided by the
[`PlaywrightCrawlerOptions.requestList`](../typedefs/playwright-crawler-options#requestlist) or
[`PlaywrightCrawlerOptions.requestQueue`](../typedefs/playwright-crawler-options#requestqueue) constructor options, respectively.

If both [`PlaywrightCrawlerOptions.requestList`](../typedefs/playwright-crawler-options#requestlist) and
[`PlaywrightCrawlerOptions.requestQueue`](../typedefs/playwright-crawler-options#requestqueue) are used, the instance first processes URLs from the
[`RequestList`](../api/request-list) and automatically enqueues all of them to [`RequestQueue`](../api/request-queue) before it starts their
processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes when there are no more [`Request`](../api/request) objects to crawl.

`PlaywrightCrawler` opens a new Chrome page (i.e. tab) for each [`Request`](../api/request) object to crawl and then calls the function provided by
user as the [`PlaywrightCrawlerOptions.handlePageFunction`](../typedefs/playwright-crawler-options#handlepagefunction) option.

New pages are only opened when there is enough free CPU and memory available, using the functionality provided by the
[`AutoscaledPool`](../api/autoscaled-pool) class. All [`AutoscaledPool`](../api/autoscaled-pool) configuration options can be passed to the
[`PlaywrightCrawlerOptions.autoscaledPoolOptions`](../typedefs/playwright-crawler-options#autoscaledpooloptions) parameter of the `PlaywrightCrawler`
constructor. For user convenience, the `minConcurrency` and `maxConcurrency` [`AutoscaledPoolOptions`](../typedefs/autoscaled-pool-options) are
available directly in the `PlaywrightCrawler` constructor.

Note that the pool of Playwright instances is internally managed by the `BrowserPool` class. Many constructor options such as
[`PlaywrightCrawlerOptions.maxOpenPagesPerInstance`](../typedefs/playwright-crawler-options#maxopenpagesperinstance) or

**Example usage:**

```javascript
const crawler = new Apify.PlaywrightCrawler({
    requestList,
    handlePageFunction: async ({ page, request }) => {
        // This function is called to extract data from a single web page
        // 'page' is an instance of Playwright.Page with page.goto(request.url) already called
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

### `proxyConfiguration`

**Type**: [`ProxyConfiguration`](../api/proxy-configuration)

A reference to the underlying [`ProxyConfiguration`](../api/proxy-configuration) class that manages the crawler's proxies. Only available if used by
the crawler.

---

### `browserPool`

**Type**: `BrowserPool`

A reference to the underlying `BrowserPool` class that manages the crawler's browsers. For more information about it, see the
[`browser-pool` module](https://github.com/apify/browser-pool).

---

### `autoscaledPool`

**Type**: [`AutoscaledPool`](../api/autoscaled-pool)

A reference to the underlying [`AutoscaledPool`](../api/autoscaled-pool) class that manages the concurrency of the crawler. Note that this property is
only initialized after calling the [`CheerioCrawler.run()`](../api/cheerio-crawler#run) function. You can use it to change the concurrency settings on
the fly, to pause the crawler by calling [`AutoscaledPool.pause()`](../api/autoscaled-pool#pause) or to abort it by calling
[`AutoscaledPool.abort()`](../api/autoscaled-pool#abort).

---

<a name="playwrightcrawler"></a>

## `new PlaywrightCrawler(options)`

**Parameters**:

-   **`options`**: [`PlaywrightCrawlerOptions`](../typedefs/playwright-crawler-options) - All `PlaywrightCrawler` parameters are passed via an options
    object.

---
