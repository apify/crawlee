---
id: basiccrawler
title: BasicCrawler
---
<a name="exp_module_BasicCrawler--BasicCrawler"></a>

## BasicCrawler ⏏
Provides a simple framework for the parallel crawling of web pages,
whose URLs are fed either from a static list
or from a dynamic queue of URLs.

`BasicCrawler` invokes the user-provided `handleRequestFunction` for each [`Request`](Request)
object, which corresponds to a single URL to crawl.
The `Request` objects are fed from the [`RequestList`](RequestList) or [`RequestQueue`](#RequestQueue)
instances provided by the `requestList` or `requestQueue` constructor options, respectively.

If both `requestList` and `requestQueue` is used, the instance first
processes URLs from the `RequestList` and automatically enqueues all of them to `RequestQueue` before it starts
their processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes if there are no more `Request` objects to crawl.

New requests are only launched if there is enough free CPU and memory available,
using the functionality provided by the [`AutoscaledPool`](AutoscaledPool) class.
All `AutoscaledPool` configuration options can be passed to the `autoscaledPoolOptions` parameter
of the `CheerioCrawler` constructor.
For user convenience, the `minConcurrency` and `maxConcurrency` options are available directly in the constructor.

**Example usage:**

```javascript
const rp = require('request-promise');

// Prepare a list of URLs to crawl
const requestList = new Apify.RequestList({
  sources: [
      { url: 'http://www.example.com/page-1' },
      { url: 'http://www.example.com/page-2' },
  ],
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
        })
    },
});

await crawler.run();
```

**Kind**: Exported class  
**See**

- [CheerioCrawler](CheerioCrawler)
- [PuppeteerCrawler](PuppeteerCrawler)

* [BasicCrawler](#exp_module_BasicCrawler--BasicCrawler) ⏏
    * [new BasicCrawler(options)](#new_module_BasicCrawler--BasicCrawler_new)
    * [.run()](#module_BasicCrawler--BasicCrawler+run) ⇒ <code>Promise</code>
    * [.abort()](#module_BasicCrawler--BasicCrawler+abort) ⇒ <code>Promise</code>

<a name="new_module_BasicCrawler--BasicCrawler_new"></a>

### new BasicCrawler(options)

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  |  |
| options.handleRequestFunction | <code>function</code> |  | User-provided function that performs the logic of the crawler. It is called for each URL to crawl.   The function that receives an object as argument, with the following field:   <ul>     <li>`request`: the [`Request`](Request) object representing the URL to crawl</li>   </ul>   The function must return a promise. |
| options.requestList | <code>RequestList</code> |  | Static list of URLs to be processed.   Either `RequestList` or `RequestQueue` must be provided. |
| options.requestQueue | [<code>RequestQueue</code>](#RequestQueue) |  | Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.   Either RequestList or RequestQueue must be provided. |
| [options.handleFailedRequestFunction] | <code>function</code> |  | Function that handles requests that failed more then `option.maxRequestRetries` times.   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/basic_crawler.js#L11">GitHub</a> for default behavior. |
| [options.maxRequestRetries] | <code>Number</code> | <code>3</code> | How many times the request is retried if `handleRequestFunction` failed. |
| [options.maxRequestsPerCrawl] | <code>Number</code> |  | Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.   Always set this value in order to prevent infinite loops in misconfigured crawlers.   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value. |
| [options.autoscaledPoolOptions] | <code>Object</code> |  | Custom options passed to the underlying [`AutoscaledPool`](AutoscaledPool) instance constructor.   Note that the `runTaskFunction`, `isTaskReadyFunction` and `isFinishedFunction` options   are provided by `BasicCrawler` and cannot be overridden. |
| [options.minConcurrency] | <code>Object</code> | <code>1</code> | Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding `AutoscaledPool` option. |
| [options.maxConcurrency] | <code>Object</code> | <code>1000</code> | Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding `AutoscaledPool` option. |

<a name="module_BasicCrawler--BasicCrawler+run"></a>

### basicCrawler.run() ⇒ <code>Promise</code>
Runs the crawler. Returns a promise that gets resolved once all the requests are processed.

**Kind**: instance method of [<code>BasicCrawler</code>](#exp_module_BasicCrawler--BasicCrawler)  
<a name="module_BasicCrawler--BasicCrawler+abort"></a>

### basicCrawler.abort() ⇒ <code>Promise</code>
Aborts the crawler by preventing additional requests and terminating the running ones.

**Kind**: instance method of [<code>BasicCrawler</code>](#exp_module_BasicCrawler--BasicCrawler)  
