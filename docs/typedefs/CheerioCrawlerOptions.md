---
id: cheerio-crawler-options
title: CheerioCrawlerOptions
---

<a name="cheeriocrawleroptions"></a>

## Properties

### `handlePageFunction`

**Type**: [`CheerioHandlePage`](/docs/typedefs/cheerio-handle-page)

User-provided function that performs the logic of the crawler. It is called for each page loaded and parsed by the crawler.

The function receives the following object as an argument:

```
{
  // The Cheerio object's function with the parsed HTML.
  $: Cheerio,

  // The request body of the web page, whose type depends on the content type.
  body: String|Buffer,

  // The parsed object from JSON for responses with the "application/json" content types.
  // For other content types it's null.
  json: Object,

  // Apify.Request object with details of the requested web page
  request: Request,

  // Parsed Content-Type HTTP header: { type, encoding }
  contentType: Object,

  // An instance of Node's http.IncomingMessage object,
  response: Object,

  // Underlying AutoscaledPool instance used to manage the concurrency of crawler
  autoscaledPool: AutoscaledPool,

  // Session object, useful to work around anti-scraping protections
  session: Session
}
```

Type of `body` depends on the `Content-Type` header of the web page:

-   String for `text/html`, `application/xhtml+xml`, `application/xml` MIME content types
-   Buffer for others MIME content types

