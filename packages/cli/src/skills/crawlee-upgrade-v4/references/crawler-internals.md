# Crawler internals

Read this only for subclasses, protected overrides, internal access or explicit generic annotations. Prefer handlers, hooks, `extendContext`, ContextPipeline and collaborator interfaces over rebuilding old internal access.

## Renamed and private members

Protected methods lose underscore prefixes, including BasicCrawler `_runRequestHandler`, `_init`, `_throwOnBlockedRequest`, `_getMessageFromError`, `_getCookieHeaderFromRequest`, and BrowserCrawler `_navigationHandler`. BrowserPlugin `_addProxyToLaunchOptions`, `_isChromiumBasedBrowser` and `_throwAugmentedLaunchError` do too. BrowserLauncher `_getDefaultHeadlessOption` becomes `getDefaultHeadlessOption` and remains protected. The internal PlaywrightBrowser `_setBrowserType` becomes `setBrowserType`.

Do not strip every underscore. BrowserPlugin `_launch` and BrowserController `_close`, `_kill`, `_newPage`, `_getCookies`, `_setCookies` keep theirs because public wrappers occupy the plain names.

Many formerly public/protected helpers are now private. Private fields use native `#` fields and cannot be accessed with `as any`, bracket indexing, enumeration or serialization. Do not bypass this with casts. Rewrite supported behavior through public extension points, or report an unsupported use case.

Common affected areas include crawler task-loop and navigation internals, session pool maps and creation helpers, queue caches and locking, proxy selection helpers, statistics persistence hooks, browser blocked-request helpers, launch-path helpers and rendering predictor internals. Options still supported in constructors need no direct field access. `LaunchContext.extend()` rejects all declared fields, including fingerprint and proxyUrl; assign those directly and reserve extend for application fields.

`getMessageFromError()` overrides must return `string`. Configure block detection with `retryOnBlocked` / `blockedStatusCodes`, or throw `SessionError` from a post-navigation hook. `BLOCKED_STATUS_CODES` is readonly; copy it before modifying a local list. `Session.getState()` and `SessionOptions.log` are internal and have no semver guarantees.

Crawler `running`, `sessionPool` and `browserPool` become read-only. `teardown()` releases per-run resources; `destroy()` releases crawler-owned resources that outlive a run. Supplied collaborators remain caller-owned. Explicit disposal of a finished crawler is optional; on Node.js 22 use methods, since `await using` needs Node.js 24.

Use `RequestQueue.open()` rather than its internal constructor, which loses its configuration argument. Use `Router.create()` instead of its now-private constructor. Use public `RobotsTxtFile.from`, `Sitemap.load` or `Sitemap.fromXmlString` instead of private factories.

## Context and generics

Crawler classes and options add context-extension generic parameters for ContextPipeline. Explicitly narrowed subclasses may require matching parameters and a `contextPipelineBuilder`. Preserve inferred types when possible.

`RequestHandler` and `ErrorHandler` no longer wrap context with LoadedContext. ErrorHandler takes base and extended context types and receives base context plus a partial extension. `RestrictedCrawlingContext` and `LoadedContext` are no longer exported from `@crawlee/basic`. Browser hook types become generic type aliases over userData; replace interface extension with intersection types.

`BrowserCrawler` drops its third `LaunchOptions` type argument along with the instance `launchContext` field. Remove that argument from subclasses and adjust explicit generics. The separate statistics extension parameter is covered in the statistics reference.

`HttpHook`, `CheerioHook`, `JSDOMHook`, `LinkeDOMHook` and `FileDownloadHook` are removed. Prefer hook types inferred from crawler options so pre-navigation hooks do not require a parsed body, `$` or page. A standalone HTTP hook can use `InternalHttpHook<CrawlingContext>` when an explicit pre-navigation type is necessary. `FileDownload` has no navigation hooks.

`HttpCrawler.use` and `CrawlerExtension` are removed. Use ContextPipeline composition for extension and cleanup. BasicCrawler `_cleanupContext`, `crawlingContexts`, and old navigation/parser/utility-registration hooks disappear. Inspect the removed-symbol reference for specific names rather than inventing same-name replacements.

## RecoverableState

Custom `serialize` and `deserialize` now work on values rather than strings and also accept Standard Schema implementations, such as zod codecs. Custom v3 records do not load automatically; preserve or translate data deliberately.

`reset()` is synchronous and resets memory without clearing the persisted record; `resetStore()` clears storage. Reset can establish state without initialize. Old `persistStateKvsName` and `persistStateKvsId` become one `keyValueStore` option accepting a store or open promise. Use a `defaultState` factory when structuredClone cannot recreate the state. `persistenceTimeoutMillis` is available.

`teardown()` is no longer terminal; initialize can open another persistence window. Periodic and teardown persistence failures warn rather than throw, while direct `persistState()` still throws. These custom-state changes do not imply that built-in SessionPool and RequestList record shapes changed.
