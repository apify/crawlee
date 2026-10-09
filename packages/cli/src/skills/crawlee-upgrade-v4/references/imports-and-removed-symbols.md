# Imports and removed symbols

## Package moves

- Imports of crawler-only exports from `@crawlee/core` move to `@crawlee/basic`: sessions, Router, Statistics, error tracking, context types, autoscaling, enqueue option/pattern types, cookie helpers, and crawler-specific errors. The renamed `SitemapRequestLoader` also lives in basic. Imports through `crawlee` or crawler packages generally remain available. Check individual symbols rather than replacing all core imports. `ContextPipeline`, `ConcurrencySystem` and `ThrottlingRequestManager` are new v4 APIs from basic, not v3 exports to relocate.
- General utility types such as Dictionary, Awaitable, Constructor, Cookie, QueueOperationInfo and AllowedHttpMethods need direct imports and a dependency on `@crawlee/types`. SearchParams moves there too. StorageBackend and StorageIdentifier remain reachable from core; IBrowserPool and NewPageOptions remain reachable from browser-pool.
- `EnqueueStrategy` moves from utils to `@crawlee/core`, also available through `crawlee`.
- JSDOMCrawler and LinkeDOMCrawler require explicit `@crawlee/jsdom` and `@crawlee/linkedom` dependencies and imports. They are no longer exported by `crawlee`.
- CheerioRoot is removed. Import CheerioAPI or Cheerio from `cheerio` and Element from `domhandler`, with direct dependencies where used. Crawlee packages no longer re-export those types.
- HTTP client classes move to `@crawlee/http-client` and `@crawlee/got-scraping-client`; read the HTTP reference for the changed contract.
- BrowserPool, its plugins, controllers and types are no longer re-exported by `crawlee`. Import them from `@crawlee/browser-pool`; crawler-specific factory functions remain available through `crawlee`.

## Utility changes

The `utils` object exported by `crawlee` is removed. Replace `utils.puppeteer` and `utils.playwright` with direct `puppeteerUtils` and `playwrightUtils` imports. Import `log`, `enqueueLinks`, `social`, `sleep`, `downloadListOfUrls` and `parseOpenGraph` directly for the other members. Page-bound helpers may already be available on the crawling context.

`RobotsFile` becomes `RobotsTxtFile`. `RobotsTxtFile.find(url, proxyUrl, options)` becomes `find(url, { proxyUrl, ...options })`, also supporting httpClient and logger. `getSitemaps`, `parseSitemaps` and `parseUrlsFromSitemaps` still accept `RobotsTxtFileSitemapsOptions`. Their `enqueueStrategy` defaults to `'same-hostname'`; use `'all'` when cross-host sitemap URLs are intentional. Non-HTTP(S) sitemap URLs are always excluded. Replace `ParseSitemapOptions.networkTimeouts` with the single `timeoutMillis` option.

`htmlToText`, `parseHandlesFromHtml` and `parseOpenGraph` are now async; await their results and update callers' return types.

`systemInfoV2` and `CRAWLEE_SYSTEM_INFO_V2` disappear; the new resource detection is the default. Utils no longer exports getMemoryInfo/MemoryInfo, isContainerized, isDocker, isLambda or getCgroupsVersion. For direct application use, read equivalent OS or cgroup values explicitly.

Removed filterUrl, matchesEnqueueStrategy, UNSUPPORTED_SCHEME_MESSAGE and core filterRequestsByPatterns have no public replacement. Filtering belongs in enqueueLinks/addRequests.

Utils separates public helpers from `@crawlee/utils/internal`. Internal regex, blocked-detection, iterable and URL helpers move there, including URL_NO_COMMAS_REGEX, URL_WITH_COMMAS_REGEX, extractUrlsFromCheerio and tryAbsoluteURL. Core no longer re-exports parseArgument, schemas or tryAbsoluteURL. Prefer supported public helpers; internal imports have no semver guarantees. ArgumentValidationError stays exported by core.

