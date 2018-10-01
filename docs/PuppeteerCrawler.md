---
id: puppeteercrawler
title: PuppeteerCrawler
---
<a name="exp_module_PuppeteerCrawler--PuppeteerCrawler"></a>

## PuppeteerCrawler ⏏
Provides a simple framework for parallel crawling of web pages
using headless Chrome with [Puppeteer](https://github.com/GoogleChrome/puppeteer).
The URLs of pages to visit are given by `Request` objects that are fed from a list (see `RequestList` class)
or from a dynamic queue (see `RequestQueue` class).

`PuppeteerCrawler` opens a new Chrome page (i.e. tab) for each `Request` object to crawl
and then calls the function provided by user as the `handlePageFunction` option.
New tasks are only started if there is enough free CPU and memory available,
using the `AutoscaledPool` class internally.

**Example usage:**

```javascript
const crawler = new Apify.PuppeteerCrawler({
    requestList,
    handlePageFunction: async ({ page, request }) => {
        // This function is called to extract data from a single web page
        // 'page' is an instance of Puppeteer.Page with page.goto(request.url) already called
        // 'request' is an instance of Request class with information about the page to load
        await Apify.pushData({
            title: await page.title(),
            url: request.url,
            succeeded: true,
        })
    },
    handleFailedRequestFunction: async ({ request }) => {
        // This function is called when crawling of a request failed too many time
        await Apify.pushData({
            url: request.url,
            succeeded: false,
            errors: request.errorMessages,
        })
    },
});

await crawler.run();
```

**Kind**: Exported class  
**See**

- [CheerioCrawler](CheerioCrawler)
- [BasicCrawler](BasicCrawler)

* [PuppeteerCrawler](#exp_module_PuppeteerCrawler--PuppeteerCrawler) ⏏
    * [new PuppeteerCrawler(options)](#new_module_PuppeteerCrawler--PuppeteerCrawler_new)
    * [.run()](#module_PuppeteerCrawler--PuppeteerCrawler+run) ⇒ <code>Promise</code>
    * [.abort()](#module_PuppeteerCrawler--PuppeteerCrawler+abort) ⇒ <code>Promise</code>

<a name="new_module_PuppeteerCrawler--PuppeteerCrawler_new"></a>

### new PuppeteerCrawler(options)

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  |  |
| options.handlePageFunction | <code>function</code> |  | Function that is called to process each request.   It is passed an object with the following fields:   `request` is an instance of the `Request` object with details about the URL to open, HTTP method etc.   `page` is an instance of the `Puppeteer.Page` class with `page.goto(request.url)` already called. |
| options.requestList | <code>RequestList</code> |  | List of the requests to be processed.   Either RequestList or RequestQueue must be provided.   See the `requestList` parameter of `BasicCrawler` for more details. |
| options.requestQueue | [<code>RequestQueue</code>](#RequestQueue) |  | Queue of the requests to be processed.   Either RequestList or RequestQueue must be provided.   See the `requestQueue` parameter of `BasicCrawler` for more details. |
| [options.handlePageTimeoutSecs] | <code>Number</code> | <code>300</code> | Timeout in which the function passed as `options.handlePageFunction` needs to finish, in seconds. |
| [options.gotoFunction] | <code>function</code> |  | Overrides the function that opens the request in Puppeteer. The function should return a result of Puppeteer's   <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagegotourl-options">page.goto()</a> function,   i.e. a promise resolving to the <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-response">Response</a> object.   For example, this is useful if you need to extend the page load timeout or select different criteria   to determine that the navigation succeeded.   Note that a single page object is only used to process a single request and it is closed afterwards.   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_crawler.js#L9">GitHub</a> for default behavior. |
| [options.handleFailedRequestFunction] | <code>function</code> |  | Function to handle requests that failed more than `option.maxRequestRetries` times. See the `handleFailedRequestFunction`   parameter of `Apify.BasicCrawler` for details.   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_crawler.js#L13">GitHub</a> for default behavior. |
| [options.maxRequestRetries] | <code>Number</code> | <code>3</code> | Indicates how many times each request is retried if `handleRequestFunction` failed.   See `maxRequestRetries` parameter of `BasicCrawler`. |
| [options.maxRequestsPerCrawl] | <code>Number</code> |  | Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.   Always set this value in order to prevent infinite loops in misconfigured crawlers.   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.   See `maxRequestsPerCrawl` parameter of `BasicCrawler`. |
| [options.maxOpenPagesPerInstance] | <code>Number</code> | <code>50</code> | Maximum number of opened tabs per browser. If this limit is reached then a new   browser instance is started. See `maxOpenPagesPerInstance` parameter of `PuppeteerPool`. |
| [options.retireInstanceAfterRequestCount] | <code>Number</code> | <code>100</code> | Maximum number of requests that can be processed by a single browser instance.   After the limit is reached the browser will be retired and new requests will   be handled by a new browser instance.   See `retireInstanceAfterRequestCount` parameter of `PuppeteerPool`. |
| [options.instanceKillerIntervalMillis] | <code>Number</code> | <code>60000</code> | How often the launched Puppeteer instances are checked whether they can be   closed. See `instanceKillerIntervalMillis` parameter of `PuppeteerPool`. |
| [options.killInstanceAfterMillis] | <code>Number</code> | <code>300000</code> | If Puppeteer instance reaches the `options.retireInstanceAfterRequestCount` limit then   it is considered retired and no more tabs will be opened. After the last tab is closed   the whole browser is closed too. This parameter defines a time limit for inactivity   after which the browser is closed even if there are pending tabs. See   `killInstanceAfterMillis` parameter of `PuppeteerPool`. |
| [options.launchPuppeteerFunction] | <code>function</code> |  | Overrides the default function to launch a new Puppeteer instance.   See `launchPuppeteerFunction` parameter of `PuppeteerPool`.   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_crawler.js#L9">GitHub</a> for default behavior. |
| [options.launchPuppeteerOptions] | [<code>LaunchPuppeteerOptions</code>](#LaunchPuppeteerOptions) |  | Options used by `Apify.launchPuppeteer()` to start new Puppeteer instances.   See `launchPuppeteerOptions` parameter of `PuppeteerPool`. |
| [options.autoscaledPoolOptions] | <code>Object</code> |  | Custom options passed to the underlying [`AutoscaledPool`](AutoscaledPool) instance constructor.   Note that the `runTaskFunction`, `isTaskReadyFunction` and `isFinishedFunction` options   are provided by `PuppeteerCrawler` and should not be overridden. |
| [options.minConcurrency] | <code>Object</code> | <code>1</code> | Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding `AutoscaledPool` option. |
| [options.maxConcurrency] | <code>Object</code> | <code>1000</code> | Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding `AutoscaledPool` option. |

<a name="module_PuppeteerCrawler--PuppeteerCrawler+run"></a>

### puppeteerCrawler.run() ⇒ <code>Promise</code>
Runs the crawler. Returns promise that gets resolved once all the requests got processed.

**Kind**: instance method of [<code>PuppeteerCrawler</code>](#exp_module_PuppeteerCrawler--PuppeteerCrawler)  
<a name="module_PuppeteerCrawler--PuppeteerCrawler+abort"></a>

### puppeteerCrawler.abort() ⇒ <code>Promise</code>
Stops the crawler by preventing crawls of additional pages and terminating the running ones.

**Kind**: instance method of [<code>PuppeteerCrawler</code>](#exp_module_PuppeteerCrawler--PuppeteerCrawler)  
