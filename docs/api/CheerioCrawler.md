---
id: cheeriocrawler
title: CheerioCrawler
---
<a name="CheerioCrawler"></a>

Provides a framework for the parallel crawling of web pages using plain HTTP requests and
<a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a> HTML parser.

`CheerioCrawler` downloads each URL using a plain HTTP request,
parses the HTML content using <a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a>
and then invokes the user-provided [`handlePageFunction()`](#new_CheerioCrawler_new) to extract page data
using a <a href="https://jquery.com/" target="_blank">jQuery</a>-like interface to the parsed HTML DOM.

The source URLs are represented using [`Request`](request) objects that are fed from
[`RequestList`](requestlist) or [`RequestQueue`](requestqueue) instances provided by the [`requestList`](#new_CheerioCrawler_new)
or [`requestQueue`](#new_CheerioCrawler_new) constructor options, respectively.

If both [`requestList`](#new_CheerioCrawler_new) and [`requestQueue`](#new_CheerioCrawler_new) are used,
the instance first processes URLs from the [`RequestList`](requestlist) and automatically enqueues all of them
to [`RequestQueue`](requestqueue) before it starts their processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes when there are no more [`Request`](request) objects to crawl.

By default, `CheerioCrawler` downloads HTML using the
<a href="https://www.npmjs.com/package/request-promise" target="_blank">request-promise</a> NPM package.
You can override this behavior by setting the `requestFunction` option.

New requests are only dispatched when there is enough free CPU and memory available,
using the functionality provided by the [`AutoscaledPool`](autoscaledpool) class.
All [`AutoscaledPool`](autoscaledpool) configuration options can be passed to the `autoscaledPoolOptions`
parameter of the `CheerioCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
[`AutoscaledPool`](autoscaledpool) options are available directly in the `CheerioCrawler` constructor.

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


* [CheerioCrawler](cheeriocrawler)
    * [`new CheerioCrawler(options)`](#new_CheerioCrawler_new)
    * [`.run()`](#CheerioCrawler+run) ⇒ <code>Promise</code>
    * [`.abort()`](#CheerioCrawler+abort) ⇒ <code>Promise</code>

<a name="new_CheerioCrawler_new"></a>

## `new CheerioCrawler(options)`
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
<td colspan="3"><p>All <code>CheerioCrawler</code> parameters are passed
  via an options object with the following keys:</p>
</td></tr><tr>
<td><code>options.handlePageFunction</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>User-provided function that performs the logic of the crawler. It is called for each page
  loaded and parsed by the crawler.</p>
<p>  The function receives the following object as an argument:</p>
<pre><code>  {
      $: Cheerio, // the Cheerio object with parsed HTML
      html: String // the raw HTML of the page
      request: Request
  }
</code></pre><p>  With the <a href="request"><code>Request</code></a> object representing the URL to crawl.
  If the function returns a promise, it is awaited.</p>
</td></tr><tr>
<td><code>options.requestList</code></td><td><code><a href="requestlist">RequestList</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Static list of URLs to be processed.
  Either <a href="requestlist"><code>RequestList</code></a> or <a href="requestqueue"><code>RequestQueue</code></a> must be provided.</p>
</td></tr><tr>
<td><code>options.requestQueue</code></td><td><code><a href="requestqueue">RequestQueue</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
  Either <a href="requestlist"><code>RequestList</code></a> or <a href="requestqueue"><code>RequestQueue</code></a> must be provided.</p>
</td></tr><tr>
<td><code>[options.requestFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Overrides the function that performs the HTTP request to get the raw HTML needed for Cheerio.
  See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/cheerio_crawler.js#L264">GitHub</a> for default behavior.</p>
</td></tr><tr>
<td><code>[options.handlePageTimeoutSecs]</code></td><td><code>Number</code></td><td><code>300</code></td>
</tr>
<tr>
<td colspan="3"><p>Timeout in which the function passed as <code>options.handlePageFunction</code> needs to finish, given in seconds.</p>
</td></tr><tr>
<td><code>[options.requestTimeoutSecs]</code></td><td><code>Number</code></td><td><code>30</code></td>
</tr>
<tr>
<td colspan="3"><p>Timeout in which the function passed as <code>options.requestFunction</code> needs to finish, given in seconds.</p>
</td></tr><tr>
<td><code>[options.ignoreSslErrors]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If set to true, SSL certificate errors will be ignored. This is dependent on using the default
  request function. If using a custom <code>options.requestFunction</code>, user needs to implement this functionality.</p>
</td></tr><tr>
<td><code>[options.handleFailedRequestFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Function that handles requests that failed more then <code>option.maxRequestRetries</code> times.
  See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/cheerio_crawler.js#L13">GitHub</a> for default behavior.</p>
</td></tr><tr>
<td><code>[options.maxRequestRetries]</code></td><td><code>Number</code></td><td><code>3</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how many times the request is retried if either <code>requestFunction</code> or <code>handlePageFunction</code> fails.</p>
</td></tr><tr>
<td><code>[options.maxRequestsPerCrawl]</code></td><td><code>Number</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
  Always set this value in order to prevent infinite loops in misconfigured crawlers.
  Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.</p>
</td></tr><tr>
<td><code>[options.autoscaledPoolOptions]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Custom options passed to the underlying <a href="autoscaledpool"><code>AutoscaledPool</code></a> constructor.
  Note that the <code>runTaskFunction</code>, <code>isTaskReadyFunction</code> and <code>isFinishedFunction</code> options
  are provided by <code>CheerioCrawler</code> and cannot be overridden.</p>
</td></tr><tr>
<td><code>[options.minConcurrency]</code></td><td><code>Object</code></td><td><code>1</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding <a href="autoscaledpool"><code>AutoscaledPool</code></a> option.</p>
</td></tr><tr>
<td><code>[options.maxConcurrency]</code></td><td><code>Object</code></td><td><code>1000</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding <a href="autoscaledpool"><code>AutoscaledPool</code></a> option.</p>
</td></tr></tbody>
</table>
<a name="CheerioCrawler+run"></a>

## `cheerioCrawler.run()` ⇒ <code>Promise</code>
Runs the crawler. Returns promise that gets resolved once all the requests got processed.

<a name="CheerioCrawler+abort"></a>

## `cheerioCrawler.abort()` ⇒ <code>Promise</code>
Aborts the crawler by preventing crawls of additional pages and terminating the running ones.

