# `@crawlee/puppeteer`

Provides a simple framework for parallel crawling of web pages using headless Chrome with [Puppeteer](https://github.com/puppeteer/puppeteer). The URLs to crawl are fed either from a static list of URLs or from a dynamic queue of URLs enabling recursive crawling of websites.

Since `PuppeteerCrawler` uses headless Chrome to download web pages and extract data, it is useful for crawling of websites that require to execute JavaScript. If the target website doesn't need JavaScript, consider using [CheerioCrawler](https://crawlee.dev/api/cheerio-crawler/class/CheerioCrawler), which downloads the pages using raw HTTP requests and is about 10x faster.

The source URLs are represented using [Request](https://crawlee.dev/api/core/class/Request) objects that are fed from [RequestList](https://crawlee.dev/api/core/class/RequestList) or [RequestQueue](https://crawlee.dev/api/core/class/RequestQueue) instances provided by the [PuppeteerCrawlerOptions.requestList](https://crawlee.dev/api/puppeteer-crawler/interface/PuppeteerCrawlerOptions#requestList) or [PuppeteerCrawlerOptions.requestQueue](https://crawlee.dev/api/puppeteer-crawler/interface/PuppeteerCrawlerOptions#requestQueue) constructor options, respectively.

If both [PuppeteerCrawlerOptions.requestList](https://crawlee.dev/api/puppeteer-crawler/interface/PuppeteerCrawlerOptions#requestList) and [PuppeteerCrawlerOptions.requestQueue](https://crawlee.dev/api/puppeteer-crawler/interface/PuppeteerCrawlerOptions#requestQueue) are used,
the instance first processes URLs from the [RequestList](https://crawlee.dev/api/core/class/RequestList) and automatically enqueues all of them
to [RequestQueue](https://crawlee.dev/api/core/class/RequestQueue) before it starts their processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes when there are no more [Request](https://crawlee.dev/api/core/class/Request) objects to crawl.

`PuppeteerCrawler` opens a new Chrome page (i.e. tab) for each [Request](https://crawlee.dev/api/core/class/Request) object to crawl
and then calls the function provided by user as the [PuppeteerCrawlerOptions.requestHandler](https://crawlee.dev/api/puppeteer-crawler/interface/PuppeteerCrawlerOptions#requestHandler) option.

New pages are only opened when there is enough free CPU and memory available,
using the functionality provided by the [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) class.
All [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) configuration options can be passed to the [PuppeteerCrawlerOptions.autoscaledPoolOptions](https://crawlee.dev/api/puppeteer-crawler/interface/PuppeteerCrawlerOptions#autoscaledPoolOptions)
parameter of the `PuppeteerCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
[AutoscaledPoolOptions](https://crawlee.dev/api/core/interface/AutoscaledPoolOptions) are available directly in the `PuppeteerCrawler` constructor.

Note that the pool of Puppeteer instances is internally managed by the [BrowserPool](https://github.com/apify/browser-pool) class.

## Example usage

```javascript
const crawler = new PuppeteerCrawler({
    async requestHandler({ page, request }) {
        // This function is called to extract data from a single web page
        // 'page' is an instance of Puppeteer.Page with page.goto(request.url) already called
        // 'request' is an instance of Request class with information about the page to load
        await Dataset.pushData({
            title: await page.title(),
            url: request.url,
            succeeded: true,
        })
    },
    async failedRequestHandler({ request }) {
        // This function is called when the crawling of a request failed too many times
        await Dataset.pushData({
            url: request.url,
            succeeded: false,
            errors: request.errorMessages,
        })
    },
});

await crawler.run([
    'http://www.example.com/page-1',
    'http://www.example.com/page-2',
]);
```
