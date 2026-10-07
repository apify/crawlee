# Browser management

## Pool options and ownership

`browserPoolOptions` is removed. Use the factory matching the crawler: `playwrightBrowserPool()`, `puppeteerBrowserPool()` or `stagehandBrowserPool()`. Remote equivalents have the `remote` prefix. Move pool settings and crawler `launchContext`, `headless` and `remoteBrowser` configuration into that factory. Supplying those crawler options alongside `browserPool` now throws.

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

Custom pools implement `IBrowserPool`: `newPage`, `closePage`, `extractPageState`, and `injectPageState`. Passing a session to `newPage` is a best-effort hint. A `SessionError` passed to `closePage` should cause the pool to discard associated session state. The caller owns custom lifecycle methods.

## Context and hooks

`context.browserController` is removed. Use `session.proxyInfo` for proxy information. For a required raw controller, construct the built-in pool yourself and call `pool.getBrowserControllerByPage(page)`. Custom pools may not expose controllers.

Browser pre- and post-navigation hooks receive only context. Mutate `context.gotoOptions` for navigation options. The pool reads TLS handling from `session.proxyInfo.ignoreTlsErrors`. For other certificate handling, use browser `launchOptions.ignoreHTTPSErrors` for Playwright or `acceptInsecureCerts` for Puppeteer.

`context.blockResources` and `context.cacheResponses` are removed. Deprecated Puppeteer functions remain as top-level exports and in `puppeteerUtils`, with an explicit `page` argument. Migrate away where possible. `closeCookieModals` is removed entirely; see the configuration/context reference for consent handling.

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
