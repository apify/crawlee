---
id: puppeteercrawler
title: PuppeteerCrawler
---

<a name="PuppeteerCrawler"></a>

Provides a simple framework for parallel crawling of web pages
using headless Chrome with <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a>.
The URLs to crawl are fed either from a static list of URLs
or from a dynamic queue of URLs enabling recursive crawling of websites.

Since `PuppeteerCrawler` uses headless Chrome to download web pages and extract data,
it is useful for crawling of websites that require to execute JavaScript.
If the target website doesn't need JavaScript, consider using [`CheerioCrawler`](cheeriocrawler),
which downloads the pages using raw HTTP requests and is about 10x faster.

The source URLs are represented using [`Request`](request) objects that are fed from
[`RequestList`](requestlist) or [`RequestQueue`](requestqueue) instances provided by the [`requestList`](#new_PuppeteerCrawler_new)
or [`requestQueue`](#new_PuppeteerCrawler_new) constructor options, respectively.

If both [`requestList`](#new_PuppeteerCrawler_new) and [`requestQueue`](#new_PuppeteerCrawler_new) are used,
the instance first processes URLs from the [`RequestList`](requestlist) and automatically enqueues all of them
to [`RequestQueue`](requestqueue) before it starts their processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes when there are no more [`Request`](request) objects to crawl.

`PuppeteerCrawler` opens a new Chrome page (i.e. tab) for each [`Request`](request) object to crawl
and then calls the function provided by user as the [`handlePageFunction()`](#new_PuppeteerCrawler_new) option.

New pages are only opened when there is enough free CPU and memory available,
using the functionality provided by the [`AutoscaledPool`](autoscaledpool) class.
All [`AutoscaledPool`](autoscaledpool) configuration options can be passed to the `autoscaledPoolOptions`
parameter of the `PuppeteerCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
[`AutoscaledPool`](autoscaledpool) options are available directly in the `PuppeteerCrawler` constructor.

Note that the pool of Puppeteer instances is internally managed by
the [`PuppeteerPool`](puppeteerpool) class. Many constructor options
such as `maxOpenPagesPerInstance` or `launchPuppeteerFunction` are passed directly
to [`PuppeteerPool`](puppeteerpool) constructor.

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
      succeeded: true
    });
  },
  handleFailedRequestFunction: async ({ request }) => {
    // This function is called when the crawling of a request failed too many times
    await Apify.pushData({
      url: request.url,
      succeeded: false,
      errors: request.errorMessages
    });
  }
});

await crawler.run();
```

- [PuppeteerCrawler](puppeteercrawler)
  - [`new PuppeteerCrawler(options)`](#new_PuppeteerCrawler_new)
  - [`.run()`](#PuppeteerCrawler+run) ⇒ `Promise`

<a name="new_PuppeteerCrawler_new"></a>

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
<td colspan="3"><p>All <code>PuppeteerCrawler</code> parameters are passed
  via an options object with the following keys:</p>
</td></tr><tr>
<td><code>options.handlePageFunction</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Function that is called to process each request.
  It is passed an object with the following fields:</p>
<pre><code>{
  request: Request,
  response: Response,
  page: Page,
  puppeteerPool: PuppeteerPool,
  autoscaledPool: AutoscaledPool
}
</code></pre><p>  <code>request</code> is an instance of the <a href="request"><code>Request</code></a> object with details about the URL to open, HTTP method etc.
  <code>response</code> is an instance of the <code>Puppeteer</code>
  <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a>
  <code>page</code> is an instance of the <code>Puppeteer</code>
  <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-response" target="_blank"><code>Response</code></a>,
  which is the main resource response as returned by <code>page.goto(request.url)</code>.
  <code>puppeteerPool</code> is an instance of the <a href="puppeteerpool"><code>PuppeteerPool</code></a> used by this <code>PuppeteerCrawler</code>.</p>
<p>  The function must return a promise, which is then awaited by the crawler.</p>
<p>  If the function throws an exception, the crawler will try to re-crawl the
  request later, up to <code>option.maxRequestRetries</code> times.
  If all the retries fail, the crawler calls the function
  provided to the <code>options.handleFailedRequestFunction</code> parameter.
  To make this work, you should <strong>always</strong>
  let your function throw exceptions rather than catch them.
  The exceptions are logged to the request using the <a href="request.pusherrormessage"><code>Request.pushErrorMessage</code></a> function.</p>
</td></tr><tr>
<td><code>options.requestList</code></td><td><code><a href="requestlist">RequestList</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Static list of URLs to be processed.
  Either <code>requestList</code> or <code>requestQueue</code> option must be provided (or both).</p>
</td></tr><tr>
<td><code>options.requestQueue</code></td><td><code><a href="requestqueue">RequestQueue</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
  Either <code>requestList</code> or <code>requestQueue</code> option must be provided (or both).</p>
</td></tr><tr>
<td><code>[options.handlePageTimeoutSecs]</code></td><td><code>Number</code></td><td><code>60</code></td>
</tr>
<tr>
<td colspan="3"><p>Timeout in which the function passed as <code>options.handlePageFunction</code> needs to finish, in seconds.</p>
</td></tr><tr>
<td><code>[options.gotoFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Overrides the function that opens the page in Puppeteer. The function should return the result of Puppeteer&#39;s
  <a href="https://pptr.dev/#?product=Puppeteer&show=api-pagegotourl-options" target="_blank">page.goto()</a> function,
  i.e. a <code>Promise</code> resolving to the <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-response" target="_blank">Response</a> object.</p>
<p>  This is useful if you need to extend the page load timeout or select different criteria
  to determine that the navigation succeeded.</p>
<p>  Note that a single page object is only used to process a single request and it is closed afterwards.</p>
<p>  By default, the function invokes Puppeteer&#39;s <code>Page.goto()</code> with a timeout of 60 seconds.
  For details, see source code on
  <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_crawler.js#L9" target="_blank">GitHub</a>.</p>
</td></tr><tr>
<td><code>[options.handleFailedRequestFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A function to handle requests that failed more than <code>option.maxRequestRetries</code> times.</p>
<p>  The function receives the following object as an argument:</p>
<pre><code>{
  request: Request,
  error: Error,
}
</code></pre><p>  Where the <a href="request"><code>Request</code></a> instance corresponds to the failed request, and the <code>Error</code> instance
  represents the last error thrown during processing of the request.</p>
<p>  See
  <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_crawler.js#L11" target="_blank">source code</a>
  for the default implementation of this function.</p>
</td></tr><tr>
<td><code>[options.maxRequestRetries]</code></td><td><code>Number</code></td><td><code>3</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how many times the request is retried if either <code>handlePageFunction()</code> or <code>gotoFunction()</code> fails.</p>
</td></tr><tr>
<td><code>[options.maxRequestsPerCrawl]</code></td><td><code>Number</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
  Always set this value in order to prevent infinite loops in misconfigured crawlers.
  Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.</p>
</td></tr><tr>
<td><code>[options.puppeteerPoolOptions]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Custom options passed to the underlying <a href="puppeteerpool"><code>PuppeteerPool</code></a> constructor.
  You can tweak those to fine-tune browser management.</p>
</td></tr><tr>
<td><code>[options.launchPuppeteerFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Overrides the default function to launch a new Puppeteer instance.
  Shortcut to the corresponding <a href="puppeteerpool"><code>PuppeteerPool</code></a> option.
  See source code on
  <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_pool.js#L28" target="_blank">GitHub</a>
  for default behavior.</p>
</td></tr><tr>
<td><code>[options.launchPuppeteerOptions]</code></td><td><code><a href="../typedefs/launchpuppeteeroptions">LaunchPuppeteerOptions</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Options used by <a href="apify#module_Apify.launchPuppeteer"><code>Apify.launchPuppeteer()</code></a> to start new Puppeteer instances.
  Shortcut to the corresponding <a href="puppeteerpool"><code>PuppeteerPool</code></a> option. See <a href="../typedefs/launchpuppeteeroptions"><code>LaunchPuppeteerOptions</code></a>.</p>
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
<td colspan="3"><p>Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding <a href="autoscaledpool"><code>AutoscaledPool</code></a> option.</p>
<p>  <em>WARNING:</em> If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash.
  If you&#39;re not sure, just keep the default value and the concurrency will scale up automatically.</p>
</td></tr><tr>
<td><code>[options.maxConcurrency]</code></td><td><code>Object</code></td><td><code>1000</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding <a href="autoscaledpool"><code>AutoscaledPool</code></a> option.</p>
</td></tr></tbody>
</table>
<a name="PuppeteerCrawler+run"></a>

## `puppeteerCrawler.run()` ⇒ `Promise`

Runs the crawler. Returns promise that gets resolved once all the requests got processed.
