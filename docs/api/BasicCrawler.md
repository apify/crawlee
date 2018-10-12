---
id: basiccrawler
title: BasicCrawler
---
<a name="exp_module_BasicCrawler--BasicCrawler"></a>

Provides a simple framework for the parallel crawling of web pages,
whose URLs are fed either from a static list
or from a dynamic queue of URLs.

`BasicCrawler` invokes the user-provided `handleRequestFunction` for each [``Request``](Request)
object, which corresponds to a single URL to crawl.
The `Request` objects are fed from the [``RequestList``](RequestList) or [``RequestQueue``](requestqueue)
instances provided by the `requestList` or `requestQueue` constructor options, respectively.

If both `requestList` and `requestQueue` is used, the instance first
processes URLs from the `RequestList` and automatically enqueues all of them to `RequestQueue` before it starts
their processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes if there are no more `Request` objects to crawl.

New requests are only launched if there is enough free CPU and memory available,
using the functionality provided by the [``AutoscaledPool``](AutoscaledPool) class.
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

* [BasicCrawler](#exp_module_BasicCrawler--BasicCrawler) ⏏
    * [`new BasicCrawler(options)`](#new_module_BasicCrawler--BasicCrawler_new)
    * [`.run()`](basiccrawler--BasicCrawler+run) ⇒ <code>Promise</code>
    * [`.abort()`](basiccrawler--BasicCrawler+abort) ⇒ <code>Promise</code>

<a name="new_module_BasicCrawler--BasicCrawler_new"></a>

## `new BasicCrawler(options)`
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
<td><code>options.handleRequestFunction</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>User-provided function that performs the logic of the crawler. It is called for each URL to crawl.</p>
<p>  The function that receives an object as argument, with the following field:</p>
  <ul>
    <li><code>request</code>: the <a href="Request"><code>Request</code></a> object representing the URL to crawl</li>
  </ul>

<p>  The function must return a promise.</p>
</td></tr><tr>
<td><code>options.requestList</code></td><td><code>RequestList</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Static list of URLs to be processed.
  Either <code>RequestList</code> or <code>RequestQueue</code> must be provided.</p>
</td></tr><tr>
<td><code>options.requestQueue</code></td><td><code><a href="requestqueue">RequestQueue</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
  Either RequestList or RequestQueue must be provided.</p>
</td></tr><tr>
<td><code>[options.handleFailedRequestFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Function that handles requests that failed more then <code>option.maxRequestRetries</code> times.
  See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/basic_crawler.js#L11">GitHub</a> for default behavior.</p>
</td></tr><tr>
<td><code>[options.maxRequestRetries]</code></td><td><code>Number</code></td><td><code>3</code></td>
</tr>
<tr>
<td colspan="3"><p>How many times the request is retried if <code>handleRequestFunction</code> failed.</p>
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
<td colspan="3"><p>Custom options passed to the underlying <a href="AutoscaledPool"><code>AutoscaledPool</code></a> instance constructor.
  Note that the <code>runTaskFunction</code>, <code>isTaskReadyFunction</code> and <code>isFinishedFunction</code> options
  are provided by <code>BasicCrawler</code> and cannot be overridden.</p>
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
<a name="module_BasicCrawler--BasicCrawler+run"></a>

## `basicCrawler.run()` ⇒ <code>Promise</code>
Runs the crawler. Returns a promise that gets resolved once all the requests are processed.

<a name="module_BasicCrawler--BasicCrawler+abort"></a>

## `basicCrawler.abort()` ⇒ <code>Promise</code>
Aborts the crawler by preventing additional requests and terminating the running ones.

