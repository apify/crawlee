---
id: cheeriocrawler
title: CheerioCrawler
---
<a name="exp_module_CheerioCrawler--CheerioCrawler"></a>

## CheerioCrawler ⏏
Provides a framework for the parallel crawling of web pages using plain HTTP requests and
[cheerio](https://www.npmjs.com/package/cheerio) HTML parser.

`CheerioCrawler` downloads each URL using a plain HTTP request,
parses the HTML content using cheerio and then
invokes the user-provided `handlePageFunction` to extract page data
using a [jQuery](https://jquery.com/)-like interface to parsed HTML DOM.

The source URLs are represented using `Request` objects that
are fed from the [`RequestList`](RequestList) or [`RequestQueue`](#RequestQueue)
instances provided by the `requestList` or `requestQueue` constructor options, respectively.

If both `requestList` and `requestQueue` is used, the instance first
processes URLs from the `RequestList` and automatically enqueues all of them to `RequestQueue` before it starts
their processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes if there are no more `Request` objects to crawl.

By default, `CheerioCrawler` downloads HTML using the [request-promise](https://www.npmjs.com/package/request-promise) NPM package.
You can override this behavior by setting the `requestFunction` option.

New requests are only started if there is enough free CPU and memory available,
using the functionality provided by the [`AutoscaledPool`](AutoscaledPool) class.
All `AutoscaledPool` configuration options can be passed to the `autoscaledPoolOptions` parameter
of the `CheerioCrawler` constructor.
For user convenience, the `minConcurrency` and `maxConcurrency` options are available directly.

**Example usage:**

```javascript
// Prepare a list of URLs to crawl
const requestList = new Apify.RequestList({
  sources: [
      { url: 'http://www.example.com/page-1' },
      { url: 'http://www.example.com/page-2' },
  ],
});
await requestList.initialize();

// Crawl the URLs
const crawler = new Apify.CheerioCrawler({
    requestList,
    handlePageFunction: async ({ $, html, request }) => {

        const data = [];

        // Do some data extraction from the page with Cheerio.
        $('.some-collection').each((index, el) => {
            data.push({ title: $(el).find('.some-title').text() });
        });

        // Save the data to dataset.
        await Apify.pushData({
            url: request.url,
            html,
            data,
        })
    },
});

await crawler.run();
```

**Kind**: Exported class  
**See**

- [BasicCrawler](BasicCrawler)
- [PuppeteerCrawler](PuppeteerCrawler)

* [CheerioCrawler](#exp_module_CheerioCrawler--CheerioCrawler) ⏏
    * [new CheerioCrawler(options)](#new_module_CheerioCrawler--CheerioCrawler_new)
    * [.run()](#module_CheerioCrawler--CheerioCrawler+run) ⇒ <code>Promise</code>
    * [.abort()](#module_CheerioCrawler--CheerioCrawler+abort) ⇒ <code>Promise</code>

<a name="new_module_CheerioCrawler--CheerioCrawler_new"></a>

### new CheerioCrawler(options)

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  |  |
| options.handlePageFunction | <code>function</code> |  | User-provided function that performs the logic of the crawler. It is called for each page   loaded and parsed by the crawler.   The function that receives an object as argument, with the following three fields:   <ul>     <li>`$`: the Cheerio object</li>     <li>`html`: the raw HTML</li>     <li>`request`: the [`Request`](Request) object representing the URL to crawl</li>   </ul>   If the function returns a promise, it is awaited. |
| options.requestList | <code>RequestList</code> |  | Static list of URLs to be processed.   Either RequestList or RequestQueue must be provided. |
| options.requestQueue | [<code>RequestQueue</code>](#RequestQueue) |  | Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.   Either RequestList or RequestQueue must be provided. |
| [options.requestFunction] | <code>function</code> |  | Overrides the function that performs the HTTP request to get the raw HTML needed for Cheerio.   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/cheerio_crawler.js#L264">GitHub</a> for default behavior. |
| [options.handlePageTimeoutSecs] | <code>Number</code> | <code>300</code> | Timeout in which the function passed as `options.handlePageFunction` needs to finish, given in seconds. |
| [options.requestTimeoutSecs] | <code>Number</code> | <code>30</code> | Timeout in which the function passed as `options.requestFunction` needs to finish, given in seconds. |
| [options.ignoreSslErrors] | <code>Boolean</code> | <code>false</code> | If set to true, SSL certificate errors will be ignored. This is dependent on using the default   request function. If using a custom request function, user needs to implement this functionality. |
| [options.handleFailedRequestFunction] | <code>function</code> |  | Function that handles requests that failed more then `option.maxRequestRetries` times.   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/cheerio_crawler.js#L13">GitHub</a> for default behavior. |
| [options.maxRequestRetries] | <code>Number</code> | <code>3</code> | How many times the request is retried if either `requestFunction` or `handlePageFunction` failed. |
| [options.maxRequestsPerCrawl] | <code>Number</code> |  | Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.   Always set this value in order to prevent infinite loops in misconfigured crawlers.   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value. |
| [options.autoscaledPoolOptions] | <code>Object</code> |  | Custom options passed to the underlying [`AutoscaledPool`](AutoscaledPool) instance constructor.   Note that the `runTaskFunction`, `isTaskReadyFunction` and `isFinishedFunction` options   are provided by `CheerioCrawler` and cannot be overridden. |
| [options.minConcurrency] | <code>Object</code> | <code>1</code> | Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding `AutoscaledPool` option. |
| [options.maxConcurrency] | <code>Object</code> | <code>1000</code> | Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding `AutoscaledPool` option. |

<a name="module_CheerioCrawler--CheerioCrawler+run"></a>

### cheerioCrawler.run() ⇒ <code>Promise</code>
Runs the crawler. Returns promise that gets resolved once all the requests got processed.

**Kind**: instance method of [<code>CheerioCrawler</code>](#exp_module_CheerioCrawler--CheerioCrawler)  
<a name="module_CheerioCrawler--CheerioCrawler+abort"></a>

### cheerioCrawler.abort() ⇒ <code>Promise</code>
Aborts the crawler by preventing crawls of additional pages and terminating the running ones.

**Kind**: instance method of [<code>CheerioCrawler</code>](#exp_module_CheerioCrawler--CheerioCrawler)  
