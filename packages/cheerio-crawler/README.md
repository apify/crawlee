# `@crawlee/cheerio`

Provides a framework for the parallel crawling of web pages using plain HTTP requests and [cheerio](https://www.npmjs.com/package/cheerio) HTML parser. The URLs to crawl are fed either from a static list of URLs or from a dynamic queue of URLs enabling recursive crawling of websites.

Since `CheerioCrawler` uses raw HTTP requests to download web pages, it is very fast and efficient on data bandwidth. However, if the target website requires JavaScript to display the content, you might need to use [PuppeteerCrawler](https://crawlee.dev/api/puppeteer-crawler/class/PuppeteerCrawler) or [PlaywrightCrawler](https://crawlee.dev/api/playwright-crawler/class/PlaywrightCrawler) instead, because it loads the pages using full-featured headless Chrome browser.

`CheerioCrawler` downloads each URL using a plain HTTP request, parses the HTML content using [Cheerio](https://www.npmjs.com/package/cheerio) and then invokes the user-provided [CheerioCrawlerOptions.requestHandler](https://crawlee.dev/api/cheerio-crawler/interface/CheerioCrawlerOptions#requestHandler) to extract page data using a [jQuery](https://jquery.com/)-like interface to the parsed HTML DOM.

The source URLs are represented using [Request](https://crawlee.dev/api/core/class/Request) objects that are fed from [RequestList](https://crawlee.dev/api/core/class/RequestList) or [RequestQueue](https://crawlee.dev/api/core/class/RequestQueue) instances provided by the [CheerioCrawlerOptions.requestList](https://crawlee.dev/api/cheerio-crawler/interface/CheerioCrawlerOptions#requestList) or [CheerioCrawlerOptions.requestQueue](https://crawlee.dev/api/cheerio-crawler/interface/CheerioCrawlerOptions#requestQueue) constructor options, respectively.

If both [CheerioCrawlerOptions.requestList](https://crawlee.dev/api/cheerio-crawler/interface/CheerioCrawlerOptions#requestList) and [CheerioCrawlerOptions.requestQueue](https://crawlee.dev/api/cheerio-crawler/interface/CheerioCrawlerOptions#requestQueue) are used, the instance first processes URLs from the [RequestList](https://crawlee.dev/api/core/class/RequestList) and automatically enqueues all of them to [RequestQueue](https://crawlee.dev/api/core/class/RequestQueue) before it starts their processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes when there are no more [Request](https://crawlee.dev/api/core/class/Request) objects to crawl.

We can use the `preNavigationHooks` to adjust `gotOptions`:

```
preNavigationHooks: [
    (crawlingContext, gotOptions) => {
        // ...
    },
]
```

By default, `CheerioCrawler` only processes web pages with the `text/html` and `application/xhtml+xml` MIME content types (as reported by the `Content-Type` HTTP header), and skips pages with other content types. If you want the crawler to process other content types, use the [CheerioCrawlerOptions.additionalMimeTypes](https://crawlee.dev/api/cheerio-crawler/interface/CheerioCrawlerOptions#additionalMimeTypes) constructor option. Beware that the parsing behavior differs for HTML, XML, JSON and other types of content. For more details, see [CheerioCrawlerOptions.requestHandler](https://crawlee.dev/api/cheerio-crawler/interface/CheerioCrawlerOptions#requestHandler).

New requests are only dispatched when there is enough free CPU and memory available, using the functionality provided by the [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) class. All [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) configuration options can be passed to the `autoscaledPoolOptions` parameter of the `CheerioCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency` [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) options are available directly in the `CheerioCrawler` constructor.

## Example usage

```ts
const crawler = new CheerioCrawler({
    requestList,
    async requestHandler({ request, response, body, contentType, $ }) {
        const data = [];

        // Do some data extraction from the page with Cheerio.
        $('.some-collection').each((index, el) => {
            data.push({ title: $(el).find('.some-title').text() });
        });

        // Save the data to dataset.
        await Dataset.pushData({
            url: request.url,
            html: body,
            data,
        })
    },
});

await crawler.run([
    'http://www.example.com/page-1',
    'http://www.example.com/page-2',
]);
```
