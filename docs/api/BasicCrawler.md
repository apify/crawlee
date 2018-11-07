---
id: basiccrawler
title: BasicCrawler
---
<a name="BasicCrawler"></a>

Provides a simple framework for parallel crawling of web pages,
whose URLs are fed either from a static list
or from a dynamic queue of URLs.

`BasicCrawler` invokes the user-provided [`handleRequestFunction()`](#new_BasicCrawler_new)
for each [`Request`](request) object, which represents a single URL to crawl.
The [`Request`](request) objects are fed from the [`RequestList`](requestlist) or the [`RequestQueue`](requestqueue)
instances provided by the [`requestList`](#new_BasicCrawler_new) or [`requestQueue`](#new_BasicCrawler_new)
constructor options, respectively.

If both [`requestList`](#new_BasicCrawler_new) and [`requestQueue`](#new_BasicCrawler_new) options are used,
the instance first processes URLs from the [`RequestList`](requestlist) and automatically enqueues all of them
to [`RequestQueue`](requestqueue) before it starts their processing. This ensures that a single URL is not crawled multiple times.

The crawler finishes if there are no more [`Request`](request) objects to crawl.

New requests are only dispatched when there is enough free CPU and memory available,
using the functionality provided by the [`AutoscaledPool`](autoscaledpool) class.
All [`AutoscaledPool`](autoscaledpool) configuration options can be passed to the `autoscaledPoolOptions`
parameter of the `BasicCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
[`AutoscaledPool`](autoscaledpool) options are available directly in the `BasicCrawler` constructor.

**Example usage:**

```javascript
const rp = require('request-promise-native');

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


* [BasicCrawler](basiccrawler)
    * [`new BasicCrawler(options)`](#new_BasicCrawler_new)
    * [`.run()`](#BasicCrawler+run) ⇒ <code>Promise</code>
    * [`.abort()`](#BasicCrawler+abort) ⇒ <code>Promise</code>

<a name="new_BasicCrawler_new"></a>

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
<td colspan="3"><p>All <code>BasicCrawler</code> parameters are passed
  via an options object with the following keys:</p>
</td></tr><tr>
<td><code>options.handleRequestFunction</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>User-provided function that performs the logic of the crawler. It is called for each URL to crawl.</p>
<p>  The function receives the following object as an argument:</p>
<pre><code>  {
      request: Request
  }
</code></pre><p>  With the <a href="request"><code>Request</code></a> object representing the URL to crawl.
  The function must return a promise.</p>
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
<td><code>[options.handleFailedRequestFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Function that handles requests that failed more then <code>options.maxRequestRetries</code> times.
  See source code on
  <a href="https://github.com/apifytech/apify-js/blob/master/src/basic_crawler.js#L11" target="_blank">GitHub</a>
  for default behavior.</p>
</td></tr><tr>
<td><code>[options.maxRequestRetries]</code></td><td><code>Number</code></td><td><code>3</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how many times the request is retried if <a href="#new_BasicCrawler_new"><code>handleRequestFunction()</code></a> fails.</p>
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
  are provided by <code>BasicCrawler</code> and cannot be overridden.</p>
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
<a name="BasicCrawler+run"></a>

## `basicCrawler.run()` ⇒ <code>Promise</code>
Runs the crawler. Returns a promise that gets resolved once all the requests are processed.

<a name="BasicCrawler+abort"></a>

## `basicCrawler.abort()` ⇒ <code>Promise</code>
Aborts the crawler by preventing additional requests and terminating the running ones.

