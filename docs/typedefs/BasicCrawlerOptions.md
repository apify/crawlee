---
id: basiccrawleroptions
title: BasicCrawlerOptions
---

<a name="BasicCrawlerOptions"></a>

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>handleRequestFunction</code></td><td><code><a href="../typedefs/handlerequest">HandleRequest</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>User-provided function that performs the logic of the crawler. It is called for each URL to crawl.</p>
<p>  The function receives the following object as an argument:</p>
<pre><code>{
  request: Request,
  autoscaledPool: AutoscaledPool
}</code></pre><p>  where the <a href="request"><code>Request</code></a> instance represents the URL to crawl.</p>
<p>  The function must return a promise, which is then awaited by the crawler.</p>
<p>  If the function throws an exception, the crawler will try to re-crawl the
  request later, up to <code>option.maxRequestRetries</code> times.
  If all the retries fail, the crawler calls the function
  provided to the <code>handleFailedRequestFunction</code> parameter.
  To make this work, you should <strong>always</strong>
  let your function throw exceptions rather than catch them.
  The exceptions are logged to the request using the
  <a href="request#Request+pushErrorMessage"><code>request.pushErrorMessage</code></a> function.</p>
</td></tr><tr>
<td><code>[requestList]</code></td><td><code><a href="requestlist">RequestList</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Static list of URLs to be processed.
  Either <code>requestList</code> or <code>requestQueue</code> option must be provided (or both).</p>
</td></tr><tr>
<td><code>[requestQueue]</code></td><td><code><a href="requestqueue">RequestQueue</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
  Either <code>requestList</code> or <code>requestQueue</code> option must be provided (or both).</p>
</td></tr><tr>
<td><code>[handleRequestTimeoutSecs]</code></td><td><code>number</code></td><td><code>60</code></td>
</tr>
<tr>
<td colspan="3"><p>Timeout in which the function passed as <code>handleRequestFunction</code> needs to finish, in seconds.</p>
</td></tr><tr>
<td><code>[handleFailedRequestFunction]</code></td><td><code><a href="../typedefs/handlefailedrequest">HandleFailedRequest</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A function to handle requests that failed more than <code>option.maxRequestRetries</code> times.</p>
<p>  The function receives the following object as an argument:</p>
<pre><code>{
  request: Request,
  error: Error,
}</code></pre><p>  where the <a href="request"><code>Request</code></a> instance corresponds to the failed request, and the <code>Error</code> instance
  represents the last error thrown during processing of the request.</p>
<p>  See
  <a href="https://github.com/apifytech/apify-js/blob/master/src/crawlers/basic_crawler.js#L11" target="_blank">source code</a>
  for the default implementation of this function.</p>
</td></tr><tr>
<td><code>[maxRequestRetries]</code></td><td><code>Number</code></td><td><code>3</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how many times the request is retried if <a href="#new_BasicCrawler_new"><code>handleRequestFunction()</code></a> fails.</p>
</td></tr><tr>
<td><code>[maxRequestsPerCrawl]</code></td><td><code>Number</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
  Always set this value in order to prevent infinite loops in misconfigured crawlers.
  Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.</p>
</td></tr><tr>
<td><code>[autoscaledPoolOptions]</code></td><td><code><a href="../typedefs/autoscaledpooloptions">AutoscaledPoolOptions</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Custom options passed to the underlying <a href="autoscaledpool"><code>AutoscaledPool</code></a> constructor.
  Note that the <code>runTaskFunction</code> and <code>isTaskReadyFunction</code> options
  are provided by <code>BasicCrawler</code> and cannot be overridden.
  However, you can provide a custom implementation of <code>isFinishedFunction</code>.</p>
</td></tr><tr>
<td><code>[minConcurrency]</code></td><td><code>Number</code></td><td><code>1</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding <a href="autoscaledpool"><code>AutoscaledPool</code></a> option.</p>
<p>  <em>WARNING:</em> If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash.
  If you&#39;re not sure, just keep the default value and the concurrency will scale up automatically.</p>
</td></tr><tr>
<td><code>[maxConcurrency]</code></td><td><code>Number</code></td><td><code>1000</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding <a href="autoscaledpool"><code>AutoscaledPool</code></a> option.</p>
</td></tr><tr>
<td><code>[useSessionPool]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If set to true. Basic crawler will initialize the  <a href="sessionpool"><code>SessionPool</code></a> with the corresponding <code>sessionPoolOptions</code>.
  The session instance will be than available in the <code>handleRequestFunction</code>.</p>
</td></tr><tr>
<td><code>[sessionPoolOptions]</code></td><td><code><a href="../typedefs/sessionpooloptions">SessionPoolOptions</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>The configuration options for {SessionPool} to use.</p>
</td></tr></tbody>
</table>
