---
id: internals
title: 'Upgrading to v4: subclassing and internals'
sidebar_label: Subclassing and internals
sidebar_position: 1
slug: /upgrading/upgrading-to-v4/internals
---

Skip this section unless you subclass Crawlee classes, override `protected` members, or read fields that were never documented. This page is part of the [Upgrading to v4](./upgrading-v4.md) guide.

## Underscore prefix is removed from many protected and private methods

The leading underscore was dropped from protected and private class members across the codebase. The most visible rename is:

- `BasicCrawler._runRequestHandler` -> `BasicCrawler.runRequestHandler`

If you subclass a crawler or implement a custom browser plugin, these `protected` extension points lost their underscore too:

- `BasicCrawler._init` -> `init`
- `BasicCrawler._throwOnBlockedRequest` -> `throwOnBlockedRequest`
- `BasicCrawler._getMessageFromError` -> `getMessageFromError`
- `BasicCrawler._getCookieHeaderFromRequest` -> `getCookieHeaderFromRequest`
- `BrowserCrawler._navigationHandler` -> `navigationHandler` (including the `PlaywrightCrawler`, `PuppeteerCrawler` and `StagehandCrawler` overrides)
- `BrowserPlugin._addProxyToLaunchOptions` -> `addProxyToLaunchOptions`
- `BrowserPlugin._isChromiumBasedBrowser` -> `isChromiumBasedBrowser`
- `BrowserPlugin._throwAugmentedLaunchError` -> `throwAugmentedLaunchError`

The `@internal` `PlaywrightBrowser._setBrowserType` was renamed the same way, to `setBrowserType`.

A handful of hooks intentionally keep the underscore, because the un-prefixed name is taken by their public wrapper method: `BrowserPlugin._launch` (wrapped by `launch()`) and `BrowserController._close`, `_kill`, `_newPage`, `_getCookies`, `_setCookies` (wrapped by the same names without the underscore). Custom plugin or controller implementations override these under their existing names, unchanged.

