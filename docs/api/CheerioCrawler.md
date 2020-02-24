---
id: cheerio-crawler
title: CheerioCrawler
---

<a name="cheeriocrawler"></a>

Provides a framework for the parallel crawling of web pages using plain HTTP requests and [cheerio](https://www.npmjs.com/package/cheerio) HTML
parser. The URLs to crawl are fed either from a static list of URLs or from a dynamic queue of URLs enabling recursive crawling of websites.

Since `CheerioCrawler` uses raw HTTP requests to download web pages, it is very fast and efficient on data bandwidth. However, if the target website
requires JavaScript to display the content, you might need to use [`PuppeteerCrawler`](/docs/api/puppeteer-crawler) instead, because it loads the
pages using full-featured headless Chrome browser.

`CheerioCrawler` downloads each URL using a plain HTTP request, parses the HTML content using [Cheerio](https://www.npmjs.com/package/cheerio) and
then invokes the user-provided [`CheerioCrawlerOptions.handlePageFunction`](/docs/typedefs/cheerio-crawler-options#handlepagefunction) to extract page
data using a [jQuery](https://jquery.com/)-like interface to the parsed HTML DOM.

The source URLs are represented using [`Request`](/docs/api/request) objects that are fed from [`RequestList`](/docs/api/request-list) or
[`RequestQueue`](/docs/api/request-queue) instances provided by the
[`CheerioCrawlerOptions.requestList`](/docs/typedefs/cheerio-crawler-options#requestlist) or
[`CheerioCrawlerOptions.requestQueue`](/docs/typedefs/cheerio-crawler-options#requestqueue) constructor options, respectively.

If both [`CheerioCrawlerOptions.requestList`](/docs/typedefs/cheerio-crawler-options#requestlist) and
[`CheerioCrawlerOptions.requestQueue`](/docs/typedefs/cheerio-crawler-options#requestqueue) are used, the instance first processes URLs from the
[`RequestList`](/docs/api/request-list) and automatically enqueues all of them to [`RequestQueue`](/docs/api/request-queue) before it starts their
processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes when there are no more [`Request`](/docs/api/request) objects to crawl.

`CheerioCrawler` downloads the web pages using the [`utils.requestAsBrowser()`](/docs/api/utils#requestasbrowser) utility function. You can use the
`requestOptions` parameter to pass additional options to this function.

By default, `CheerioCrawler` only processes web pages with the `text/html` and `application/xhtml+xml` MIME content types (as reported by the
`Content-Type` HTTP header), and skips pages with other content types. If you want the crawler to process other content types, use the
[`CheerioCrawlerOptions.additionalMimeTypes`](/docs/typedefs/cheerio-crawler-options#additionalmimetypes) constructor option. Beware that the parsing
behavior differs for HTML, XML, JSON and other types of content. For details, see
[`CheerioCrawlerOptions.handlePageFunction`](/docs/typedefs/cheerio-crawler-options#handlepagefunction).

New requests are only dispatched when there is enough free CPU and memory available, using the functionality provided by the
[`AutoscaledPool`](/docs/api/autoscaled-pool) class. All [`AutoscaledPool`](/docs/api/autoscaled-pool) configuration options can be passed to the
`autoscaledPoolOptions` parameter of the `CheerioCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
[`AutoscaledPool`](/docs/api/autoscaled-pool) options are available directly in the `CheerioCrawler` constructor.

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

---

<a name="cheeriocrawler"></a>

## `new CheerioCrawler(options)`

**Params**

-   **`options`**: [`CheerioCrawlerOptions`](/docs/typedefs/cheerio-crawler-options) - All `CheerioCrawler` parameters are passed via an options
    object.

---

<a name="run"></a>

## `cheerioCrawler.run()`

**Returns**: `Promise`

Runs the crawler. Returns promise that gets resolved once all the requests got processed.

---
