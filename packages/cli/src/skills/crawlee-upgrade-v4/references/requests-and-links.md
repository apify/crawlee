# Requests and links

## Link filtering

Combine `globs` and `regexps` into `include`. Translate `pseudoUrls` to equivalent anchored regular expressions or globs; `PseudoUrl` is removed. Literal portions of a pseudo-URL must remain escaped, while bracketed patterns retain their regex meaning.

`strategy` now always applies alongside `include` using AND logic. `enqueueLinks()` defaults to `same-hostname`, so patterns matching subdomains may need `same-domain`, and deliberate cross-domain crawling may need `all`. Choose the smallest scope preserving the original crawl. `addRequests()` has no implicit current page and defaults to `all`.

Pattern objects no longer carry request `label`, `userData`, `method`, `payload` or `headers`. Use top-level label/userData or `transformRequestFunction`. The transform runs after pattern filtering, overrides global request options, and returns modified/new request options, `'unchanged'`, or a falsy value/`'skip'` to skip. Check transforms that used to change URLs before filtering.

Standalone `enqueueLinks` and click-element helpers rename `requestQueue` to `requestManager`. `onSkippedRequest` receives `{ request, reason }`, so use `request.url`. Per-call `robotsTxtFile` and `respectRobotsTxtFile` options are removed; use crawler-level `respectRobotsTxtFile`.

`enqueueLinks()` and `context.addRequests()` return `AddRequestsBatchedResult`: `addedRequests` replaces `processedRequests`; `unprocessedRequests` is gone. `waitForAllRequestsToBeAdded` waits for subsequent batches, and `requestsOverLimit` reports budget exclusions. Backend semantic rejections are warned and skipped; they are no longer retried by `RequestQueue.addRequestsBatched()`. Transient failure retries belong to the backend.

`BasicCrawler` and its context lose `enqueueLinks`; use `addRequests()` for known URLs. Crawlers with web content retain `enqueueLinks()` and gain `extractLinks()` for URL extraction without enqueueing.

## Queue sharing and repeated runs

Only the first crawler uses the default queue. Later crawlers get distinct default queues unless passed an explicit manager. Make previously intended sharing explicit. Repeated `run()` calls keep the same manager and handled requests, including failed ones. `purgeRequestQueue` is removed from run options.

Prefer fresh crawlers or deliberately separate queues for independent crawls. `RequestQueue.open({ alias })` supplies a run-scoped queue; reused aliases return the same handled state, while aliases are purged on process start with default storages. Named queues provide a different persistence choice. Do not swap one for the other without checking intent.

For deliberate in-place clearing, `purge()` exists on local stores and optionally on managers, but throws on the Apify platform. There use a fresh storage or intentional `drop()`. Do not purge user storage as an automatic migration operation. `purgeOnStart` still applies once per process and is separate from reruns.

## Loaders and managers

`IRequestList` becomes `IRequestLoader`. `IRequestManager` extends it with adding and reclaiming requests. `RequestQueueV1`, `RequestQueueV2` and `RequestProvider` become `RequestQueue`.

| v3 | v4 |
| --- | --- |
| `length()` | `await getTotalCount()` |
| `handledCount()` | `await getHandledCount()` |
| `markRequestHandled(request)` | `markRequestAsHandled(request)` |
| `isEmpty()` / `isFinished()` | `await checkReadiness()` |
| `SitemapRequestList` / its options | `SitemapRequestLoader` / its options |

Readiness is `{ status: 'ready' }`, `'waiting'` with optional `readyAt`, `'stalled'` with `reason`, or `'finished'`. Rewrite predicates according to their intent, not by renaming calls. Combined sources prioritize ready, stalled, waiting, finished; waiting uses the earlier readiness time. Storage backends retain `isEmpty()` and `isFinished()`.

Read-only loaders lose `reclaimRequest` and `inProgress` from their interface. Persistence becomes optional; `getPendingCount()` and optional `toTandem()` are added.

Crawler constructor `requestList` and `requestQueue` options are deprecated but still accepted. Prefer `requestManager`; combine list and queue with `await requestList.toTandem(queue)` or `new RequestManagerTandem(list, queue)`. A lone list now runs through a tandem with a queue, changing retries and request-limit accounting. Crawler instance `requestList` and `requestQueue` fields are removed. `getRequestQueue()` remains deprecated but may return any manager; use `getRequestManager()`.

`RequestList` persisted state wins over the explicit `state` option. `nextIndex` must be a nonnegative integer and `inProgress` unique keys. Its built-in record shape remains compatible. The sitemap default key changes from `SITEMAP_REQUEST_LIST_STATE` to `SITEMAP_REQUEST_LOADER_STATE`; preserve an explicit old key or finish the crawl before upgrading if restart is unacceptable.

## Pacing

Custom managers must implement `recordPacingSignal(signal): boolean` and forward signals through wrappers. Return false when not responsible for pacing. Signals cover per-domain rate limits, minimum intervals and a minimum interval everywhere, in milliseconds. Honor the requested scope or a wider one; reject scopes you cannot honor.

HTTP 429 still retires sessions by default. Opt-in `ThrottlingRequestManager` handles covered domains first, honoring Retry-After without consuming the request retry budget. A domain stalled beyond `maxDomainStallSecs`, default 15 minutes, causes `PersistentRateLimitError` unless keepAlive allows continued waiting. Robots Crawl-delay requires a covering throttling manager, otherwise Crawlee warns and ignores it.

`sameDomainDelaySecs` still paces registrable domains, including subdomains, through the manager. The default wrapper has a 100-domain limit; configure your own manager to increase it. Combining the delay with a manager pacing only some domains throws. A compatible manager should pace all domains at registrable-domain scope. Requests bypassing the manager through `requestsFromUrl` are not paced and produce a warning.
