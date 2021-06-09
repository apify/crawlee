---
id: version-1.0.0-basic-crawler-options
title: BasicCrawlerOptions
original_id: basic-crawler-options
---

<a name="basiccrawleroptions"></a>

## Properties

### `handleRequestFunction`

**Type**: [`HandleRequest`](../typedefs/handle-request)

User-provided function that performs the logic of the crawler. It is called for each URL to crawl.

The function receives the following object as an argument:

```
{
  request: Request,
  session: Session,
  crawler: BasicCrawler,
}
```

where the [`Request`](../api/request) instance represents the URL to crawl.

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

### `handleRequestTimeoutSecs`

**Type**: `number` <code> = 60</code>

Timeout in which the function passed as `handleRequestFunction` needs to finish, in seconds.

---

### `handleFailedRequestFunction`

**Type**: [`HandleFailedRequest`](../typedefs/handle-failed-request)

A function to handle requests that failed more than `option.maxRequestRetries` times.

The function receives the following object as an argument:

```
{
  request: Request,
  error: Error,
  session: Session,
  crawler: BasicCrawler,
}
```

where the [`Request`](../api/request) instance corresponds to the failed request, and the `Error` instance represents the last error thrown during
processing of the request.

See [source code](https://github.com/apify/apify-js/blob/master/src/crawlers/basic_crawler.js#L11) for the default implementation of this function.

---

### `maxRequestRetries`

**Type**: `number` <code> = 3</code>

Indicates how many times the request is retried if
[`BasicCrawlerOptions.handleRequestFunction`](../typedefs/basic-crawler-options#handlerequestfunction) fails.

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

Basic crawler will initialize the [`SessionPool`](../api/session-pool) with the corresponding `sessionPoolOptions`. The session instance will be than
available in the `handleRequestFunction`.

---

### `sessionPoolOptions`

**Type**: [`SessionPoolOptions`](../typedefs/session-pool-options)

The configuration options for [`SessionPool`](../api/session-pool) to use.

---
