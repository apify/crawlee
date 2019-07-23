---
id: cheeriocrawler
title: CheerioCrawler
---

<a name="CheerioCrawler"></a>

Provides a framework for the parallel crawling of web pages using plain HTTP requests and
<a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a> HTML parser.
The URLs to crawl are fed either from a static list of URLs
or from a dynamic queue of URLs enabling recursive crawling of websites.

Since `CheerioCrawler` uses raw HTTP requests to download web pages,
it is very fast and efficient on data bandwidth. However, if the target website requires JavaScript
to display the content, you might need to use [`PuppeteerCrawler`](puppeteercrawler) instead,
because it loads the pages using full-featured headless Chrome browser.

`CheerioCrawler` downloads each URL using a plain HTTP request,
parses the HTML content using <a href="https://www.npmjs.com/package/cheerio" target="_blank">Cheerio</a>
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
<a href="https://www.npmjs.com/package/request" target="_blank">request</a> NPM package.
You can use the `requestOptions` parameter to pass additional options to `request`.

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
    { url: "http://www.example.com/page-1" },
    { url: "http://www.example.com/page-2" }
  ]
});
await requestList.initialize();

// Crawl the URLs
const crawler = new Apify.CheerioCrawler({
  requestList,
  handlePageFunction: async ({ request, response, html, $ }) => {
    const data = [];

    // Do some data extraction from the page with Cheerio.
    $(".some-collection").each((index, el) => {
      data.push({
        title: $(el)
          .find(".some-title")
          .text()
      });
    });

    // Save the data to dataset.
    await Apify.pushData({
      url: request.url,
      html,
      data
    });
  }
});

