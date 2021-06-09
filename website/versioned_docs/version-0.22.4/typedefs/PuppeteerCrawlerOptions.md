---
id: version-0.22.4-puppeteer-crawler-options
title: PuppeteerCrawlerOptions
original_id: puppeteer-crawler-options
---

<a name="puppeteercrawleroptions"></a>

## Properties

### `handlePageFunction`

**Type**: [`PuppeteerHandlePage`](../typedefs/puppeteer-handle-page)

Function that is called to process each request. It is passed an object with the following fields:

```
{
  request: Request,
  response: Response,
  page: Page,
  puppeteerPool: PuppeteerPool,
  autoscaledPool: AutoscaledPool,
  session: Session,
  proxyInfo: ProxyInfo,
}
```

`request` is an instance of the [`Request`](../api/request) object with details about the URL to open, HTTP method etc. `page` is an instance of the
`Puppeteer` [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) `response` is an instance of the `Puppeteer`
[`Response`](https://pptr.dev/#?product=Puppeteer&show=api-class-response), which is the main resource response as returned by
`page.goto(request.url)`. `puppeteerPool` is an instance of the [`PuppeteerPool`](../api/puppeteer-pool) used by this `PuppeteerCrawler`.

The function must return a promise, which is then awaited by the crawler.

If the function throws an exception, the crawler will try to re-crawl the request later, up to `option.maxRequestRetries` times. If all the retries
fail, the crawler calls the function provided to the `handleFailedRequestFunction` parameter. To make this work, you should **always** let your
function throw exceptions rather than catch them. The exceptions are logged to the request using the
[`Request.pushErrorMessage()`](../api/request#pusherrormessage) function.

---

### `requestList`

**Type**: [`RequestList`](../api/request-list)

Static list of URLs to be processed. Either `requestList` or `requestQueue` option must be provided (or both).

---

### `requestQueue`

**Type**: [`RequestQueue`](../api/request-queue)

Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites. Either `requestList` or `requestQueue` option must be
provided (or both).

---

### `handlePageTimeoutSecs`

**Type**: `number` <code> = 60</code>

Timeout in which the function passed as `handlePageFunction` needs to finish, in seconds.

---

### `gotoFunction`

**Type**: [`PuppeteerGoto`](../typedefs/puppeteer-goto)

Overrides the function that opens the page in Puppeteer. The function should return the result of Puppeteer's
[page.goto()](https://pptr.dev/#?product=Puppeteer&show=api-pagegotourl-options) function, i.e. a `Promise` resolving to the
[Response](https://pptr.dev/#?product=Puppeteer&show=api-class-httpresponse) object.

This is useful if you need to select different criteria to determine navigation success and also to do any pre or post processing such as injecting
cookies into the page.

Note that a single page object is only used to process a single request and it is closed afterwards.

By default, the function invokes [`puppeteer.gotoExtended()`](../api/puppeteer#gotoextended) with a timeout of 60 seconds.

---

### `gotoTimeoutSecs`

**Type**: `number` <code> = 60</code>

Timeout in which page navigation needs to finish, in seconds. When `gotoFunction()` is used and thus the default function is overridden, this timeout
will not be used and needs to be configured in the new `gotoFunction()`.

---

### `handleFailedRequestFunction`

**Type**: [`HandleFailedRequest`](../typedefs/handle-failed-request)

A function to handle requests that failed more than `option.maxRequestRetries` times.

The function receives the following object as an argument:

```
{
  error: Error,
  request: Request,
  response: Response,
  page: Page,
  puppeteerPool: PuppeteerPool,
  autoscaledPool: AutoscaledPool,
  session: Session,
  proxyInfo: ProxyInfo,
}
```

Where the [`Request`](../api/request) instance corresponds to the failed request, and the `Error` instance represents the last error thrown during
processing of the request.

---

### `maxRequestRetries`

**Type**: `number` <code> = 3</code>

Indicates how many times the request is retried if either `handlePageFunction()` or `gotoFunction()` fails.

---

### `maxRequestsPerCrawl`

**Type**: `number`

Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached. Always set this value in order to prevent infinite
loops in misconfigured crawlers. Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.

---

### `puppeteerPoolOptions`

**Type**: [`PuppeteerPoolOptions`](../typedefs/puppeteer-pool-options)

Custom options passed to the underlying [`PuppeteerPool`](../api/puppeteer-pool) constructor. You can tweak those to fine-tune browser management.

---

### `launchPuppeteerFunction`

**Type**: [`LaunchPuppeteerFunction`](../typedefs/launch-puppeteer-function)

Overrides the default function to launch a new Puppeteer instance. Shortcut to the corresponding [`PuppeteerPool`](../api/puppeteer-pool) option. See
source code on [GitHub](https://github.com/apify/apify-js/blob/master/src/puppeteer_pool.js#L28) for default behavior.

---

### `launchPuppeteerOptions`

**Type**: [`LaunchPuppeteerOptions`](../typedefs/launch-puppeteer-options)

Options used by [`Apify.launchPuppeteer()`](../api/apify#launchpuppeteer) to start new Puppeteer instances. Shortcut to the corresponding
[`PuppeteerPool`](../api/puppeteer-pool) option.

---

### `autoscaledPoolOptions`

**Type**: [`AutoscaledPoolOptions`](../typedefs/autoscaled-pool-options)

Custom options passed to the underlying [`AutoscaledPool`](../api/autoscaled-pool) instance constructor. Note that the `runTaskFunction`,
`isTaskReadyFunction` and `isFinishedFunction` options are provided by `PuppeteerCrawler` and should not be overridden.

---

### `minConcurrency`

**Type**: `number` <code> = 1</code>

Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding
[`AutoscaledPoolOptions.minConcurrency`](../typedefs/autoscaled-pool-options#minconcurrency) option.

_WARNING:_ If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash. If
you're not sure, just keep the default value and the concurrency will scale up automatically.

---

### `maxConcurrency`

**Type**: `number` <code> = 1000</code>

Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding
[`AutoscaledPoolOptions.maxConcurrency`](../typedefs/autoscaled-pool-options#maxconcurrency) option.

---

### `useSessionPool`

**Type**: `boolean` <code> = false</code>

If set to true Crawler will automatically use Session Pool. It will automatically retire sessions on 403, 401 and 429 status codes. It also marks
Session as bad after a request timeout.

---

### `sessionPoolOptions`

**Type**: [`SessionPoolOptions`](../typedefs/session-pool-options)

Custom options passed to the underlying [`SessionPool`](../api/session-pool) constructor.

---

### `persistCookiesPerSession`

**Type**: `boolean` <code> = false</code>

Automatically saves cookies to Session. Works only if Session Pool is used.

---

### `proxyConfiguration`

**Type**: [`ProxyConfiguration`](../api/proxy-configuration)

If set, `PuppeteerCrawler` will be configured for all connections to use [Apify Proxy](https://my.apify.com/proxy) or your own Proxy URLs provided and
rotated according to the configuration. For more information, see the [documentation](https://docs.apify.com/proxy).

---
