---
id: puppeteercrawleroptions
title: PuppeteerCrawlerOptions
---

<a name="PuppeteerCrawlerOptions"></a>

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>handlePageFunction</code></td><td><code><a href="../typedefs/puppeteerhandlepage">PuppeteerHandlePage</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Function that is called to process each request.
  It is passed an object with the following fields:</p>
<pre><code>{
  request: Request,
  response: Response,
  page: Page,
  puppeteerPool: PuppeteerPool,
  autoscaledPool: AutoscaledPool,
  session: Session,
}</code></pre><p>  <code>request</code> is an instance of the <a href="request"><code>Request</code></a> object with details about the URL to open, HTTP method etc.
  <code>page</code> is an instance of the <code>Puppeteer</code>
  <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a>
  <code>response</code> is an instance of the <code>Puppeteer</code>
  <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-response" target="_blank"><code>Response</code></a>,
  which is the main resource response as returned by <code>page.goto(request.url)</code>.
  <code>puppeteerPool</code> is an instance of the <a href="puppeteerpool"><code>PuppeteerPool</code></a> used by this <code>PuppeteerCrawler</code>.</p>
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
<td><code>[handlePageTimeoutSecs]</code></td><td><code>Number</code></td><td><code>60</code></td>
</tr>
<tr>
<td colspan="3"><p>Timeout in which the function passed as <code>handlePageFunction</code> needs to finish, in seconds.</p>
</td></tr><tr>
<td><code>[gotoFunction]</code></td><td><code><a href="../typedefs/puppeteergoto">PuppeteerGoto</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Overrides the function that opens the page in Puppeteer. The function should return the result of Puppeteer&#39;s
  <a href="https://pptr.dev/#?product=Puppeteer&show=api-pagegotourl-options" target="_blank">page.goto()</a> function,
  i.e. a <code>Promise</code> resolving to the <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-response" target="_blank">Response</a> object.</p>
<p>  This is useful if you need to extend the page load timeout or select different criteria
  to determine that the navigation succeeded.</p>
<p>  Note that a single page object is only used to process a single request and it is closed afterwards.</p>
<p>  By default, the function invokes <a href="puppeteer#puppeteer.gotoExtended"><code>Apify.utils.puppeteer.gotoExtended()</code></a> with a timeout of 60 seconds.
  For details, see source code on
  <a href="https://github.com/apifytech/apify-js/blob/master/src/crawlers/puppeteer_crawler.js#L292" target="_blank">GitHub</a>.</p>
</td></tr><tr>
<td><code>[gotoTimeoutSecs]</code></td><td><code>Number</code></td><td><code>60</code></td>
</tr>
<tr>
<td colspan="3"><p>Timeout in which page navigation needs to finish, in seconds. When <code>gotoFunction()</code> is used and thus the default
  function is overridden, this timeout will not be used and needs to be configured in the new <code>gotoFunction()</code>.</p>
</td></tr><tr>
<td><code>[handleFailedRequestFunction]</code></td><td><code><a href="../typedefs/handlefailedrequest">HandleFailedRequest</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A function to handle requests that failed more than <code>option.maxRequestRetries</code> times.</p>
<p>  The function receives the following object as an argument:</p>
<pre><code>{
  request: Request,
  error: Error,
}</code></pre><p>  Where the <a href="request"><code>Request</code></a> instance corresponds to the failed request, and the <code>Error</code> instance
  represents the last error thrown during processing of the request.</p>
<p>  See
  <a href="https://github.com/apifytech/apify-js/blob/master/src/crawlers/puppeteer_crawler.js#L301" target="_blank">source code</a>
  for the default implementation of this function.</p>
</td></tr><tr>
<td><code>[maxRequestRetries]</code></td><td><code>Number</code></td><td><code>3</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how many times the request is retried if either <code>handlePageFunction()</code> or <code>gotoFunction()</code> fails.</p>
</td></tr><tr>
<td><code>[maxRequestsPerCrawl]</code></td><td><code>Number</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
  Always set this value in order to prevent infinite loops in misconfigured crawlers.
  Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.</p>
</td></tr><tr>
<td><code>[puppeteerPoolOptions]</code></td><td><code><a href="../typedefs/puppeteerpooloptions">PuppeteerPoolOptions</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Custom options passed to the underlying <a href="puppeteerpool"><code>PuppeteerPool</code></a> constructor.
  You can tweak those to fine-tune browser management.</p>
</td></tr><tr>
<td><code>[launchPuppeteerFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Overrides the default function to launch a new Puppeteer instance.
  Shortcut to the corresponding <a href="puppeteerpool"><code>PuppeteerPool</code></a> option.
  See source code on
  <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_pool.js#L28" target="_blank">GitHub</a>
  for default behavior.</p>
</td></tr><tr>
<td><code>[launchPuppeteerOptions]</code></td><td><code><a href="../typedefs/launchpuppeteeroptions">LaunchPuppeteerOptions</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Options used by <a href="apify#module_Apify.launchPuppeteer"><code>Apify.launchPuppeteer()</code></a> to start new Puppeteer instances.
  Shortcut to the corresponding <a href="puppeteerpool"><code>PuppeteerPool</code></a> option. See <a href="../typedefs/launchpuppeteeroptions"><code>LaunchPuppeteerOptions</code></a>.</p>
</td></tr><tr>
<td><code>[autoscaledPoolOptions]</code></td><td><code><a href="../typedefs/autoscaledpooloptions">AutoscaledPoolOptions</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Custom options passed to the underlying <a href="autoscaledpool"><code>AutoscaledPool</code></a> instance constructor.
  Note that the <code>runTaskFunction</code>, <code>isTaskReadyFunction</code> and <code>isFinishedFunction</code> options
  are provided by <code>PuppeteerCrawler</code> and should not be overridden.</p>
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
</td></tr></tbody>
</table>