`parseSitemap`, `SitemapUrl` and `expandShadowRoots` also move to `@crawlee/utils/internal` and disappear from `crawlee`. Prefer public `Sitemap.load()`, `Sitemap.fromXmlString()`, `Sitemap.tryCommonNames()` or `discoverValidSitemaps()` for sitemap parsing. `expandShadowRoots` is intended to run inside a browser page.

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
| `context.blockResources`, `context.cacheResponses`, `puppeteerUtils.blockResources`, `puppeteerUtils.cacheResponses` | `puppeteerUtils.blockRequests(page, options)` and the browser cache; browser reference |
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
| `KeyValueStore.getInput`, `Configuration.inputKey`, `CRAWLEE_INPUT_KEY` | `Actor.getInput()` for Actor projects; input and purge behavior in storage reference |
| `Configuration.defaultDatasetId`, `defaultKeyValueStoreId`, `defaultRequestQueueId`, `CRAWLEE_DEFAULT_*_ID` | Open and pass specific storages explicitly |
| `CreateContextOptions` | ContextPipeline-driven context construction |
| `ResponseLike`, `BrowserLikeResponse`, `RedirectHandler` | Native Response and the HTTP client contract |
| `UrlPatternObject` | Use `UrlPatternInput`, `GlobInput`, `RegExpInput`; infer compiled pattern types |
| `PERSIST_STATE_KEY`, `MAX_POOL_SIZE` | SessionPool `persistStateKey` / `maxPoolSize` options; the old pool-size default is 1000 |
| `WithRequired` | Define the utility type locally if needed |
| `ErrorSnapshotter`, `SnapshotResult`, `ErrorTracker.errorSnapshotter`, `ErrorTracker.captureSnapshot` | Enable `saveErrorSnapshots` on Statistics or ErrorTracker; `addAsync()` captures the first occurrence, with URLs on `errorTracker.result` |
| `MinimumSpeedStream`, `ByteCounterStream` | Handler-owned transforms around response streams; HTTP/download reference |
| `HttpHook`, `CheerioHook`, `JSDOMHook`, `LinkeDOMHook`, `FileDownloadHook` | Infer hook types from crawler options; crawler internals reference |
| `UrlList` | Inline `(string \| null)[]` |
| `PlaywrightLauncher`, `BrowserCrawler.launchContext` | `launchPlaywright()` / pool factories and caller-owned options; browser reference |
| `StagehandRequestHandler`, `stagehandUtils`, `AgentResult`, `StagehandLaunchContext.stagehandOptions`, `StagehandPlugin.getStagehandForBrowser` | Stagehand replacements in browser reference |
| `BrowserSpecification`, `GetFingerprintReturn`, browser-pool `FingerprintGenerator`, `BROWSER_POOL_EVENTS.BROWSER_CLOSED` | Fingerprint types and controller events; browser reference |
| `puppeteerClickElements` | `puppeteerUtils.enqueueLinksByClickingElements()` or the context helper; its options type remains exported |
| `puppeteerRequestInterception` | `puppeteerUtils.addInterceptRequestHandler` / `removeInterceptRequestHandler`; `InterceptHandler` remains exported |
| Puppeteer top-level `BlockRequestsOptions`, `InjectFileOptions`, `InfiniteScrollOptions`, `SaveSnapshotOptions`, `CompiledScriptParams`, `CompiledScriptFunction` | Types remain under `puppeteerUtils`, such as `puppeteerUtils.SaveSnapshotOptions` |

`RequestState` moves from core to basic, and `Request` splits from `CrawlingRequest`; read the requests reference for construction, stored records and custom-manager identity changes.

An unchanged import may still be internal or have a changed signature. In particular AutoscaledPool, Snapshotter and SystemStatus remain exported as internals; read the concurrency reference before retaining them.
