# `@crawlee/http`

Provides a framework for the parallel crawling of web pages using plain HTTP requests. The URLs to crawl are fed either from a static list of URLs or from a dynamic queue of URLs enabling recursive crawling of websites.

It is very fast and efficient on data bandwidth. However, if the target website requires JavaScript to display the content, you might need to use {[PuppeteerCrawler](https://crawlee.dev/api/puppeteer-crawler/class/PuppeteerCrawler) or [PlaywrightCrawler](https://crawlee.dev/api/playwright-crawler/class/PlaywrightCrawler) instead, because it loads the pages using full-featured headless Chrome browser. **This crawler downloads each URL using a plain HTTP request and doesn't do any HTML parsing.**

The source URLs are represented using [Request](https://crawlee.dev/api/core/class/Request) objects that are fed from [RequestList](https://crawlee.dev/api/core/class/RequestList) or [RequestQueue](https://crawlee.dev/api/core/class/RequestQueue) instances provided by the [HttpCrawlerOptions.requestList](https://crawlee.dev/api/http-crawler/interface/HttpCrawlerOptions#requestList) or [HttpCrawlerOptions.requestQueue](https://crawlee.dev/api/http-crawler/interface/HttpCrawlerOptions#requestQueue) constructor options, respectively.

If both [HttpCrawlerOptions.requestList](https://crawlee.dev/api/http-crawler/interface/HttpCrawlerOptions#requestList) and [HttpCrawlerOptions.requestQueue](https://crawlee.dev/api/http-crawler/interface/HttpCrawlerOptions#requestQueue) are used, the instance first processes URLs from the [RequestList](https://crawlee.dev/api/core/class/RequestList) and automatically enqueues all of them to [RequestQueue](https://crawlee.dev/api/core/class/RequestQueue) before it starts their processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes when there are no more [Request](https://crawlee.dev/api/core/class/Request) objects to crawl.

We can use the `preNavigationHooks` to adjust `gotOptions`:

```javascript
preNavigationHooks: [
    (crawlingContext, gotOptions) => {
        // ...
    },
]
```

By default, `HttpCrawler` only processes web pages with the `text/html` and `application/xhtml+xml` MIME content types (as reported by the `Content-Type` HTTP header), and skips pages with other content types. If you want the crawler to process other content types, use the [HttpCrawlerOptions.additionalMimeTypes](https://crawlee.dev/api/http-crawler/interface/HttpCrawlerOptions#additionalMimeTypes) constructor option. Beware that the parsing behavior differs for HTML, XML, JSON and other types of content. For more details, see [HttpCrawlerOptions.requestHandler](https://crawlee.dev/api/http-crawler/interface/HttpCrawlerOptions#requestHandler).

New requests are only dispatched when there is enough free CPU and memory available, using the functionality provided by the [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) class. All [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) configuration options can be passed to the `autoscaledPoolOptions` parameter of the `HttpCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency` [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) options are available directly in the `HttpCrawler` constructor.

## Example usage

```javascript
import { HttpCrawler, Dataset } from '@crawlee/http';

const crawler = new HttpCrawler({
    requestList,
    async requestHandler({ request, response, body, contentType }) {
        // Save the data to dataset.
        await Dataset.pushData({
            url: request.url,
            html: body,
        });
    },
});

await crawler.run([
    'http://www.example.com/page-1',
    'http://www.example.com/page-2',
]);
```
