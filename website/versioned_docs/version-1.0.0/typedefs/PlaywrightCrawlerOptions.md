---
id: version-1.0.0-playwright-crawler-options
title: PlaywrightCrawlerOptions
original_id: playwright-crawler-options
---

<a name="playwrightcrawleroptions"></a>

## Properties

### `handlePageFunction`

**Type**: `function`

Function that is called to process each request. It is passed an object with the following fields:

```
{
  request: Request,
  response: Response,
  page: Page,
  session: Session,
  browserController: BrowserController,
  proxyInfo: ProxyInfo,
  crawler: PlaywrightCrawler,
}
```

`request` is an instance of the [`Request`](../api/request) object with details about the URL to open, HTTP method etc. `page` is an instance of the
`Playwright` [`Page`](https://playwright.dev/docs/api/class-page) `browserController` is an instance of the
[`BrowserController`](https://github.com/apify/browser-pool#browsercontroller), `response` is an instance of the `Playwright`
[`Response`](https://playwright.dev/docs/api/class-response), which is the main resource response as returned by `page.goto(request.url)`. The
function must return a promise, which is then awaited by the crawler.

If the function throws an exception, the crawler will try to re-crawl the request later, up to `option.maxRequestRetries` times. If all the retries
fail, the crawler calls the function provided to the `handleFailedRequestFunction` parameter. To make this work, you should **always** let your
function throw exceptions rather than catch them. The exceptions are logged to the request using the
[`Request.pushErrorMessage()`](../api/request#pusherrormessage) function.

---

### `navigationTimeoutSecs`

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
  request: Request,
  response: Response,
  page: Page,
  session: Session,
  browserController: BrowserController,
  proxyInfo: ProxyInfo,
  crawler: PlaywrightCrawler,
}
```

Where the [`Request`](../api/request) instance corresponds to the failed request, and the `Error` instance represents the last error thrown during
processing of the request.

---

### `preNavigationHooks`

**Type**: `Array<function()>`

Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies or browser properties before navigation.
The function accepts two parameters, `crawlingContext` and `gotoOptions`, which are passed to the `gotoFunction` the crawler calls to navigate.
Example:

```
preNavigationHooks: [
    async (crawlingContext, gotoOptions) => {
        await page.evaluate((attr) => { window.foo = attr; }, 'bar');
    }
]
```

---

### `postNavigationHooks`

**Type**: `Array<function()>`

Async functions that are sequentially evaluated after the navigation. Good for checking if the navigation was successful. The function accepts
`crawlingContext` as an only parameter. Example:

```
postNavigationHooks: [
    async (crawlingContext) => {
        const { page } = crawlingContext;
        if (hasCaptcha(page)) {
            await solveCaptcha (page);
        }
    };
]
```

---

### `launchContext`

**Type**: [`PlaywrightLaunchContext`](../typedefs/playwright-launch-context)

The same options as used by [`Apify.launchPlaywright()`](../api/apify#launchplaywright).

---

### `handlePageTimeoutSecs`

**Type**: `number` <code> = 60</code>

Timeout in which the function passed as `handlePageFunction` needs to finish, in seconds.

---

### `browserPoolOptions`

**Type**: `BrowserPoolOptions`

Custom options passed to the underlying [`BrowserPool`](https://github.com/apify/browser-pool#BrowserPool) constructor. You can tweak those to
fine-tune browser management.

---

### `persistCookiesPerSession`

**Type**: `boolean` <code> = true</code>

Automatically saves cookies to Session. Works only if Session Pool is used.

---

### `proxyConfiguration`

**Type**: [`ProxyConfiguration`](../api/proxy-configuration)

If set, `PlaywrightCrawler` will be configured for all connections to use [Apify Proxy](https://my.apify.com/proxy) or your own Proxy URLs provided
and rotated according to the configuration. For more information, see the [documentation](https://docs.apify.com/proxy).

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

### `handleRequestTimeoutSecs`

**Type**: `number` <code> = 60</code>

Timeout in which the function passed as `handleRequestFunction` needs to finish, in seconds.

---

### `maxRequestRetries`

**Type**: `number` <code> = 3</code>

Indicates how many times the request is retried if
[`PlaywrightCrawlerOptions.handlePageFunction`](../typedefs/playwright-crawler-options#handlepagefunction) fails.

---

### `maxRequestsPerCrawl`

**Type**: `number`

Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached. Always set this value in order to prevent infinite
loops in misconfigured crawlers. Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.

---

### `autoscaledPoolOptions`

**Type**: [`AutoscaledPoolOptions`](../typedefs/autoscaled-pool-options)

Custom options passed to the underlying [`AutoscaledPool`](../api/autoscaled-pool) constructor. Note that the `runTaskFunction` and
`isTaskReadyFunction` options are provided by `BasicCrawler` and cannot be overridden. However, you can provide a custom implementation of
`isFinishedFunction`.

---

### `minConcurrency`

**Type**: `number` <code> = 1</code>

Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding [`AutoscaledPool`](../api/autoscaled-pool) option.

_WARNING:_ If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash. If
you're not sure, just keep the default value and the concurrency will scale up automatically.

---

### `maxConcurrency`

**Type**: `number` <code> = 1000</code>

Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding [`AutoscaledPool`](../api/autoscaled-pool) option.

---

### `useSessionPool`

**Type**: `boolean` <code> = true</code>

Playwright crawler will initialize the [`SessionPool`](../api/session-pool) with the corresponding `sessionPoolOptions`. The session instance will be
than available in the `handleRequestFunction`.

---

### `sessionPoolOptions`

**Type**: [`SessionPoolOptions`](../typedefs/session-pool-options)

The configuration options for [`SessionPool`](../api/session-pool) to use.

---
