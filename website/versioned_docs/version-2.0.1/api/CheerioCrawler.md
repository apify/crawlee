---
id: version-2.0.1-cheerio-crawler
title: CheerioCrawler
original_id: cheerio-crawler
---

<a name="cheeriocrawler"></a>

Provides a framework for the parallel crawling of web pages using plain HTTP requests and [cheerio](https://www.npmjs.com/package/cheerio) HTML
parser. The URLs to crawl are fed either from a static list of URLs or from a dynamic queue of URLs enabling recursive crawling of websites.

Since `CheerioCrawler` uses raw HTTP requests to download web pages, it is very fast and efficient on data bandwidth. However, if the target website
requires JavaScript to display the content, you might need to use [`PuppeteerCrawler`](../api/puppeteer-crawler) or
[`PlaywrightCrawler`](../api/playwright-crawler) instead, because it loads the pages using full-featured headless Chrome browser.

`CheerioCrawler` downloads each URL using a plain HTTP request, parses the HTML content using [Cheerio](https://www.npmjs.com/package/cheerio) and
then invokes the user-provided [`CheerioCrawlerOptions.handlePageFunction`](../typedefs/cheerio-crawler-options#handlepagefunction) to extract page
data using a [jQuery](https://jquery.com/)-like interface to the parsed HTML DOM.

The source URLs are represented using [`Request`](../api/request) objects that are fed from [`RequestList`](../api/request-list) or
[`RequestQueue`](../api/request-queue) instances provided by the
[`CheerioCrawlerOptions.requestList`](../typedefs/cheerio-crawler-options#requestlist) or
[`CheerioCrawlerOptions.requestQueue`](../typedefs/cheerio-crawler-options#requestqueue) constructor options, respectively.

If both [`CheerioCrawlerOptions.requestList`](../typedefs/cheerio-crawler-options#requestlist) and
[`CheerioCrawlerOptions.requestQueue`](../typedefs/cheerio-crawler-options#requestqueue) are used, the instance first processes URLs from the
[`RequestList`](../api/request-list) and automatically enqueues all of them to [`RequestQueue`](../api/request-queue) before it starts their
processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes when there are no more [`Request`](../api/request) objects to crawl.

`CheerioCrawler` downloads the web pages using the `[`utils.requestAsBrowser()`](../api/utils#requestasbrowser)` utility function. As opposed to the
browser based crawlers that are automatically encoding the URLs, the `[`utils.requestAsBrowser()`](../api/utils#requestasbrowser)` function will not
do so. We either need to manually encode the URLs via `encodeURI()` function, or set `forceUrlEncoding: true` in the `requestAsBrowserOptions`, which
will automatically encode all the URLs before accessing them.

> We can either use `forceUrlEncoding` or encode manually, but not both - it would result in double encoding and therefore lead to invalid URLs.

We can use the `preNavigationHooks` to adjust `requestAsBrowserOptions`:

```
preNavigationHooks: [
    (crawlingContext, requestAsBrowserOptions) => {
        requestAsBrowserOptions.forceUrlEncoding = true;
    },
]
```

By default, `CheerioCrawler` only processes web pages with the `text/html` and `application/xhtml+xml` MIME content types (as reported by the
`Content-Type` HTTP header), and skips pages with other content types. If you want the crawler to process other content types, use the
[`CheerioCrawlerOptions.additionalMimeTypes`](../typedefs/cheerio-crawler-options#additionalmimetypes) constructor option. Beware that the parsing
behavior differs for HTML, XML, JSON and other types of content. For details, see
[`CheerioCrawlerOptions.handlePageFunction`](../typedefs/cheerio-crawler-options#handlepagefunction).

New requests are only dispatched when there is enough free CPU and memory available, using the functionality provided by the
[`AutoscaledPool`](../api/autoscaled-pool) class. All [`AutoscaledPool`](../api/autoscaled-pool) configuration options can be passed to the
`autoscaledPoolOptions` parameter of the `CheerioCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
[`AutoscaledPool`](../api/autoscaled-pool) options are available directly in the `CheerioCrawler` constructor.

**Example usage:**

```javascript
// Prepare a list of URLs to crawl
const requestList = new Apify.RequestList({
    sources: [{ url: 'http://www.example.com/page-1' }, { url: 'http://www.example.com/page-2' }],
});
await requestList.initialize();

// Crawl the URLs
const crawler = new Apify.CheerioCrawler({
    requestList,
    handlePageFunction: async ({ request, response, body, contentType, $ }) => {
        const data = [];

        // Do some data extraction from the page with Cheerio.
        $('.some-collection').each((index, el) => {
            data.push({
                title: $(el)
                    .find('.some-title')
                    .text(),
            });
        });

        // Save the data to dataset.
        await Apify.pushData({
            url: request.url,
            html: body,
            data,
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

### `autoscaledPool`

**Type**: [`AutoscaledPool`](../api/autoscaled-pool)

A reference to the underlying [`AutoscaledPool`](../api/autoscaled-pool) class that manages the concurrency of the crawler. Note that this property is
only initialized after calling the [`CheerioCrawler.run()`](../api/cheerio-crawler#run) function. You can use it to change the concurrency settings on
the fly, to pause the crawler by calling [`AutoscaledPool.pause()`](../api/autoscaled-pool#pause) or to abort it by calling
[`AutoscaledPool.abort()`](../api/autoscaled-pool#abort).

---

<a name="cheeriocrawler"></a>

## `new CheerioCrawler(options)`

**Parameters**:

-   **`options`**: [`CheerioCrawlerOptions`](../typedefs/cheerio-crawler-options) - All `CheerioCrawler` parameters are passed via an options object.

---

<a name="use"></a>

## `cheerioCrawler.use(extension)`

**EXPERIMENTAL** Function for attaching CrawlerExtensions such as the Unblockers.

**Parameters**:

-   **`extension`**: `CrawlerExtension` - Crawler extension that overrides the crawler configuration.

---