Members that were also made `private` in the same pass are listed under [Unintentionally exposed internals are now private](#unintentionally-exposed-internals-are-now-private) below.

## Private properties are native `#` fields now

Private class properties across the codebase were converted from TypeScript's compile-time `private` to native ECMAScript private fields (`#name`). Where a `private _foo` field backed a `get foo()` accessor, the field is now `#foo` — the public accessor is unchanged.

TypeScript's `private` was purely a compile-time construct: the properties still existed on the instances at runtime, so code could reach them via `(crawler as any).something` or `crawler['something']`, and they showed up in `Object.keys()`, object spread and `JSON.stringify()`. Native `#` fields close that hole — they are inaccessible outside the declaring class and invisible to enumeration and serialization. If you were reaching into any of them, that now fails at runtime, not just in the type checker. As with the visibility tightening above, the supported extension points (handlers, hooks, `ContextPipeline` composition and the `ISessionPool` / `IBrowserPool` / `IRequestManager` interfaces) are the way to go; open an issue if something you need is missing.

One related behavior change: `LaunchContext.extend()` now consistently rejects all declared fields as reserved keys — including `fingerprint` and `proxyUrl`, which previously slipped through the reserved-name check. Set those directly instead (e.g. `launchContext.fingerprint = ...`); `extend()` is only for attaching your own extra fields.

## Unintentionally exposed internals are now private

A number of class members were `public` or `protected` only by accident — they were never meant to be part of the extension surface, are not used by any subclass, and in most cases also carried a leading underscore to signal that. In v4 they are `private` (and where it applies, `readonly`). If you were reaching into any of these — either to read internal state or to override a helper in a subclass — that no longer compiles.

This is intentional: these were never a supported API. If you relied on overriding one of the now-private helpers, the supported extension points (the `requestHandler`, `errorHandler`, `failedRequestHandler`, `preNavigationHooks`/`postNavigationHooks`, `ContextPipeline` composition, and the `ISessionPool` / `IBrowserPool` / `IRequestManager` interfaces) should cover the same use cases. If something you genuinely need is missing, open an issue.

The change spans, among others:

- **`BasicCrawler`** — `running`, `hasFinishedBefore`, `unexpectedStop`, `requestHandlerTimeoutMillis`, `sameDomainDelayMillis`, `domainAccessedTime`, `handledRequestsCount`, `statusMessageLoggingInterval`, `statusMessageCallback`, `ignoreHttpErrorStatusCodes`, `taskLoopOptions` (was `autoscaledPoolOptions`), `autoscaledPool`, `respectRobotsTxtFile`, and the helpers `buildBasicContextPipeline`, `validateRequestUserData`, `pauseOnMigration`, `fetchNextRequest`, `delayRequest`, `handleRequest`, `timeoutAndRetry`, `isTaskReadyFunction`, `defaultIsFinishedFunction`, `requestFunctionErrorHandler`, `handleFailedRequestHandler`, `canRequestBeRetried`
- **`HttpCrawler`** — `preNavigationHooks`, `postNavigationHooks`, `saveResponseCookies`, `navigationTimeoutMillis`, `suggestResponseEncoding`, `forceResponseEncoding`, `supportedMimeTypes`, and the helpers `requestFunction`, `parseResponse`, `getRequestOptions`, `encodeResponse`, `extendSupportedMimeTypes`, `handleRequestTimeout`
- **`AutoscaledPool`** — the whole class is `@internal` in v4, so its members are not enumerated here; see [`AutoscaledPool` is no longer public API](./autoscaling.md#autoscaledpool-is-no-longer-public-api)
- **`SessionPool`** — all pool internals (`log`, `maxPoolSize`, `createSessionFunction`, `keyValueStore`, `sessions`, `sessionMap`, `sessionOptions`, `persistStateKey`, `persistStateKeyValueStoreId`, `events`, `persistenceOptions`, `sessionReuseStrategy`, and the helpers `ensureInitialized`, `maybeLoadSessionPool`, `registerSession`, `createSession`, `hasSpaceForSession`, `pickSession`, `removeRetiredSessions`, `getRandomIndex`, `defaultCreateSessionFunction`)
- **`Session`** — `maybeSelfRetire` (`userData` is now `readonly`)
- **`RequestList`** — all `_`-prefixed helpers (`addFetchedRequests`, `addPersistedRequests`, `addRequest`, `addRequestsFromSources`, `ensureInProgress`, `ensureIsInitialized`, `ensureUniqueKeyValid`, `fetchRequestsFromUrl`, `getPersistedState`, `loadStateAndPersistedRequests`, `persistRequests`, `restoreState`)
- **`RequestQueue`** — `proxyConfiguration`, `requestCache`, `requestSeenCache`, `queuePausedForMigration`, `inProgressRequestBatchCount`, `expectedRequestProcessingSecs`, `httpClient`, `events`, and the helpers `cacheRequest`, `fetchRequestsFromUrl`, `addFetchedRequests` (`id`, `name`, `backend`, `log` are now `readonly`)
- **`ProxyConfiguration`** — `nextCustomUrlIndex`, `proxyUrls`, `newUrlFunction`, and the helpers `handleProxyUrlsList`, `callNewUrlFunction`, `throwCannotCombineCustomMethods`, `throwNoOptionsProvided` (the internal `log` field and `usedProxyUrls` map are removed; `isManInTheMiddle` is now `readonly`)
- **`Statistics`** — `saveRetryCountForRequest` (was `saveRetryCountForJob`), `teardown`, `keyValueStore` (`errorTracker`, `errorTrackerRetry` are now `readonly`, and `state` / `requestRetryHistogram` are getters)
- **`SystemStatus`** — `isSystemIdle`
- **`Router`** — the constructor is now `private`; use the static `Router.create()` factory
- **`BaseHttpClient`** — `log` (subclasses receive it via the constructor `logger` option instead of reading `this.log`)
- **`JSDOMCrawler`** — `runScripts`, `hideInternalConsole`, `virtualConsole`
- **`AdaptivePlaywrightCrawler`** — `commitResult`, `allowStorageAccess`, `enqueueLinks`
- **`RenderingTypePredictor`** — `calculateFeatureVector`, `retrain`
- **`BrowserCrawler`** — `navigationTimeoutMillis`, `preNavigationHooks`, `postNavigationHooks`, `saveResponseCookies` (now `private readonly`; configure them through the constructor options as before), and the helpers `isRequestBlocked`, `applyCookies` (was `_applyCookies`), `handleNavigationTimeout` (was `_handleNavigationTimeout`), `throwIfProxyError` (was `_throwIfProxyError`)
- **`BrowserLauncher`** — the helpers `getChromeExecutablePath`, `getTypicalChromeExecutablePath`, `validateProxyUrlProtocol` (were `_`-prefixed). `getDefaultHeadlessOption` (was `_getDefaultHeadlessOption`) stays `protected` — it is an override point (`PuppeteerLauncher` overrides it) — but lost its underscore prefix
- **`RobotsTxtFile.load` and `Sitemap.parse`** — internal static factory helpers, now `private` (use the public `RobotsTxtFile.from` / `Sitemap.load` / `Sitemap.fromXmlString` entry points)
- Various internal fields on `BrowserController` (`id`, `browserPlugin`) and `BrowserPlugin` (`name`, `library`, `launchOptions`, `proxyUrl`, `userDataDir`, `browserPerProxy`, `ignoreProxyCertificate`) are now `readonly` (the `log` field on both is off the public surface entirely — see [`BrowserPool` internals are private](./browser-management.md#browserpool-internals-are-private))

The `running` and `hasFinishedBefore` flags on `BasicCrawler` were internal run-state bookkeeping for the re-run logic. If you were polling `crawler.running` to tell whether a crawl was in progress, track that yourself around the `crawler.run()` promise instead.

## Declarations that are now `@internal`

These are still present at runtime, but they are excluded from the documented surface and can change without a major version bump: `Session.getState()`, `SessionOptions.log`, `Request.skippedReason` and `RestrictedCrawlingContext.id`.

`BLOCKED_STATUS_CODES` is now typed `readonly number[]`. Copy it (`[...BLOCKED_STATUS_CODES]`) if you were mutating it.

## `HttpCrawler.isRequestBlocked` is now private

Block detection is configured through `retryOnBlocked` and `blockedStatusCodes`; to add your own checks, throw a `SessionError` from a `postNavigationHook`.

## The protected `getMessageFromError()` returns `string`

`BasicCrawler.getMessageFromError()` previously widened its return type to `string | TimeoutError | undefined`. Overrides must now return a `string`, and callers can drop any `as string` casts.

## The `RequestQueue` constructor no longer takes a `Configuration`

The internal `RequestQueue` constructor dropped its second `config: Configuration` parameter (it also stopped exposing a `protected config` field). You should not be constructing `RequestQueue` directly anyway — use `RequestQueue.open()`, which resolves configuration for you.

## Crawler generic parameters and handler types changed

To support the new `ContextPipeline` / `extendContext` composition, the crawler classes gained additional generic type parameters. `BasicCrawler<Context>` is now `BasicCrawler<Context, ContextExtension, ExtendedContext>`, and the same pattern was propagated to `HttpCrawler`, `CheerioCrawler`, `JSDOMCrawler`, `LinkeDOMCrawler`, `PuppeteerCrawler`, `PlaywrightCrawler`, `StagehandCrawler`, and their `*Options` interfaces. This only affects you if you **explicitly annotated** crawler generics or **subclassed** a crawler while narrowing its `Context` — in that case the compiler now expects the extra parameters (and a matching `contextPipelineBuilder`). Most users, who let the types be inferred, are unaffected.

The exported handler types were reshaped accordingly. `ErrorHandler` and `RequestHandler` no longer wrap their context in `LoadedContext<...>`; `ErrorHandler` now takes two type parameters (`ErrorHandler<BaseContext, ExtendedContext>`), receiving `inputs: BaseContext & Partial<ExtendedContext>`. The `RestrictedCrawlingContext` and `LoadedContext` types are no longer exported from `@crawlee/basic`. If you imported or annotated these directly, update the references; if you only used the crawler options' `requestHandler` / `errorHandler` / `failedRequestHandler` callbacks with inferred parameter types, nothing changes.

## `Request` is split into `Request` and `CrawlingRequest`

`Request` in `@crawlee/core` is now just the stored record: URL, method, headers, payload, `userData`, `label` and the processing state a request queue keeps (`id`, `retryCount`, `errorMessages`, `handledAt`, `loadedUrl`). Everything a crawler reads off a request — `skipNavigation`, `crawlDepth`, `sessionId`, `maxRetries`, `state`, `pushErrorMessage()` — lives on `CrawlingRequest` in `@crawlee/basic`, which is what `request` is in every request handler and hook. `RequestState` moved along with it, so import it from `@crawlee/basic` (or `crawlee`), not `@crawlee/core`. Handler code is unaffected; the change only shows if you construct requests yourself or read them straight from a request manager:

- The options are unchanged: `new Request({ url, skipNavigation: true, maxRetries: 2 })` and `queue.addRequest({ url, sessionId })` still record the settings, they just are not readable as properties on the core class. Where you need them, `CrawlingRequest.fromSchema(request)` rebuilds the crawler view.
- `RequestOptions` no longer accepts `id` or `handledAt`, and the constructor ignores `retryCount`, `errorMessages` and `loadedUrl`. A request coming back from a storage is rebuilt with `Request.fromSchema(record)`, which is also what `RequestQueue` does internally.
- `RequestOptions.skippedReason` and `Request.skippedReason` are removed. They were an internal side-channel for reporting `maxCrawlDepth` skips out of a `transformRequestFunction`; the depth check no longer runs inside the transform, so nothing writes them.
- `crawlingContext.request` is never the object your request manager handed out — the crawler rebuilds it as a `CrawlingRequest`. With a `RequestQueue` that was already true (requests are rebuilt from the stored record on every fetch), and in v4 `RequestList` and `SitemapRequestLoader` feed the crawler through a queue too; the change is only observable with a custom `IRequestManager` whose `fetchNextRequest()` returned its own instances. The object passed back to `reclaimRequest()` / `markRequestAsHandled()` is the crawler's copy, so match on `uniqueKey` (or `id`), not by identity.

## Navigation hook types are now generic

`PlaywrightHook`, `PuppeteerHook` and `StagehandHook` are now type aliases (previously interfaces) generic over the request's `userData` type. A hook that types its context — via the generic (e.g. `PlaywrightHook<MyUserData>`) or an explicit context annotation — is now assignable to the `preNavigationHooks` / `postNavigationHooks` options of an untyped crawler. If you extended one of these interfaces, use an intersection type instead.

## Removed navigation hook type aliases

The `HttpHook`, `CheerioHook`, `JSDOMHook`, `LinkeDOMHook` and `FileDownloadHook` type aliases were removed. None of them could actually type a `preNavigationHooks` or `postNavigationHooks` entry: both options are typed over the *pre-navigation* crawling context, while these aliases closed over the fully parsed one — so a function annotated with them required the pre-navigation context to already supply `$`, `body` or `window`, and assignment was rejected. (`FileDownload` has no hook options at all.)

Let the hook be inferred from the options object, or annotate its parameter with the crawler's own context type:

```diff
-const hook: CheerioHook = async (ctx) => { /* ... */ };
+const hook = async (ctx: CheerioCrawlingContext) => { /* ... */ };

 new CheerioCrawler({ preNavigationHooks: [hook] });
```

To type a standalone hook against the pre-navigation context, use `InternalHttpHook<CrawlingContext>`.

## `RecoverableState` reshaped

`serialize` and `deserialize` now take and return values rather than strings (so v3 records will not load) and each also accept a [Standard Schema](https://standardschema.dev) — a zod codec works as `deserialize` directly — `reset()` is synchronous, no longer clears the persisted record (the new `resetStore()` does) and doubles as a way to establish the state without awaiting `initialize()`, `persistStateKvsName` and `persistStateKvsId` collapsed into a single `keyValueStore` option taking a store (or a pending `KeyValueStore.open()`), `defaultState` also accepts a factory (which you need for a state `structuredClone` cannot rebuild, as the deep copy no longer goes through `serialize`/`deserialize`), and there is a new `persistenceTimeoutMillis` option. `teardown()` is no longer terminal — `initialize()` can be called again to open another persistence window — and a write that fails during a periodic `PERSIST_STATE` or during `teardown()` is warned about rather than thrown. A direct `persistState()` still throws.

## The `log` property is typed as `CrawleeLogger`

The `log` property exposed throughout the public API (on the crawling context, `Statistics`, `EventManager`, `SessionOptions`, `Dataset`, etc.) is now typed as the `CrawleeLogger` interface (from `@crawlee/types`) rather than the concrete `Log` class from `@apify/log`. If you consume it structurally — calling `log.info(...)`, `log.debug(...)`, `log.child(...)` — nothing changes. You only need to act if you explicitly annotated a variable or parameter with the `Log` type from `@apify/log` and assigned `context.log` to it; type it as `CrawleeLogger` instead.
