# Browser management

## Pool options and ownership

`browserPoolOptions` is removed. Use the factory matching the crawler: `playwrightBrowserPool()`, `puppeteerBrowserPool()` or `stagehandBrowserPool()`. Move pool settings and crawler `launchContext`, `headless` and supported `remoteBrowser` configuration into that factory. Supplying those crawler options alongside `browserPool` now throws. Remote connections use `RemotePlaywrightPlugin` or `RemotePuppeteerPlugin` inside `BrowserPool`; there is no `RemoteBrowserPool` or separate remote factory. `BrowserPool` accepts `maxOpenBrowsers`. Stagehand rejects `remoteBrowser`; use its `stagehandOptions.env` instead.

```ts
const pool = playwrightBrowserPool({
    useFingerprints: false,
    launchContext: { launcher: firefox },
});
const crawler = new PlaywrightCrawler({ browserPool: pool, requestHandler });
try {
    await crawler.run(urls);
} finally {
    await pool.destroy();
}
```

A supplied pool is borrowed and never destroyed by the crawler. `crawler.browserPool` is read-only. `remoteBrowser` alone still works when no custom pool is passed. `headless` is declared on concrete crawlers; Puppeteer's `'new'` and `'old'` values do not apply to other crawlers.

Custom pools implement `IBrowserPool`: `newPage`, `closePage`, `extractPageState`, and `injectPageState`. Passing a session to `newPage` is a best-effort hint. A plain `SessionError` passed to `closePage` signals a block and should discard associated session state. Its `SessionRetiredError` subclass signals normal usage or age expiry, so a pool may keep a warm page. The caller owns custom lifecycle methods.

`crawler.teardown()` releases only per-run resources and leaves a crawler-owned browser pool reusable for the next `run()`. `crawler.destroy()` or async disposal releases resources that outlive a run. A finished run leaves no browsers or timers keeping the process alive, so disposal is optional. Borrowed pools still require their owner's cleanup.

## Imports and constructor options

`crawlee` no longer re-exports `@crawlee/browser-pool`. Add that dependency and import `BrowserPool`, plugins, controllers, `LaunchContext`, fingerprint enums and pool interfaces directly from it. The crawler-specific factory functions remain exported by `crawlee` and their crawler packages.

`PlaywrightLauncher` is no longer exported. Use `launchPlaywright(launchContext, configuration)` for a browser or `playwrightBrowserPool()` for a pool. `PlaywrightLaunchContext` remains public. `crawler.launchContext` is removed; keep your own reference to the constructor option if needed.

Playwright's ignored top-level `launcher` and `launchContext.launchContextOptions` now fail validation. Put the browser type in `launchContext.launcher` and persistent-context options in `launchContext.launchOptions`.

## Context and hooks

`context.browserController` is removed. Use `session.proxyInfo` for proxy information. For a required raw controller, construct the built-in pool yourself and call `pool.getBrowserControllerByPage(page)`. Custom pools may not expose controllers.

Browser pre- and post-navigation hooks receive only context. Mutate `context.gotoOptions` for navigation options. The pool reads TLS handling from `session.proxyInfo.ignoreTlsErrors`. For other certificate handling, use browser `launchOptions.ignoreHTTPSErrors` for Playwright or `acceptInsecureCerts` for Puppeteer.

`context.blockResources`, `context.cacheResponses` and their `puppeteerUtils` functions are removed. Use `puppeteerUtils.blockRequests(page, options)` for URL-pattern blocking and the browser's cache for caching. `closeCookieModals` is removed entirely; see the configuration/context reference for consent handling.

## Cookies

Puppeteer cookie synchronization uses `page.browserContext().cookies()` and `setCookie()` instead of removed page-level APIs. Reads include all context cookies; writes affect the whole context. Inspect projects sharing browser contexts. Direct browser-context cookie calls must provide `url` or `domain`; Crawlee's internal injection fills missing values from the page URL.

With `saveResponseCookies` enabled, handler-created cookies now persist to the session. Check assumptions about cookie isolation across requests.

## Adaptive rendering

`AdaptivePlaywrightCrawler` now extends `BasicCrawler`. `renderingTypePredictor` accepts `IRenderingTypePredictor` with `predict` and `storeResult`. A supplied built-in `RenderingTypePredictor` must be `initialize()`d by its owner before the crawl, and cleaned up by its owner afterward. A crawler-created default is initialized automatically.

Async `predict()` is awaited; `storeResult()` promises are drained at teardown. `drainRenderingDetections()` allows an explicit drain. Do not bypass teardown when pending detections must persist.

`preventDirectStorageAccess` and `commitResult` are removed. Adaptive result callbacks receive `StorageTransactionView` instead of `RequestHandlerResult`, retaining `datasetItems`, `enqueuedUrls`, and `keyValueStoreChanges`. `calls` and `enqueuedUrlLists` disappear. Use `afterStorageCommit()` for effects that depend on the winning attempt's committed writes. Transactions cannot be disabled for this crawler.

## Cloudflare and Stagehand

A solved Cloudflare challenge must replace the original response, or the crawler still treats the original 403 as blocked. Prefer `postNavigationHooks: [handleCloudflareChallengeHook()]`. For manual hooks:

```ts
postNavigationHooks: [
    async ({ handleCloudflareChallenge }) => {
        const response = await handleCloudflareChallenge();
        return response && { response };
    },
]
```

Do not return `{ response: undefined }` when there was no challenge. The standalone Playwright helper loses the session argument, becoming `handleCloudflareChallenge(page, url, options)`.

Remove `experimentalContainers`. Stagehand loses `ignoreShadowRoots` and `ignoreIframes`. `StagehandGotoOptions` no longer accepts arbitrary dictionary keys. `failedRequestHandler` still works through inherited options.

`StagehandRequestHandler` becomes `RequestHandler<StagehandCrawlingContext>`. Remove the unused `stagehandUtils` namespace and import `AgentResult` from `@browserbasehq/stagehand`. Move `launchContext.stagehandOptions` to the crawler or pool factory's top-level `stagehandOptions`. `StagehandPlugin.stagehandOptions` is private and `getStagehandForBrowser()` is removed; use `context.stagehand`.

## Pool internals

Pool page/controller maps, counters, option mirrors and hook arrays are private. Pass options and hooks at construction, use `getPage()`, `getPageId()` or `getBrowserControllerByPage()` for lookup, and observe lifecycle events. Use `BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED` on a controller; the removed `BROWSER_POOL_EVENTS.BROWSER_CLOSED` was never emitted.

`BrowserSpecification`, `GetFingerprintReturn` and browser-pool's `FingerprintGenerator` interface are removed. Use types from `fingerprint-generator` when needed. Controller/plugin loggers are outside the public API; obtain your own logger from `serviceLocator.getLogger()`. Fingerprint caches/injectors, controller bookkeeping and the `PlaywrightBrowser` constructor are internal. The controller `_close`, `_kill`, `_newPage`, `_getCookies`, `_setCookies` and plugin `_launch`, `addProxyToLaunchOptions`, `isChromiumBasedBrowser` hooks remain subclass extension points.
