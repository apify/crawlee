# `@crawlee/basic`

Provides a simple framework for parallel crawling of web pages. The URLs to crawl are fed either from a static list of URLs or from a dynamic queue of URLs enabling recursive crawling of websites.

`BasicCrawler` is a low-level tool that requires the user to implement the page download and data extraction functionality themselves.
If we want a crawler that already facilitates this functionality, we should consider using [CheerioCrawler](https://crawlee.dev/api/cheerio-crawler/class/CheerioCrawler), [PuppeteerCrawler](https://crawlee.dev/api/puppeteer-crawler/class/PuppeteerCrawler) or [PlaywrightCrawler](https://crawlee.dev/api/playwright-crawler/class/PlaywrightCrawler).

`BasicCrawler` invokes the user-provided [`requestHandler`](https://crawlee.dev/api/basic-crawler/interface/BasicCrawlerOptions#requestHandler) for each [Request](https://crawlee.dev/api/core/class/Request) object, which represents a single URL to crawl. The [Request](https://crawlee.dev/api/core/class/Request) objects are fed from the [RequestList](https://crawlee.dev/api/core/class/RequestList) or [RequestQueue](https://crawlee.dev/api/core/class/RequestQueue) instances provided by the [`requestList`](https://crawlee.dev/api/basic-crawler/interface/BasicCrawlerOptions#requestList) or [`requestQueue`](https://crawlee.dev/api/basic-crawler/interface/BasicCrawlerOptions#requestQueue) constructor options, respectively. If neither `requestList` nor `requestQueue` options are provided, the crawler will open the default request queue either when the [`crawler.addRequests()`](https://crawlee.dev/api/basic-crawler/class/BasicCrawler#addRequests) function is called, or if `requests` parameter (representing the initial requests) of the [`crawler.run()`](https://crawlee.dev/api/basic-crawler/class/BasicCrawler#run) function is provided.

If both [`requestList`](https://crawlee.dev/api/basic-crawler/interface/BasicCrawlerOptions#requestList) and [`requestQueue`](https://crawlee.dev/api/basic-crawler/interface/BasicCrawlerOptions#requestQueue) options are used, the instance first processes URLs from the [RequestList](https://crawlee.dev/api/core/class/RequestList) and automatically enqueues all of them to the [RequestQueue](https://crawlee.dev/api/core/class/RequestQueue) before it starts their processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes if there are no more [Request](https://crawlee.dev/api/core/class/Request) objects to crawl.

New requests are only dispatched when there is enough free CPU and memory available, using the functionality provided by the [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) class. All [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) configuration options can be passed to the [`autoscaledPoolOptions`](https://crawlee.dev/api/basic-crawler/interface/BasicCrawlerOptions#autoscaledPoolOptions) parameter of the `BasicCrawler` constructor. For user convenience, the [`minConcurrency`](https://crawlee.dev/api/core/interface/AutoscaledPoolOptions#minConcurrency) and [`maxConcurrency`](https://crawlee.dev/api/core/interface/AutoscaledPoolOptions#maxConcurrency) options of the underlying [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) constructor are available directly in the `BasicCrawler` constructor.

## Example usage

```javascript
import { BasicCrawler, Dataset } from 'crawlee';

// Create a crawler instance
const crawler = new BasicCrawler({
    async requestHandler({ request, sendRequest }) {
        // 'request' contains an instance of the Request class
        // Here we simply fetch the HTML of the page and store it to a dataset
        const { body } = await sendRequest({
            url: request.url,
            method: request.method,
            body: request.payload,
            headers: request.headers,
        });

        await Dataset.pushData({
            url: request.url,
            html: body,
        })
    },
});

// Enqueue the initial requests and run the crawler
await crawler.run([
    'http://www.example.com/page-1',
    'http://www.example.com/page-2',
]);
