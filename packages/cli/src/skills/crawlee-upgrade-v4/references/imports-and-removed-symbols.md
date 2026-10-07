# Imports and removed symbols

## Package moves

- Imports of crawler-only exports from `@crawlee/core` move to `@crawlee/basic`: sessions, Router, Statistics, error tracking, ContextPipeline and context types, concurrency/load signals, SitemapRequestLoader, ThrottlingRequestManager, enqueue option/pattern types, cookie helpers, and crawler-specific errors. Imports through `crawlee` or crawler packages generally remain available. Check individual symbols rather than replacing all core imports.
- General utility types such as Dictionary, Awaitable, Constructor, Cookie, QueueOperationInfo and AllowedHttpMethods need direct imports and a dependency on `@crawlee/types`. SearchParams moves there too. StorageBackend and StorageIdentifier remain reachable from core; IBrowserPool and NewPageOptions remain reachable from browser-pool.
- `EnqueueStrategy` moves from utils to `@crawlee/core`, also available through `crawlee`.
- JSDOMCrawler and LinkeDOMCrawler require explicit `@crawlee/jsdom` and `@crawlee/linkedom` dependencies and imports. They are no longer exported by `crawlee`.
- CheerioRoot is removed. Import CheerioAPI or Cheerio from `cheerio` and Element from `domhandler`, with direct dependencies where used. Crawlee packages no longer re-export those types.
- HTTP client classes move to `@crawlee/http-client` and `@crawlee/got-scraping-client`; read the HTTP reference for the changed contract.

## Utility changes

`RobotsFile` becomes `RobotsTxtFile`. `RobotsTxtFile.find(url, proxyUrl, options)` becomes `find(url, { proxyUrl, ...options })`, also supporting httpClient and logger. `getSitemaps`, `parseSitemaps` and `parseUrlsFromSitemaps` lose RobotsTxtFileSitemapsOptions. ParseSitemapOptions loses enqueueStrategy and networkTimeouts.

`htmlToText`, `parseHandlesFromHtml` and `parseOpenGraph` are now async; await their results and update callers' return types.

`systemInfoV2` and `CRAWLEE_SYSTEM_INFO_V2` disappear; the new resource detection is the default. Utils no longer exports getMemoryInfo/MemoryInfo, isContainerized, isDocker, isLambda or getCgroupsVersion. For direct application use, read equivalent OS or cgroup values explicitly.

Removed filterUrl, matchesEnqueueStrategy, UNSUPPORTED_SCHEME_MESSAGE and core filterRequestsByPatterns have no public replacement. Filtering belongs in enqueueLinks/addRequests.

Utils separates public helpers from `@crawlee/utils/internal`. Internal regex, blocked-detection, iterable and URL helpers move there, including URL_NO_COMMAS_REGEX, URL_WITH_COMMAS_REGEX, extractUrlsFromCheerio and tryAbsoluteURL. Core no longer re-exports parseArgument, schemas or tryAbsoluteURL. Prefer supported public helpers; internal imports have no semver guarantees. ArgumentValidationError stays exported by core.

## Removed-member lookup

Search this list when a compiler or runtime error identifies an old symbol. Read the named topic before choosing a replacement.

| Removed symbol | Migration topic or replacement |
| --- | --- |
| `BasicCrawler._cleanupContext`, `HttpCrawler.use`, `CrawlerExtension` | ContextPipeline; crawler internals |
| `BasicCrawler.isRequestBlocked`, `BrowserCrawler._handleNavigation`, `HttpCrawler._handleNavigation`, `HttpCrawler._parseHTML` | Supported handlers/hooks/pipelines; crawler internals |
| `BasicCrawler.events` | `BasicCrawler.serviceLocator` |
| `BasicCrawler._tagUserHandlerError`, `handledRequestsCount` setter, `crawlingContexts` | Removed internals; use statistics/public hooks or application state |
| `BrowserRequestHandler`, `BrowserErrorHandler`, `BrowserCrawler.userProvidedRequestHandler`, `requestHandlerTimeoutInnerMillis`, `HttpCrawler.userRequestHandlerTimeoutMillis` | Inferred handler options and timeout options |
| `BrowserCrawler._enhanceCrawlingContextWithPageInfo` | ContextPipeline |
| `HttpCrawler._applyCookies` | Request headers or session cookie jar; sessions reference |
| `PlaywrightPlugin._containerProxyServer` | Unused field, no replacement needed |
| `Snapshotter._snapshotMemory`, `_memoryOverloadWarning`, `_snapshotEventLoop`, `_snapshotCpu`, `_snapshotClient`, `_pruneSnapshots` | ConcurrencySystem and load signals |
| `FileDownloadOptions`, `StreamHandlerContext`, `FileDownloadOptions.streamHandler` | BasicCrawler options and handler response body; HTTP/download reference |
| `playwrightUtils.registerUtilsToContext`, `puppeteerUtils.registerUtilsToContext` | ContextPipeline |
| `context.blockResources`, `context.cacheResponses` | Deprecated Puppeteer functions with explicit page; browser reference |
| `context.closeCookieModals`, `playwrightUtils.closeCookieModals`, `puppeteerUtils.closeCookieModals` | Explicit consent integration; configuration/context reference |
| `Configuration.systemInfoV2`, `CRAWLEE_SYSTEM_INFO_V2` | Remove; resource detection default |
| `checkAndSerialize`, `chunkBySize`, `maybeStringify` | KVS serialization with serializeValue/parseValue; storage reference |
| `BASIC_CRAWLER_TIMEOUT_BUFFER_SECS` | Internal timeout constant removed |
| `HttpResponse`, `HttpResponseWithoutBody`, `StreamingHttpResponse`, `ResponseTypes`, `BaseHttpResponseData`, `SimpleHeaders`, `processHttpRequestOptions`, `PlainResponse` | Native Response; HTTP reference |
| `GotScrapingHttpClient` from core | Import from `@crawlee/got-scraping-client` |
| `checkStorageAccess`, `withCheckedStorageAccess` | Transactions and withDirectStorageAccess; storage reference |
| `RequestHandlerResult`, Adaptive `preventDirectStorageAccess`, `commitResult` | StorageTransactionView and afterStorageCommit; browser/storage references |
| `IRequestList`, `SitemapRequestList`, `RequestQueueV1`, `RequestQueueV2`, `RequestProvider` | Loader/manager changes; requests reference |
| `StorageClient`, collection-client and lock types | StorageBackend contract; storage reference |
| `EVENT_SESSION_RETIRED`, `TieredProxy`, `TieredProxyOptions` | Session cleanup and proxy rotation; sessions reference |

An unchanged import may still be internal or have a changed signature. In particular AutoscaledPool, Snapshotter and SystemStatus remain exported as internals; read the concurrency reference before retaining them.