Parsed `Content-Type` header using [content-type package](https://www.npmjs.com/package/content-type) is stored in `contentType`.

Cheerio is available only for HTML and XML content types.

With the [`Request`](/docs/api/request) object representing the URL to crawl.

If the function returns, the returned promise is awaited by the crawler.

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

### `requestOptions`

**Type**: [`RequestAsBrowserOptions`](/docs/typedefs/request-as-browser-options)

Represents the options passed to the `requestAsBrowser` function that makes the HTTP requests to fetch the web pages. Provided `requestOptions` are
added to internal defaults that cannot be overridden to ensure the operation of `CheerioCrawler` and all its options. Headers will not be merged, use
[`RequestList`](/docs/api/request-list) and/or [`RequestQueue`](/docs/api/request-queue) to initialize your [`Request`](/docs/api/request) with the
correct headers or use `prepareRequestFunction` to modify your [`Request`](/docs/api/request) dynamically. If you need more granular control over your
requests, use [`BasicCrawler`](/docs/api/basic-crawler).

The mandatory internal defaults that **CANNOT BE OVERRIDDEN** by `requestOptions`:

```
{
    url,       // Provided by RequestList and/or RequestQueue
    method,    // Provided by RequestList and/or RequestQueue
    headers,   // Provided by RequestList and/or RequestQueue
    payload,   // Provided by RequestList and/or RequestQueue
    strictSSL, // Use ignoreSslErrors
    proxy,     // Use useApifyProxy or proxyUrls
}
```

---

### `prepareRequestFunction`

**Type**: [`PrepareRequest`](/docs/typedefs/prepare-request)

A function that executes before the HTTP request is made to the target resource. This function is suitable for setting dynamic properties such as
cookies to the [`Request`](/docs/api/request).

The function receives the following object as an argument:

```
{
  request: Request,
  session: Session
}
```

where the [`Request`](/docs/api/request) instance corresponds to the initialized request and the [`Session`](/docs/api/session) instance corresponds
to used session.

The function should modify the properties of the passed [`Request`](/docs/api/request) instance in place because there are already earlier references
to it. Making a copy and returning it from this function is therefore not supported, because it would create inconsistencies where different parts of
SDK would have access to a different [`Request`](/docs/api/request) instance.

---

### `handlePageTimeoutSecs`

**Type**: `number` <code> = 60</code>

Timeout in which the function passed as `handlePageFunction` needs to finish, given in seconds.

---

### `requestTimeoutSecs`

**Type**: `number` <code> = 30</code>

Timeout in which the HTTP request to the resource needs to finish, given in seconds.

---

### `ignoreSslErrors`

**Type**: `boolean` <code> = true</code>

If set to true, SSL certificate errors will be ignored.

---

### `useApifyProxy`

**Type**: `boolean` <code> = false</code>

If set to `true`, `CheerioCrawler` will be configured to use [Apify Proxy](https://my.apify.com/proxy) for all connections. For more information, see
the [documentation](https://docs.apify.com/proxy)

---

### `apifyProxyGroups`

**Type**: `Array<string>`

An array of proxy groups to be used by the [Apify Proxy](https://docs.apify.com/proxy). Only applied if the `useApifyProxy` option is `true`.

---

### `apifyProxySession`

**Type**: `string`

Apify Proxy session identifier to be used with requests made by `CheerioCrawler`. All HTTP requests going through the proxy with the same session
identifier will use the same target proxy server (i.e. the same IP address). The identifier can only contain the following characters: `0-9`, `a-z`,
`A-Z`, `"."`, `"_"` and `"~"`. Only applied if the `useApifyProxy` option is `true`.

---

### `proxyUrls`

**Type**: `Array<string>`

An array of custom proxy URLs to be used by the `CheerioCrawler` instance. The provided custom proxies' order will be randomized and the resulting
list rotated. Custom proxies are not compatible with Apify Proxy and an attempt to use both configuration options will cause an error to be thrown on
startup.

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

where the [`Request`](/docs/api/request) instance corresponds to the failed request, and the `Error` instance represents the last error thrown during
processing of the request.

See [source code](https://github.com/apifytech/apify-js/blob/master/src/crawlers/cheerio_crawler.js#L13) for the default implementation of this
function.

---

### `additionalMimeTypes`

**Type**: `Array<string>`

An array of <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Complete_list_of_MIME_types"
  target="_blank">MIME types</a> you want the crawler to load and process. By default, only `text/html` and `application/xhtml+xml` MIME types are
supported.

---

### `maxRequestRetries`

**Type**: `number` <code> = 3</code>

Indicates how many times the request is retried if either `requestFunction` or `handlePageFunction` fails.

---

### `maxRequestsPerCrawl`

**Type**: `number`

Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached. Always set this value in order to prevent infinite
loops in misconfigured crawlers. Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.

---

### `autoscaledPoolOptions`

**Type**: [`AutoscaledPoolOptions`](/docs/typedefs/autoscaled-pool-options)

Custom options passed to the underlying [`AutoscaledPool`](/docs/api/autoscaled-pool) constructor. Note that the `runTaskFunction`,
`isTaskReadyFunction` and `isFinishedFunction` options are provided by `CheerioCrawler` and cannot be overridden. Reasonable
[`Snapshotter`](/docs/api/snapshotter) and [`SystemStatus`](/docs/api/system-status) defaults are provided to account for the fact that `cheerio`
parses HTML synchronously and therefore blocks the event loop.

---

### `minConcurrency`

**Type**: `number` <code> = 1</code>

Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding [`AutoscaledPool`](/docs/api/autoscaled-pool) option.

_WARNING:_ If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash. If
you're not sure, just keep the default value and the concurrency will scale up automatically.

---

### `maxConcurrency`

**Type**: `number` <code> = 1000</code>

Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding [`AutoscaledPool`](/docs/api/autoscaled-pool) option.

---

### `useSessionPool`

**Type**: `boolean` <code> = false</code>

If set to true Crawler will automatically use Session Pool. It will automatically retire sessions on 403, 401 and 429 status codes. It also marks
Session as bad after a request timeout.

---

### `sessionPoolOptions`

**Type**: [`SessionPoolOptions`](/docs/typedefs/session-pool-options)

Custom options passed to the underlying [`SessionPool`](/docs/api/session-pool) constructor.

---

### `persistCookiesPerSession`

**Type**: `boolean`

Automatically saves cookies to Session. Works only if Session Pool is used.

It parses cookie from response "set-cookie" header saves or updates cookies for session and once the session is used for next request. It passes the
"Cookie" header to the request with the session cookies.

---
