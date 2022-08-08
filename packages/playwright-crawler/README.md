# `@crawlee/playwright`

Provides a simple framework for parallel crawling of web pages using headless Chromium, Firefox and Webkit browsers with [Playwright](https://github.com/microsoft/playwright). The URLs to crawl are fed either from a static list of URLs or from a dynamic queue of URLs enabling recursive crawling of websites.

Since `Playwright` uses headless browser to download web pages and extract data, it is useful for crawling of websites that require to execute JavaScript. If the target website doesn't need JavaScript, consider using [CheerioCrawler](https://crawlee.dev/api/cheerio-crawler/class/CheerioCrawler), which downloads the pages using raw HTTP requests and is about 10x faster.

The source URLs are represented using [Request](https://crawlee.dev/api/core/class/Request) objects that are fed from [RequestList](https://crawlee.dev/api/core/class/RequestList) or [RequestQueue](https://crawlee.dev/api/core/class/RequestQueue) instances provided by the [PlaywrightCrawlerOptions.requestList](https://crawlee.dev/api/playwright-crawler/interface/PlaywrightCrawlerOptions#requestList) or [PlaywrightCrawlerOptions.requestQueue](https://crawlee.dev/api/playwright-crawler/interface/PlaywrightCrawlerOptions#requestQueue) constructor options, respectively.

If both [PlaywrightCrawlerOptions.requestList](https://crawlee.dev/api/playwright-crawler/interface/PlaywrightCrawlerOptions#requestList) and [PlaywrightCrawlerOptions.requestQueue](https://crawlee.dev/api/playwright-crawler/interface/PlaywrightCrawlerOptions#requestQueue) are used, the instance first processes URLs from the [RequestList](https://crawlee.dev/api/core/class/RequestList) and automatically enqueues all of them to [RequestQueue](https://crawlee.dev/api/core/class/RequestQueue) before it starts their processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes when there are no more [Request](https://crawlee.dev/api/core/class/Request) objects to crawl.

`PlaywrightCrawler` opens a new Chrome page (i.e. tab) for each [Request](https://crawlee.dev/api/core/class/Request) object to crawl and then calls the function provided by user as the [PlaywrightCrawlerOptions.requestHandler](https://crawlee.dev/api/playwright-crawler/interface/PlaywrightCrawlerOptions#requestHandler) option.

New pages are only opened when there is enough free CPU and memory available, using the functionality provided by the [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) class. All [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) configuration options can be passed to the [PlaywrightCrawlerOptions.autoscaledPoolOptions](https://crawlee.dev/api/playwright-crawler/interface/PlaywrightCrawlerOptions#autoscaledPoolOptions) parameter of the `PlaywrightCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency` [AutoscaledPoolOptions](https://crawlee.dev/api/core/interface/AutoscaledPoolOptions) are available directly in the `PlaywrightCrawler` constructor.

Note that the pool of Playwright instances is internally managed by the [BrowserPool](https://github.com/apify/browser-pool) class.

## Example usage

```javascript
const crawler = new PlaywrightCrawler({
    async requestHandler({ page, request }) {
        // This function is called to extract data from a single web page
        // 'page' is an instance of Playwright.Page with page.goto(request.url) already called
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