await crawler.run();
```

- [CheerioCrawler](cheeriocrawler)
  - [`new CheerioCrawler(options)`](#new_CheerioCrawler_new)
  - [`.run()`](#CheerioCrawler+run) ⇒ `Promise`

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
<pre><code>{
  $: Cheerio, // the Cheerio object with parsed HTML
  html: String // the raw HTML of the page, lazy loaded only when used
  request: Request,
  response: Object // An instance of Node&#39;s http.IncomingMessage object,
  autoscaledPool: AutoscaledPool
}</code></pre><p>  With the <a href="request"><code>Request</code></a> object representing the URL to crawl.</p>
<p>  If the function returns a promise, it is awaited by the crawler.</p>
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
<td><code>[options.requestOptions]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Represents the options passed to
  <a href="https://www.npmjs.com/package/request" target="_blank">request</a> to make the HTTP call.
  Provided <code>requestOptions</code> are added to internal defaults that cannot be overridden to ensure
  the operation of <code>CheerioCrawler</code> and all its options. Headers will not be merged,
  use <a href="requestlist"><code>RequestList</code></a> and/or <a href="requestqueue"><code>RequestQueue</code></a> to initialize your <a href="request"><code>Request</code></a> with the
  correct headers or use <code>options.prepareRequestFunction</code> to modify your <a href="request"><code>Request</code></a> dynamically.
  If you need more granular control over your requests, use <a href="basiccrawler"><code>BasicCrawler</code></a>.</p>
<p>  The mandatory internal defaults that <strong>CANNOT BE OVERRIDDEN</strong> by <code>requestOptions</code>:</p>
<pre><code>  {
      url,       // Provided by RequestList and/or RequestQueue
      method,    // Provided by RequestList and/or RequestQueue
      headers,   // Provided by RequestList and/or RequestQueue
      payload,   // Provided by RequestList and/or RequestQueue
      strictSSL, // Use options.ignoreSslErrors
      proxy,     // Use options.useApifyProxy or options.proxyUrls
  }</code></pre></td></tr><tr>
<td><code>[options.prepareRequestFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A function that executes before the HTTP request is made to the target resource.
  This function is suitable for setting dynamic properties such as cookies to the <a href="request"><code>Request</code></a>.</p>
<p>  The function receives the following object as an argument:</p>
<pre><code>{
  request: Request
}</code></pre><p>  where the <a href="request"><code>Request</code></a> instance corresponds to the initialized request.</p>
<p>  The function should modify the properties of the passed <a href="request"><code>Request</code></a> instance
  in place because there are already earlier references to it. Making a copy and returning it from
  this function is therefore not supported, because it would create inconsistencies where
  different parts of SDK would have access to a different <a href="request"><code>Request</code></a> instance.</p>
</td></tr><tr>
<td><code>[options.handlePageTimeoutSecs]</code></td><td><code>Number</code></td><td><code>60</code></td>
</tr>
<tr>
<td colspan="3"><p>Timeout in which the function passed as <code>options.handlePageFunction</code> needs to finish, given in seconds.</p>
</td></tr><tr>
<td><code>[options.requestTimeoutSecs]</code></td><td><code>Number</code></td><td><code>30</code></td>
</tr>
<tr>
<td colspan="3"><p>Timeout in which the HTTP request to the resource needs to finish, given in seconds.</p>
</td></tr><tr>
<td><code>[options.ignoreSslErrors]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If set to true, SSL certificate errors will be ignored. This is dependent on using the default
  request function. If using a custom <code>options.requestFunction</code>, user needs to implement this functionality.</p>
</td></tr><tr>
<td><code>[options.useApifyProxy]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If set to <code>true</code>, <code>CheerioCrawler</code> will be configured to use
  <a href="https://my.apify.com/proxy" target="_blank">Apify Proxy</a> for all connections.
  For more information, see the <a href="https://apify.com/docs/proxy" target="_blank">documentation</a></p>
</td></tr><tr>
<td><code>[options.apifyProxyGroups]</code></td><td><code>Array<String></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>An array of proxy groups to be used
  by the <a href="https://apify.com/docs/proxy" target="_blank">Apify Proxy</a>.
  Only applied if the <code>useApifyProxy</code> option is <code>true</code>.</p>
</td></tr><tr>
<td><code>[options.apifyProxySession]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Apify Proxy session identifier to be used with requests made by <code>CheerioCrawler</code>.
  All HTTP requests going through the proxy with the same session identifier
  will use the same target proxy server (i.e. the same IP address).
  The identifier can only contain the following characters: <code>0-9</code>, <code>a-z</code>, <code>A-Z</code>, <code>&quot;.&quot;</code>, <code>&quot;_&quot;</code> and <code>&quot;~&quot;</code>.
  Only applied if the <code>useApifyProxy</code> option is <code>true</code>.</p>
</td></tr><tr>
<td><code>[options.proxyUrls]</code></td><td><code>Array<String></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>An array of custom proxy URLs to be used by the <code>CheerioCrawler</code> instance.
  The provided custom proxies&#39; order will be randomized and the resulting list rotated.
  Custom proxies are not compatible with Apify Proxy and an attempt to use both
  configuration options will cause an error to be thrown on startup.</p>
</td></tr><tr>
<td><code>[options.handleFailedRequestFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A function to handle requests that failed more than <code>option.maxRequestRetries</code> times.</p>
<p>  The function receives the following object as an argument:</p>
<pre><code>{
  request: Request,
  error: Error,
}</code></pre><p>  where the <a href="request"><code>Request</code></a> instance corresponds to the failed request, and the <code>Error</code> instance
  represents the last error thrown during processing of the request.</p>
<p>  See <a href="https://github.com/apifytech/apify-js/blob/master/src/cheerio_crawler.js#L13">source code</a>
  for the default implementation of this function.</p>
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
  are provided by <code>CheerioCrawler</code> and cannot be overridden. Reasonable <a href="snapshotter"><code>Snapshotter</code></a>
  and <a href="systemstatus"><code>SystemStatus</code></a> defaults are provided to account for the fact that <code>cheerio</code>
  parses HTML synchronously and therefore blocks the event loop.</p>
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
<a name="CheerioCrawler+run"></a>

## `cheerioCrawler.run()` ⇒ `Promise`

Runs the crawler. Returns promise that gets resolved once all the requests got processed.
