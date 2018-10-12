---
id: puppeteercrawler
title: PuppeteerCrawler
---
<a name="exp_module_PuppeteerCrawler--PuppeteerCrawler"></a>

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

**See**

- [CheerioCrawler](cheeriocrawler)
- [BasicCrawler](basiccrawler)

* [PuppeteerCrawler](#exp_module_PuppeteerCrawler--PuppeteerCrawler) ⏏
    * [`new PuppeteerCrawler(options)`](#new_module_PuppeteerCrawler--PuppeteerCrawler_new)
    * [`.run()`](puppeteercrawler--PuppeteerCrawler+run) ⇒ <code>Promise</code>
    * [`.abort()`](puppeteercrawler--PuppeteerCrawler+abort) ⇒ <code>Promise</code>

<a name="new_module_PuppeteerCrawler--PuppeteerCrawler_new"></a>

## `new PuppeteerCrawler(options)`
<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>options.handlePageFunction</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Function that is called to process each request.
  It is passed an object with the following fields:
  <code>request</code> is an instance of the <code>Request</code> object with details about the URL to open, HTTP method etc.
  <code>page</code> is an instance of the <code>Puppeteer.Page</code> class with <code>page.goto(request.url)</code> already called.</p>
</td></tr><tr>
<td><code>options.requestList</code></td><td><code><a href="requestlist">RequestList</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>List of the requests to be processed.
  Either RequestList or RequestQueue must be provided.
  See the <code>requestList</code> parameter of <code>BasicCrawler</code> for more details.</p>
</td></tr><tr>
<td><code>options.requestQueue</code></td><td><code><a href="requestqueue">RequestQueue</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Queue of the requests to be processed.
  Either RequestList or RequestQueue must be provided.
  See the <code>requestQueue</code> parameter of <code>BasicCrawler</code> for more details.</p>
</td></tr><tr>
<td><code>[options.handlePageTimeoutSecs]</code></td><td><code>Number</code></td><td><code>300</code></td>
</tr>
<tr>
<td colspan="3"><p>Timeout in which the function passed as <code>options.handlePageFunction</code> needs to finish, in seconds.</p>
</td></tr><tr>
<td><code>[options.gotoFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Overrides the function that opens the request in Puppeteer. The function should return a result of Puppeteer&#39;s
  <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagegotourl-options">page.goto()</a> function,
  i.e. a promise resolving to the <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-response">Response</a> object.</p>
<p>  For example, this is useful if you need to extend the page load timeout or select different criteria
  to determine that the navigation succeeded.</p>
<p>  Note that a single page object is only used to process a single request and it is closed afterwards.</p>
<p>  See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_crawler.js#L9">GitHub</a> for default behavior.</p>
</td></tr><tr>
<td><code>[options.handleFailedRequestFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Function to handle requests that failed more than <code>option.maxRequestRetries</code> times. See the <code>handleFailedRequestFunction</code>
  parameter of <code>Apify.BasicCrawler</code> for details.
  See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_crawler.js#L13">GitHub</a> for default behavior.</p>
</td></tr><tr>
<td><code>[options.maxRequestRetries]</code></td><td><code>Number</code></td><td><code>3</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how many times each request is retried if <code>handleRequestFunction</code> failed.
  See <code>maxRequestRetries</code> parameter of <code>BasicCrawler</code>.</p>
</td></tr><tr>
<td><code>[options.maxRequestsPerCrawl]</code></td><td><code>Number</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
  Always set this value in order to prevent infinite loops in misconfigured crawlers.
  Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
  See <code>maxRequestsPerCrawl</code> parameter of <code>BasicCrawler</code>.</p>
</td></tr><tr>
<td><code>[options.maxOpenPagesPerInstance]</code></td><td><code>Number</code></td><td><code>50</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of opened tabs per browser. If this limit is reached then a new
  browser instance is started. See <code>maxOpenPagesPerInstance</code> parameter of <code>PuppeteerPool</code>.</p>
</td></tr><tr>
<td><code>[options.retireInstanceAfterRequestCount]</code></td><td><code>Number</code></td><td><code>100</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of requests that can be processed by a single browser instance.
  After the limit is reached the browser will be retired and new requests will
  be handled by a new browser instance.
  See <code>retireInstanceAfterRequestCount</code> parameter of <code>PuppeteerPool</code>.</p>
</td></tr><tr>
<td><code>[options.instanceKillerIntervalMillis]</code></td><td><code>Number</code></td><td><code>60000</code></td>
</tr>
<tr>
<td colspan="3"><p>How often the launched Puppeteer instances are checked whether they can be
  closed. See <code>instanceKillerIntervalMillis</code> parameter of <code>PuppeteerPool</code>.</p>
</td></tr><tr>
<td><code>[options.killInstanceAfterMillis]</code></td><td><code>Number</code></td><td><code>300000</code></td>
</tr>
<tr>
<td colspan="3"><p>If Puppeteer instance reaches the <code>options.retireInstanceAfterRequestCount</code> limit then
  it is considered retired and no more tabs will be opened. After the last tab is closed
  the whole browser is closed too. This parameter defines a time limit for inactivity
  after which the browser is closed even if there are pending tabs. See
  <code>killInstanceAfterMillis</code> parameter of <code>PuppeteerPool</code>.</p>
</td></tr><tr>
<td><code>[options.launchPuppeteerFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Overrides the default function to launch a new Puppeteer instance.
  See <code>launchPuppeteerFunction</code> parameter of <code>PuppeteerPool</code>.
  See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_crawler.js#L9">GitHub</a> for default behavior.</p>
</td></tr><tr>
<td><code>[options.launchPuppeteerOptions]</code></td><td><code><a href="#LaunchPuppeteerOptions">LaunchPuppeteerOptions</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Options used by <code>Apify.launchPuppeteer()</code> to start new Puppeteer instances.
  See <code>launchPuppeteerOptions</code> parameter of <code>PuppeteerPool</code>.</p>
</td></tr><tr>
<td><code>[options.autoscaledPoolOptions]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Custom options passed to the underlying <a href="autoscaledpool"><code>AutoscaledPool</code></a> instance constructor.
  Note that the <code>runTaskFunction</code>, <code>isTaskReadyFunction</code> and <code>isFinishedFunction</code> options
  are provided by <code>PuppeteerCrawler</code> and should not be overridden.</p>
</td></tr><tr>
<td><code>[options.minConcurrency]</code></td><td><code>Object</code></td><td><code>1</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding <code>AutoscaledPool</code> option.</p>
</td></tr><tr>
<td><code>[options.maxConcurrency]</code></td><td><code>Object</code></td><td><code>1000</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding <code>AutoscaledPool</code> option.</p>
</td></tr></tbody>
</table>
<a name="module_PuppeteerCrawler--PuppeteerCrawler+run"></a>

## `puppeteerCrawler.run()` ⇒ <code>Promise</code>
Runs the crawler. Returns promise that gets resolved once all the requests got processed.

<a name="module_PuppeteerCrawler--PuppeteerCrawler+abort"></a>

## `puppeteerCrawler.abort()` ⇒ <code>Promise</code>
Stops the crawler by preventing crawls of additional pages and terminating the running ones.

