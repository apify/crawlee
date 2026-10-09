# Imports and removed symbols

## Package moves

- Imports of crawler-only exports from `@crawlee/core` move to `@crawlee/basic`: sessions, Router, Statistics, error tracking, context types, autoscaling, enqueue option/pattern types, cookie helpers, and crawler-specific errors. The renamed `SitemapRequestLoader` also lives in basic. Check symbols individually; existing `crawlee`/crawler imports generally work. ContextPipeline, ConcurrencySystem and ThrottlingRequestManager are new APIs, not relocated v3 exports.
- Dictionary, Awaitable, Constructor, Cookie, QueueOperationInfo, AllowedHttpMethods and SearchParams need direct `@crawlee/types` imports/dependency. StorageBackend and StorageIdentifier remain reachable from core; IBrowserPool and NewPageOptions remain reachable from browser-pool.
- `EnqueueStrategy` stays exported from `@crawlee/utils` and is re-exported by `@crawlee/core` and `crawlee`.
- JSDOMCrawler and LinkeDOMCrawler require explicit `@crawlee/jsdom` and `@crawlee/linkedom` dependencies and imports. They are no longer exported by `crawlee`.
- Replace removed CheerioRoot with CheerioAPI/Cheerio from `cheerio`, Element from `domhandler`; declare direct dependencies.
- HTTP client classes move to `@crawlee/http-client` and `@crawlee/got-scraping-client`; read the HTTP reference for the changed contract.
- BrowserPool, its plugins, controllers and types are no longer re-exported by `crawlee`. Import them from `@crawlee/browser-pool`; crawler-specific factory functions remain available through `crawlee`.

## Utility changes

The `utils` object exported by `crawlee` is removed. Replace `utils.puppeteer` and `utils.playwright` with direct `puppeteerUtils` and `playwrightUtils` imports. Import `log`, `social`, `sleep`, `downloadListOfUrls` and `parseOpenGraph` directly for the other members. `utils.enqueueLinks` has no standalone replacement; use `context.enqueueLinks()`. Prefer existing context helpers for page-bound operations.

`RobotsFile` becomes `RobotsTxtFile`. `RobotsTxtFile.find(url, proxyUrl, options)` becomes `find(url, { proxyUrl, ...options })`, also supporting httpClient and logger. `getSitemaps`, `parseSitemaps` and `parseUrlsFromSitemaps` still accept `RobotsTxtFileSitemapsOptions`. Their `enqueueStrategy` defaults to `'same-hostname'`; deliberate cross-host discovery needs `'all'`. Only HTTP(S) URLs are allowed. Replace `ParseSitemapOptions.networkTimeouts` with the single `timeoutMillis` option.

`htmlToText`, `parseHandlesFromHtml` and `parseOpenGraph` are now async; await their results and update callers' return types.

`systemInfoV2` and `CRAWLEE_SYSTEM_INFO_V2` disappear; the new resource detection is the default. Utils no longer exports getMemoryInfo/MemoryInfo, isContainerized, isDocker, isLambda or getCgroupsVersion; they live on `@crawlee/core/internal` without semver guarantees. For direct application use, prefer reading equivalent OS or cgroup values explicitly.

filterUrl, matchesEnqueueStrategy and UNSUPPORTED_SCHEME_MESSAGE move to `@crawlee/utils/internal`; core filterRequestsByPatterns is removed. None has a public replacement; filtering belongs in enqueueLinks/addRequests.

Utils separates public helpers from `@crawlee/utils/internal`. Internal regex, blocked-detection, iterable and URL helpers move there, including URL_NO_COMMAS_REGEX, URL_WITH_COMMAS_REGEX, extractUrlsFromCheerio and tryAbsoluteURL. Core no longer re-exports parseArgument, schemas or tryAbsoluteURL. Prefer supported public helpers; internal imports have no semver guarantees. ArgumentValidationError stays exported by core.

`parseSitemap`, `SitemapUrl` and `expandShadowRoots` also move to `@crawlee/utils/internal` and disappear from `crawlee`. Prefer public `Sitemap.load()`, `Sitemap.fromXmlString()`, `Sitemap.tryCommonNames()` or `discoverValidSitemaps()` for sitemap parsing. `expandShadowRoots` is intended to run inside a browser page.

## Removed-member lookup

