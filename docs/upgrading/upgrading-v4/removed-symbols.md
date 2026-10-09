---
id: removed-symbols
title: 'Upgrading to v4: removed symbols'
sidebar_label: Removed symbols
sidebar_position: 10
slug: /upgrading/upgrading-to-v4/removed-symbols
---

The full list of removed exports and members, for ctrl-F purposes. Where a replacement exists, it is noted inline. This page is part of the [Upgrading to v4](./upgrading-v4.md) guide.

## Removed symbols

- `BasicCrawler._cleanupContext` (protected) - this is now handled by the `ContextPipeline`
- `BasicCrawler.isRequestBlocked` (protected)
- `BasicCrawler.events` (protected) - this should be accessed via `BasicCrawler.serviceLocator`
- `BrowserRequestHandler` and `BrowserErrorHandler` types in `@crawlee/browser`
- `BrowserCrawler.userProvidedRequestHandler` (protected)
- `BrowserCrawler.requestHandlerTimeoutInnerMillis` (protected)
- `BrowserCrawler._enhanceCrawlingContextWithPageInfo` (protected)
- `BrowserCrawler._handleNavigation` (protected)
- `HttpCrawler.userRequestHandlerTimeoutMillis` (protected)
- `HttpCrawler._handleNavigation` (protected)
- `HttpCrawler._applyCookies` (protected) - cookie merging is now handled by `BaseHttpClient`
- `HttpCrawler._parseHTML` (protected)
- `HttpCrawler.use` and the `CrawlerExtension` class (experimental) - the `ContextPipeline` should be used for extending the crawler
- `BasicCrawler._tagUserHandlerError` (protected) - internal error-tagging helper, no longer part of the crawler surface
- `BasicCrawler.handledRequestsCount` setter (`@deprecated`) - the throw-on-assign guard is gone; the getter is now internal-only and the count is derived from `this.statistics`
- `PlaywrightPlugin._containerProxyServer` (public) - was an unused, never-populated field
- `Snapshotter._snapshotMemory`, `Snapshotter._memoryOverloadWarning`, `Snapshotter._snapshotEventLoop`, `Snapshotter._snapshotCpu`, `Snapshotter._snapshotClient`, `Snapshotter._pruneSnapshots` (all `@deprecated` protected stubs) - snapshotting is now handled by the individual load signals, and the `Snapshotter` itself is internal to `ConcurrencySystem`; there is no longer a public API for reading raw resource snapshots
- `FileDownloadOptions.streamHandler` - streaming should now be handled directly in the `requestHandler` instead
- `playwrightUtils.registerUtilsToContext` and `puppeteerUtils.registerUtilsToContext` - this is now added to the context via `ContextPipeline` composition
- `context.blockResources` and `context.cacheResponses`, and the `puppeteerUtils.blockResources` / `puppeteerUtils.cacheResponses` functions behind them — both had a severe performance cost in recent Puppeteer versions and were already deprecated. Use `puppeteerUtils.blockRequests(page, options)`, which blocks URL patterns over CDP without disabling the browser cache. If you were caching responses, rely on the in-browser cache instead.
- `context.closeCookieModals`, `playwrightUtils.closeCookieModals` and `puppeteerUtils.closeCookieModals` — removed along with the optional `idcac-playwright` peer dependency (see [Crawling context no longer includes `closeCookieModals`](./upgrading-v4.md#crawling-context-no-longer-includes-closecookiemodals) and the [cookie modals guide](../../guides/cookie-modals.mdx))
- `Configuration.systemInfoV2` / `CRAWLEE_SYSTEM_INFO_V2` environment variable — the v2 behavior is now the default (see [Available resource detection](./utils-and-types.md#available-resource-detection))
- `KeyValueStore.getInput()` and `Configuration.inputKey` / `CRAWLEE_INPUT_KEY` — reading the run input moved to the Apify SDK (see [`KeyValueStore.getInput()` and `Configuration.inputKey` moved to the Apify SDK](./upgrading-v4.md#keyvaluestoregetinput-and-configurationinputkey-moved-to-the-apify-sdk))
- `Configuration.defaultDatasetId` / `defaultKeyValueStoreId` / `defaultRequestQueueId` and their `CRAWLEE_DEFAULT_*_ID` environment variables — the default storage is addressed by a reserved alias, not by a configurable ID. Open a storage by name if you need a specific one.
- `checkAndSerialize` and `chunkBySize` functions (from `@crawlee/core`) — value (de)serialization now lives in the `KeyValueStore` frontend; use `serializeValue` / `parseValue` (see [`maybeStringify` is removed](./storage-backends.md#maybestringify-is-removed))
- `BASIC_CRAWLER_TIMEOUT_BUFFER_SECS` constant (from `@crawlee/basic`) — was an internal timeout buffer, no longer exported
- `HttpResponse`, `HttpResponseWithoutBody`, `StreamingHttpResponse`, `ResponseTypes`, `BaseHttpResponseData`, `SimpleHeaders`, `processHttpRequestOptions`, and `GotScrapingHttpClient` (from `@crawlee/core`) — the HTTP client surface moved to `@crawlee/http-client` / `@crawlee/got-scraping-client` (see [HTTP client packages and `BaseHttpClient` reshaped](./http-clients.md#http-client-packages-and-basehttpclient-reshaped))
- `StreamHandlerContext` and `FileDownloadOptions` types (from `@crawlee/http`) — see [`FileDownload` now extends `BasicCrawler`](./upgrading-v4.md#filedownload-now-extends-basiccrawler-and-no-longer-takes-filedownloadoptions)
- `PlainResponse` type (from `@crawlee/http`) — it wrapped the `got-scraping` response and is gone along with the rest of the old HTTP response surface (see [`CrawlingContext.response` is now of type `Response`](./upgrading-v4.md#crawlingcontextresponse-is-now-of-type-response))
- `checkStorageAccess`, `withCheckedStorageAccess` and the `RequestHandlerResult` type — superseded by the storage transaction mechanism; use `withDirectStorageAccess()` and `StorageTransactionView` (see [Storage writes in request handlers are transactional](./upgrading-v4.md#storage-writes-in-request-handlers-are-transactional))
- `CreateContextOptions` type (from `@crawlee/basic`) — a leftover of the pre-`ContextPipeline` context-creation design, unused by the library itself; context construction is now driven by `ContextPipeline`
- `ResponseLike` interface (from `@crawlee/core`) — a vestige of the pre-`fetch` HTTP implementation with no consumers; `getCookiesFromResponse()` has always taken a native `Response`
- `UrlPatternObject` (from `@crawlee/core`) — the *compiled* form of a URL pattern, produced internally by the `enqueueLinks()` machinery. Keep using `UrlPatternInput` / `GlobInput` / `RegExpInput`, which are unchanged, and let the return type of the pattern helpers be inferred
- `PERSIST_STATE_KEY` (from `@crawlee/core`) — to change where a session pool persists its state, pass `persistStateKey` to `SessionPool`
- `MAX_POOL_SIZE` constant (from `@crawlee/core`) — was the internal default for `SessionPoolOptions.maxPoolSize` (1000); inline the literal if you were reading it
- `WithRequired` type (from `@crawlee/core`) — a bare TypeScript utility that was never crawlee vocabulary; `LoadedRequest` no longer goes through it, so declare your own if you were using it
- `ErrorSnapshotter` and its `SnapshotResult` return type (from `@crawlee/core`) — an implementation detail of `ErrorTracker`. Error snapshotting is opt-in through `new Statistics({ saveErrorSnapshots: true })` (or `new ErrorTracker({ saveErrorSnapshots: true })`)
- `ErrorTracker.errorSnapshotter` and `ErrorTracker.captureSnapshot()` — both private now. Snapshotting is driven from `addAsync()` on the first occurrence of each distinct error; the captured URLs surface as `firstErrorScreenshotUrl` / `firstErrorHtmlUrl` on the corresponding node of `errorTracker.result`, as before
- `MinimumSpeedStream` and `ByteCounterStream` (from `@crawlee/http`) — these `Transform` factories existed only to be piped inside `FileDownloadOptions.streamHandler`, which v4 removed. Compose your own `Transform` around `context.response.body` in the `requestHandler` instead; see the [file download with streams example](https://crawlee.dev/js/docs/examples/file-download-stream)
- `HttpHook`, `FileDownloadHook`, `CheerioHook`, `JSDOMHook` and `LinkeDOMHook` types — see [Removed navigation hook type aliases](./internals.md#removed-navigation-hook-type-aliases)
- The `puppeteerClickElements` namespace (from `@crawlee/puppeteer`) — `clickElements`, `clickElementsAndInterceptNavigationRequests` and `isTargetRelevant` were internal helpers. Use `puppeteerUtils.enqueueLinksByClickingElements()`, or `context.enqueueLinksByClickingElements()` inside a request handler; the `EnqueueLinksByClickingElementsOptions` type is still exported directly from `@crawlee/puppeteer`
- The `puppeteerRequestInterception` namespace (from `@crawlee/puppeteer`) — it only duplicated `puppeteerUtils.addInterceptRequestHandler` / `puppeteerUtils.removeInterceptRequestHandler`, which are unchanged. The `InterceptHandler` type is still exported directly from `@crawlee/puppeteer`
- The top-level type exports `BlockRequestsOptions`, `InjectFileOptions`, `InfiniteScrollOptions`, `SaveSnapshotOptions`, `CompiledScriptParams` and `CompiledScriptFunction` (from `@crawlee/puppeteer`) — the types themselves are unchanged and remain reachable through the namespace, e.g. `import { puppeteerUtils } from 'crawlee'; let options: puppeteerUtils.SaveSnapshotOptions;`. This matches `@crawlee/playwright`, which never exported them at the top level. `PuppeteerDirectNavigationOptions` is unaffected

### The protected `BasicCrawler.crawlingContexts` map is removed

The property was not used by the library itself and re-implementing the functionality in user code is fairly straightforward.
