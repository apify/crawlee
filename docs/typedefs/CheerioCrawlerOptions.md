---
id: cheeriocrawleroptions
title: CheerioCrawlerOptions
---

<a name="CheerioCrawlerOptions"></a>

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>handlePageFunction</code></td><td><code><a href="../typedefs/cheeriohandlepage">CheerioHandlePage</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>User-provided function that performs the logic of the crawler. It is called for each page
  loaded and parsed by the crawler.</p>
<p>  The function receives the following object as an argument:</p>
<pre><code class="language-javascript">{
  // The Cheerio object&#39;s function with the parsed HTML.
  $: Cheerio,

// The request body of the web page, whose type depends on the content type. body: String|Buffer,

// The parsed object from JSON for responses with the &quot;application/json&quot; content types. // For other content types it&#39;s null. json:
Object,

// Apify.Request object with details of the requested web page request: Request,

// Parsed Content-Type HTTP header: { type, encoding } contentType: Object,

// An instance of Node&#39;s http.IncomingMessage object, response: Object,

// Underlying AutoscaledPool instance used to manage the concurrency of crawler autoscaledPool: AutoscaledPool,

// Session object, useful to work around anti-scraping protections session: Session }</code></pre>

<p>  Type of <code>body</code> depends on the <code>Content-Type</code> header of the web page:</p>
<ul>
<li><p>String for <code>text/html</code>, <code>application/xhtml+xml</code>, <code>application/xml</code> MIME content types</p>
</li>
<li><p>Buffer for others MIME content types</p>
<p>Parsed <code>Content-Type</code> header using
<a href="https://www.npmjs.com/package/content-type" target="_blank">content-type package</a>
is stored in <code>contentType</code>.</p>
<p>Cheerio is available only for HTML and XML content types.</p>
<p>With the <a href="request"><code>Request</code></a> object representing the URL to crawl.</p>
<p>If the function returns, the returned promise is awaited by the crawler.</p>
<p>If the function throws an exception, the crawler will try to re-crawl the
request later, up to <code>option.maxRequestRetries</code> times.
If all the retries fail, the crawler calls the function
provided to the <code>handleFailedRequestFunction</code> parameter.
To make this work, you should <strong>always</strong>
let your function throw exceptions rather than catch them.
The exceptions are logged to the request using the
<a href="request#Request+pushErrorMessage"><code>request.pushErrorMessage</code></a> function.</p>
</li>
</ul>
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
<td><code>[requestOptions]</code></td><td><code><a href="../typedefs/requestasbrowseroptions">RequestAsBrowserOptions</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Represents the options passed to the <a href="requestasbrowser"><code>requestAsBrowser</code></a> function that makes the HTTP requests to fetch the web pages.
  Provided <code>requestOptions</code> are added to internal defaults that cannot be overridden to ensure
  the operation of <code>CheerioCrawler</code> and all its options. Headers will not be merged,
  use <a href="requestlist"><code>RequestList</code></a> and/or <a href="requestqueue"><code>RequestQueue</code></a> to initialize your <a href="request"><code>Request</code></a> with the
  correct headers or use <code>prepareRequestFunction</code> to modify your <a href="request"><code>Request</code></a> dynamically.
  If you need more granular control over your requests, use <a href="basiccrawler"><code>BasicCrawler</code></a>.</p>
<p>  The mandatory internal defaults that <strong>CANNOT BE OVERRIDDEN</strong> by <code>requestOptions</code>:</p>
<pre><code>  {
      url,       // Provided by RequestList and/or RequestQueue
      method,    // Provided by RequestList and/or RequestQueue
      headers,   // Provided by RequestList and/or RequestQueue
      payload,   // Provided by RequestList and/or RequestQueue
      strictSSL, // Use ignoreSslErrors
      proxy,     // Use useApifyProxy or proxyUrls
  }</code></pre></td></tr><tr>
<td><code>[prepareRequestFunction]</code></td><td><code><a href="../typedefs/preparerequest">PrepareRequest</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A function that executes before the HTTP request is made to the target resource.
  This function is suitable for setting dynamic properties such as cookies to the <a href="request"><code>Request</code></a>.</p>
<p>  The function receives the following object as an argument:</p>
<pre><code>{
  request: Request,
  session: Session
}</code></pre><p>  where the <a href="request"><code>Request</code></a> instance corresponds to the initialized request
  and the <a href="session"><code>Session</code></a> instance corresponds to used session.</p>
<p>  The function should modify the properties of the passed <a href="request"><code>Request</code></a> instance
  in place because there are already earlier references to it. Making a copy and returning it from
  this function is therefore not supported, because it would create inconsistencies where
  different parts of SDK would have access to a different <a href="request"><code>Request</code></a> instance.</p>
</td></tr><tr>
<td><code>[handlePageTimeoutSecs]</code></td><td><code>Number</code></td><td><code>60</code></td>
</tr>
<tr>
<td colspan="3"><p>Timeout in which the function passed as <code>handlePageFunction</code> needs to finish, given in seconds.</p>
</td></tr><tr>
<td><code>[requestTimeoutSecs]</code></td><td><code>Number</code></td><td><code>30</code></td>
</tr>
<tr>
<td colspan="3"><p>Timeout in which the HTTP request to the resource needs to finish, given in seconds.</p>
</td></tr><tr>
<td><code>[ignoreSslErrors]</code></td><td><code>Boolean</code></td><td><code>true</code></td>
</tr>
<tr>
<td colspan="3"><p>If set to true, SSL certificate errors will be ignored.</p>
</td></tr><tr>
<td><code>[useApifyProxy]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If set to <code>true</code>, <code>CheerioCrawler</code> will be configured to use
  <a href="https://my.apify.com/proxy" target="_blank">Apify Proxy</a> for all connections.
  For more information, see the <a href="https://docs.apify.com/proxy" target="_blank">documentation</a></p>
</td></tr><tr>
<td><code>[apifyProxyGroups]</code></td><td><code>Array<String></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>An array of proxy groups to be used
  by the <a href="https://docs.apify.com/proxy" target="_blank">Apify Proxy</a>.
  Only applied if the <code>useApifyProxy</code> option is <code>true</code>.</p>
</td></tr><tr>
<td><code>[apifyProxySession]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Apify Proxy session identifier to be used with requests made by <code>CheerioCrawler</code>.
  All HTTP requests going through the proxy with the same session identifier
  will use the same target proxy server (i.e. the same IP address).
  The identifier can only contain the following characters: <code>0-9</code>, <code>a-z</code>, <code>A-Z</code>, <code>&quot;.&quot;</code>, <code>&quot;_&quot;</code> and <code>&quot;~&quot;</code>.
  Only applied if the <code>useApifyProxy</code> option is <code>true</code>.</p>
</td></tr><tr>
<td><code>[proxyUrls]</code></td><td><code>Array<String></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>An array of custom proxy URLs to be used by the <code>CheerioCrawler</code> instance.
  The provided custom proxies&#39; order will be randomized and the resulting list rotated.
  Custom proxies are not compatible with Apify Proxy and an attempt to use both
  configuration options will cause an error to be thrown on startup.</p>
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
<p>  See <a href="https://github.com/apifytech/apify-js/blob/master/src/crawlers/cheerio_crawler.js#L13">source code</a>
  for the default implementation of this function.</p>
</td></tr><tr>
<td><code>[additionalMimeTypes]</code></td><td><code>Array<String></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>An array of <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Complete_list_of_MIME_types"
  target="_blank">MIME types</a> you want the crawler to load and process.
  By default, only <code>text/html</code> and <code>application/xhtml+xml</code> MIME types are supported.</p>
</td></tr><tr>
<td><code>[maxRequestRetries]</code></td><td><code>Number</code></td><td><code>3</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how many times the request is retried if either <code>requestFunction</code> or <code>handlePageFunction</code> fails.</p>
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
  Note that the <code>runTaskFunction</code>, <code>isTaskReadyFunction</code> and <code>isFinishedFunction</code> options
  are provided by <code>CheerioCrawler</code> and cannot be overridden. Reasonable <a href="snapshotter"><code>Snapshotter</code></a>
  and <a href="systemstatus"><code>SystemStatus</code></a> defaults are provided to account for the fact that <code>cheerio</code>
  parses HTML synchronously and therefore blocks the event loop.</p>
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
<td colspan="3"><p>If set to true Crawler will automatically use Session Pool. It will automatically retire sessions on 403, 401 and 429 status codes.
  It also marks Session as bad after a request timeout.</p>
</td></tr><tr>
<td><code>[sessionPoolOptions]</code></td><td><code><a href="../typedefs/sessionpooloptions">SessionPoolOptions</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Custom options passed to the underlying <a href="sessionpool"><code>SessionPool</code></a> constructor.</p>
</td></tr><tr>
<td><code>[persistCookiesPerSession]</code></td><td><code>Boolean</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Automatically saves cookies to Session. Works only if Session Pool is used.</p>
<p>  It parses cookie from response &quot;set-cookie&quot; header saves or updates cookies for session and once the session is used for next request.
  It passes the &quot;Cookie&quot; header to the request with the session cookies.</p>
</td></tr></tbody>
</table>