Use this lookup for errors naming old symbols; read the referenced topic for migration details.

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
| `playwrightUtils.registerUtilsToContext`, `puppeteerUtils.registerUtilsToContext` | ContextPipeline |
| `Configuration.systemInfoV2`, `CRAWLEE_SYSTEM_INFO_V2` | Remove; resource detection default |
| `BASIC_CRAWLER_TIMEOUT_BUFFER_SECS` | Internal timeout constant removed |
| `GotScrapingHttpClient` from core | Import from `@crawlee/got-scraping-client` |
| `CreateContextOptions` | ContextPipeline-driven context construction |
| `UrlPatternObject` | Use `UrlPatternInput`, `GlobInput`, `RegExpInput`; infer compiled pattern types |
| `PERSIST_STATE_KEY`, `MAX_POOL_SIZE` | SessionPool `persistStateKey` / `maxPoolSize` options; the old pool-size default is 1000 |
| `WithRequired` | Define the utility type locally if needed |
| `ErrorSnapshotter`, `SnapshotResult`, `ErrorTracker.errorSnapshotter`, `ErrorTracker.captureSnapshot` | Enable `saveErrorSnapshots` on Statistics or ErrorTracker; `addAsync()` captures the first occurrence, with URLs on `errorTracker.result` |
| `UrlList` | Inline `(string \| null)[]` |
| `puppeteerClickElements` | `puppeteerUtils.enqueueLinksByClickingElements()` or the context helper; its options type remains exported |
| `puppeteerRequestInterception` | `puppeteerUtils.addInterceptRequestHandler` / `removeInterceptRequestHandler`; `InterceptHandler` remains exported |
| Puppeteer top-level `BlockRequestsOptions`, `InjectFileOptions`, `InfiniteScrollOptions`, `SaveSnapshotOptions`, `CompiledScriptParams`, `CompiledScriptFunction` | Types remain under `puppeteerUtils`, such as `puppeteerUtils.SaveSnapshotOptions` |

| Other removed symbols | Reference |
| --- | --- |
| `context.blockResources`, `context.cacheResponses`, `puppeteerUtils.blockResources`, `puppeteerUtils.cacheResponses`; `RequestHandlerResult`, Adaptive `preventDirectStorageAccess`, `commitResult`; `PlaywrightLauncher`, `BrowserCrawler.launchContext`; `StagehandRequestHandler`, `stagehandUtils`, `AgentResult`, `StagehandLaunchContext.stagehandOptions`, `StagehandPlugin.getStagehandForBrowser`; `BrowserSpecification`, `GetFingerprintReturn`, browser-pool `FingerprintGenerator`, `BROWSER_POOL_EVENTS.BROWSER_CLOSED` | Browser reference |
| `FileDownloadOptions`, `StreamHandlerContext`, `FileDownloadOptions.streamHandler`; `HttpResponse`, `HttpResponseWithoutBody`, `StreamingHttpResponse`, `ResponseTypes`, `BaseHttpResponseData`, `SimpleHeaders`, `processHttpRequestOptions`, `PlainResponse`; `ResponseLike`, `BrowserLikeResponse`, `RedirectHandler`; `MinimumSpeedStream`, `ByteCounterStream` | HTTP/download reference |
| `checkAndSerialize`, `chunkBySize`, `maybeStringify`; `checkStorageAccess`, `withCheckedStorageAccess`; `StorageClient`, collection-client and lock types; `KeyValueStore.getInput`, `Configuration.inputKey`, `CRAWLEE_INPUT_KEY` | Storage reference |
| `EVENT_SESSION_RETIRED`, `TieredProxy`, `TieredProxyOptions` | Sessions reference |
| `IRequestList`, `SitemapRequestList`, `RequestQueueV1`, `RequestQueueV2`, `RequestProvider` | Requests reference |
| `context.closeCookieModals`, `playwrightUtils.closeCookieModals`, `puppeteerUtils.closeCookieModals`; `Configuration.defaultDatasetId`, `defaultKeyValueStoreId`, `defaultRequestQueueId`, `CRAWLEE_DEFAULT_*_ID` | Configuration/context reference |
| `HttpHook`, `CheerioHook`, `JSDOMHook`, `LinkeDOMHook`, `FileDownloadHook` | Crawler internals reference |

`RequestState` moves from core to basic, and `Request` splits from `CrawlingRequest`; read the requests reference for construction, stored records and custom-manager identity changes.

AutoscaledPool, Snapshotter and SystemStatus remain exported as internals; see the concurrency reference before retaining them.
