# Requests and links

## Link filtering

Combine `globs` and `regexps` into `include`. Translate `pseudoUrls` to equivalent anchored regular expressions or globs; `PseudoUrl` is removed. Literal portions of a pseudo-URL must remain escaped, while bracketed patterns retain their regex meaning.

`strategy` now always applies alongside `include` using AND logic. `enqueueLinks()` defaults to `same-hostname`, so patterns matching subdomains may need `same-domain`, and deliberate cross-domain crawling may need `all`. `addRequests()` has no implicit current page and defaults to `all`.

Pattern objects no longer carry request `label`, `userData`, `method`, `payload` or `headers`. Use top-level label/userData or `transformRequestFunction`. The transform runs after pattern filtering, overrides global request options, and returns modified/new request options, `'unchanged'`, or a falsy value/`'skip'` to skip. Check transforms that used to change URLs before filtering.

Standalone `enqueueLinks` and click-element helpers rename `requestQueue` to `requestManager`. `onSkippedRequest` receives `{ request, reason }`, so use `request.url`. Per-call `robotsTxtFile` and `respectRobotsTxtFile` options are removed; use crawler-level `respectRobotsTxtFile`.

`enqueueLinks()` and `context.addRequests()` return `AddRequestsBatchedResult`: `addedRequests` replaces `processedRequests`; `unprocessedRequests` is gone. `RequestQueue.addRequestsBatched()` warns and skips semantic rejections; backends handle transient retries.

`BasicCrawler` and its context lose `enqueueLinks`; use `addRequests()` for known URLs. Web-content crawlers retain `enqueueLinks()`.

Replace skipping hacks using `noRetry`, throws and counter adjustments with `context.skipRequest(message?)` in hooks, handlers or `extendContext`. It marks the request handled with `RequestState.SKIPPED`, rolls back buffered writes, skips retries and `failedRequestHandler`, and calls `onSkippedRequest` with reason `'manual'`.

With `respectRobotsTxtFile`, robots.txt HTTP 4xx responses allow all URLs and 5xx responses disallow all URLs regardless of body. The result is cached per origin for the run, so a robots.txt 5xx skips all requests to that origin with reason `'robotsTxt'`.

## Queue sharing and repeated runs

Only the first crawler uses the default queue. Later crawlers get distinct default queues unless passed an explicit manager. Make previously intended sharing explicit. Repeated `run()` calls keep the same manager and handled requests, including failed ones. `purgeRequestQueue` is removed from run options.

`RequestQueue.open({ alias })` supplies a run-scoped queue; reused aliases return the same handled state, while aliases are purged on process start with default storages. Use named queues when persistence across runs is intended.

`purge()` exists locally and optionally on managers, but throws on Apify; use fresh storage or intentional `drop()` there. Never purge user storage automatically during migration. `purgeOnStart` still applies once per process and is separate from reruns.

## Loaders and managers

`IRequestList` becomes `IRequestLoader`. `IRequestManager` extends it with adding and reclaiming requests. `RequestQueueV1`, `RequestQueueV2` and `RequestProvider` become `RequestQueue`.

| v3 | v4 |
| --- | --- |
| `length()` | `await getTotalCount()` |
| `handledCount()` | `await getHandledCount()` |
| `markRequestHandled(request)` | `markRequestAsHandled(request)` |
| `isEmpty()` / `isFinished()` | `await checkReadiness()` |
| `SitemapRequestList` / its options | `SitemapRequestLoader` / its options |

Readiness is `{ status: 'ready' }`, `'waiting'` with optional `readyAt`, `'stalled'` with `reason`, or `'finished'`. Rewrite predicates to handle these states. Combined sources prioritize ready, stalled, waiting, finished; waiting uses the earlier readiness time. Storage backends retain `isEmpty()` and `isFinished()`.

Read-only loaders lose `reclaimRequest`, `inProgress` and `persistState` from their interface. Stateful implementations persist themselves; `RequestList` and `SitemapRequestLoader` retain public `persistState()` methods.

Crawler constructor `requestList` and `requestQueue` options are deprecated but still accepted. Prefer `requestManager`; combine list and queue with `await requestList.toTandem(queue)` or `new RequestManagerTandem(list, queue)`. A lone list now runs through a tandem with a queue, changing retries and request-limit accounting. Crawler instance `requestList` and `requestQueue` fields are removed. `getRequestQueue()` remains deprecated but may return any manager; use `getRequestManager()`.

`RequestList` persisted state wins over the explicit `state` option. `nextIndex` must be a nonnegative integer and `inProgress` unique keys. Its built-in record shape remains compatible. The sitemap default key changes from `SITEMAP_REQUEST_LIST_STATE` to `SITEMAP_REQUEST_LOADER_STATE`; preserve an explicit old key or finish the crawl before upgrading if restart is unacceptable.

## Stored requests and crawler requests

Core `Request` holds stored records. `CrawlingRequest` from `@crawlee/basic` adds `skipNavigation`, `crawlDepth`, `sessionId`, `maxRetries`, `state` and `pushErrorMessage()`. `RequestState` moves from core to basic too. Handlers/hooks already receive `CrawlingRequest`. Convert manager results with `CrawlingRequest.fromSchema(request)` when these properties are needed; request options still record them.

`RequestOptions` no longer accepts `id` or `handledAt`; the constructor ignores `retryCount`, `errorMessages` and `loadedUrl`. Rebuild stored records with `Request.fromSchema(record)`. `RequestOptions.skippedReason` and `Request.skippedReason` are removed.

Custom managers receive rebuilt requests in `reclaimRequest()` and `markRequestAsHandled()`; match by `uniqueKey`/`id`, not identity. The protected `crawler.requestManager` getter is read-only; inject managers through constructor options and access them through `getRequestManager()`.

## Pacing

Custom managers must implement `recordPacingSignal(signal): boolean`; wrappers forward it. Return false when not handling pacing. Signals specify domain rate limits or minimum intervals in milliseconds. Honor the requested or wider scope; reject unsupported scopes.

HTTP 429 still retires sessions by default. Opt-in `ThrottlingRequestManager` handles covered domains first, honoring Retry-After without consuming the request retry budget. A domain stalled beyond `maxDomainStallSecs`, default 15 minutes, causes `PersistentRateLimitError` unless keepAlive allows continued waiting. Robots Crawl-delay requires a covering throttling manager, otherwise Crawlee warns and ignores it.

`sameDomainDelaySecs` still paces registrable domains, including subdomains, through the manager. The default wrapper supports 100 domains. Custom managers must cover all domains at registrable-domain scope; partial coverage throws. Requests bypassing the manager through `requestsFromUrl` are not paced and produce a warning.
