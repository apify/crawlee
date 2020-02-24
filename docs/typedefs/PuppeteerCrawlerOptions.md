---
id: puppeteer-crawler-options
title: PuppeteerCrawlerOptions
---

<a name="puppeteercrawleroptions"></a>

## Properties

### `handlePageFunction`

**Type**: [`PuppeteerHandlePage`](/docs/typedefs/puppeteer-handle-page)

Function that is called to process each request. It is passed an object with the following fields:

```
{
  request: Request,
  response: Response,
  page: Page,
  puppeteerPool: PuppeteerPool,
  autoscaledPool: AutoscaledPool,
  session: Session,
}
```

`request` is an instance of the [`Request`](/docs/api/request) object with details about the URL to open, HTTP method etc. `page` is an instance of
the `Puppeteer` [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) `response` is an instance of the `Puppeteer`
[`Response`](https://pptr.dev/#?product=Puppeteer&show=api-class-response), which is the main resource response as returned by
`page.goto(request.url)`. `puppeteerPool` is an instance of the [`PuppeteerPool`](/docs/api/puppeteer-pool) used by this `PuppeteerCrawler`.

The function must return a promise, which is then awaited by the crawler.

If the function throws an exception, the crawler will try to re-crawl the request later, up to `option.maxRequestRetries` times. If all the retries
fail, the crawler calls the function provided to the `handleFailedRequestFunction` parameter. To make this work, you should **always** let your
function throw exceptions rather than catch them. The exceptions are logged to the request using the
[`Request.pushErrorMessage()`](/docs/api/request#pusherrormessage) function.

---

### `requestList`

**Type**: [`RequestList`](/docs/api/request-list)

Static list of URLs to be processed. Either `requestList` or `requestQueue` option must be provided (or both).

---

### `requestQueue`

**Type**: [`RequestQueue`](/docs/api/request-queue)

Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites. Either `requestList` or `requestQueue` option must be
provided (or both).

---

### `handlePageTimeoutSecs`

**Type**: `Number` <code> = 60</code>

Timeout in which the function passed as `handlePageFunction` needs to finish, in seconds.

---

### `gotoFunction`

**Type**: [`PuppeteerGoto`](/docs/typedefs/puppeteer-goto)

Overrides the function that opens the page in Puppeteer. The function should return the result of Puppeteer's
[page.goto()](https://pptr.dev/#?product=Puppeteer&show=api-pagegotourl-options) function, i.e. a `Promise` resolving to the
[Response](https://pptr.dev/#?product=Puppeteer&show=api-class-response) object.

This is useful if you need to extend the page load timeout or select different criteria to determine that the navigation succeeded.

Note that a single page object is only used to process a single request and it is closed afterwards.

By default, the function invokes [`puppeteer.gotoExtended()`](/docs/api/puppeteer#gotoextended) with a timeout of 60 seconds. For details, see source
code on [GitHub](https://github.com/apifytech/apify-js/blob/master/src/crawlers/puppeteer_crawler.js#L292).

---

### `gotoTimeoutSecs`

**Type**: `Number` <code> = 60</code>

Timeout in which page navigation needs to finish, in seconds. When `gotoFunction()` is used and thus the default function is overridden, this timeout
will not be used and needs to be configured in the new `gotoFunction()`.

---

### `handleFailedRequestFunction`

**Type**: [`HandleFailedRequest`](/docs/typedefs/handle-failed-request)

A function to handle requests that failed more than `option.maxRequestRetries` times.

The function receives the following object as an argument:

```
{
  request: Request,
  error: Error,
}
```

Where the [`Request`](/docs/api/request) instance corresponds to the failed request, and the `Error` instance represents the last error thrown during
processing of the request.

See [source code](https://github.com/apifytech/apify-js/blob/master/src/crawlers/puppeteer_crawler.js#L301) for the default implementation of this
function.

---

### `maxRequestRetries`

**Type**: `Number` <code> = 3</code>

Indicates how many times the request is retried if either `handlePageFunction()` or `gotoFunction()` fails.

---

### `maxRequestsPerCrawl`

**Type**: `Number`

Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached. Always set this value in order to prevent infinite
loops in misconfigured crawlers. Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.

---

### `puppeteerPoolOptions`

**Type**: [`PuppeteerPoolOptions`](/docs/typedefs/puppeteer-pool-options)

Custom options passed to the underlying [`PuppeteerPool`](/docs/api/puppeteer-pool) constructor. You can tweak those to fine-tune browser management.

---

### `launchPuppeteerFunction`

**Type**: `function`

Overrides the default function to launch a new Puppeteer instance. Shortcut to the corresponding [`PuppeteerPool`](/docs/api/puppeteer-pool) option.
See source code on [GitHub](https://github.com/apifytech/apify-js/blob/master/src/puppeteer_pool.js#L28) for default behavior.

---

### `launchPuppeteerOptions`

**Type**: [`LaunchPuppeteerOptions`](/docs/typedefs/launch-puppeteer-options)

Options used by [`Apify.launchPuppeteer()`](/docs/api/apify#launchpuppeteer) to start new Puppeteer instances. Shortcut to the corresponding
[`PuppeteerPool`](/docs/api/puppeteer-pool) option.

---

### `autoscaledPoolOptions`

**Type**: [`AutoscaledPoolOptions`](/docs/typedefs/autoscaled-pool-options)

Custom options passed to the underlying [`AutoscaledPool`](/docs/api/autoscaled-pool) instance constructor. Note that the `runTaskFunction`,
`isTaskReadyFunction` and `isFinishedFunction` options are provided by `PuppeteerCrawler` and should not be overridden.

---

### `minConcurrency`

**Type**: `Number` <code> = 1</code>

Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding
[`AutoscaledPoolOptions.minConcurrency`](/docs/typedefs/autoscaled-pool-options#minconcurrency) option.

_WARNING:_ If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash. If
you're not sure, just keep the default value and the concurrency will scale up automatically.

---

### `maxConcurrency`

**Type**: `Number` <code> = 1000</code>

Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding
[`AutoscaledPoolOptions.maxConcurrency`](/docs/typedefs/autoscaled-pool-options#maxconcurrency) option.

---

### `useSessionPool`

**Type**: `Boolean` <code> = false</code>

If set to true Crawler will automatically use Session Pool. It will automatically retire sessions on 403, 401 and 429 status codes. It also marks
Session as bad after a request timeout.

---

### `sessionPoolOptions`

**Type**: [`SessionPoolOptions`](/docs/typedefs/session-pool-options)

Custom options passed to the underlying [`SessionPool`](/docs/api/session-pool) constructor.

---

### `persistCookiesPerSession`

**Type**: `Boolean` <code> = false</code>

Automatically saves cookies to Session. Works only if Session Pool is used.

---
