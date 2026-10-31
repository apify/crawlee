# Crawler internals

For subclasses, internal access and explicit generic annotations.

## Renamed and private members

Protected methods lose underscore prefixes, including BasicCrawler `_runRequestHandler`, `_init`, `_throwOnBlockedRequest`, `_getMessageFromError`, `_getCookieHeaderFromRequest`, and BrowserCrawler `_navigationHandler`. BrowserPlugin `_addProxyToLaunchOptions`, `_isChromiumBasedBrowser` and `_throwAugmentedLaunchError` do too. BrowserLauncher `_getDefaultHeadlessOption` becomes `getDefaultHeadlessOption` and remains protected. The internal PlaywrightBrowser `_setBrowserType` becomes `setBrowserType`.

Do not strip every underscore. BrowserPlugin `_launch` and BrowserController `_close`, `_kill`, `_newPage`, `_getCookies`, `_setCookies` keep theirs because public wrappers occupy the plain names.

Formerly accessible helpers may now be native `#` private fields; casts and bracket indexing cannot restore access. Use handlers, hooks, `extendContext`, ContextPipeline or collaborator interfaces. Report behavior without a supported extension point.

`LaunchContext.extend()` rejects declared fields, including fingerprint and proxyUrl. Assign those directly; reserve extend for application fields.

`getMessageFromError()` overrides must return `string`. Configure block detection with `retryOnBlocked` / `blockedStatusCodes`, or throw `SessionError` from a post-navigation hook. `BLOCKED_STATUS_CODES` is readonly; copy it before modifying a local list. `Session.getState()` and `SessionOptions.log` are internal and have no semver guarantees.

Crawler `running`, `sessionPool` and `browserPool` become read-only. For resource ownership and disposal, see the browser reference.

Use `RequestQueue.open()` rather than its internal constructor, which loses its configuration argument. Use `Router.create()` instead of its now-private constructor. Use public `RobotsTxtFile.from`, `Sitemap.load` or `Sitemap.fromXmlString` instead of private factories.

## Context and generics

Explicit crawler subclasses may need the new context-extension generic parameters and a `contextPipelineBuilder`; preserve inference elsewhere.

`RequestHandler` and `ErrorHandler` no longer wrap context with LoadedContext. ErrorHandler takes base and extended context types and receives base context plus a partial extension. `LoadedContext` is internal and no longer part of the public API; `RestrictedCrawlingContext` stays exported from `@crawlee/basic`. Browser hook types become generic type aliases over userData; replace interface extension with intersection types.

`BrowserCrawler` drops its third `LaunchOptions` type argument along with the instance `launchContext` field. Remove that argument from subclasses and adjust explicit generics. See the statistics reference for its extension parameter.

`HttpHook`, `CheerioHook`, `JSDOMHook`, `LinkeDOMHook` and `FileDownloadHook` are removed. Prefer hook types inferred from crawler options so pre-navigation hooks do not require a parsed body, `$` or page. A standalone HTTP hook can use `InternalHttpHook<CrawlingContext>` when an explicit pre-navigation type is necessary. `FileDownload` has no navigation hooks.

`HttpCrawler.use` and `CrawlerExtension` are removed. Use ContextPipeline composition for extension and cleanup. BasicCrawler `_cleanupContext`, `crawlingContexts`, and old navigation/parser/utility-registration hooks disappear. See the removed-symbol lookup for specific names.

## RecoverableState

Custom `serialize` and `deserialize` now work on values rather than strings and also accept Standard Schema implementations, such as zod codecs. Custom v3 records do not load automatically; preserve or translate data deliberately.

`reset()` synchronously resets memory; `resetStore()` clears storage. `persistStateKvsName` and `persistStateKvsId` become `keyValueStore`, accepting a store or open promise. Use a `defaultState` factory when structuredClone cannot recreate state.

`teardown()` is no longer terminal; initialize can open another persistence window. Periodic and teardown persistence failures warn rather than throw, while direct `persistState()` still throws. Built-in SessionPool and RequestList record shapes remain compatible.
