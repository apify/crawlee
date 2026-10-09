# Browser management

## Pools and ownership

Replace `browserPoolOptions` with `playwrightBrowserPool()`, `puppeteerBrowserPool()` or `stagehandBrowserPool()`, passed as `browserPool`. Move `launchContext`, `headless` and supported `remoteBrowser` settings into the factory; combining them with crawler `browserPool` throws.

Remote connections use the regular factory or `RemotePlaywrightPlugin` / `RemotePuppeteerPlugin`. There is no separate remote factory or `RemoteBrowserPool`; `BrowserPool` accepts `maxOpenBrowsers`. Stagehand uses `stagehandOptions.env` and rejects `remoteBrowser`. Puppeteer's `'new'` / `'old'` headless values are Puppeteer-only.

You must `destroy()` supplied pools, preferably in `finally`. `crawler.browserPool` is read-only. `crawler.teardown()` releases per-run resources and keeps its own pool reusable; `destroy()` or async disposal releases resources spanning runs.

Custom `IBrowserPool` implementations provide `newPage`, `closePage`, `extractPageState` and `injectPageState`. The session passed to `newPage` is a best-effort hint. In `closePage`, a plain `SessionError` signals a block; discard session state. `SessionRetiredError` signals usage/age expiry. The built-in pool retires the controller for either error; a custom pool retaining a warm page must prevent state leaking into another session.

## Imports and options

Import `BrowserPool`, plugins, controllers, `LaunchContext`, fingerprint enums and pool interfaces from `@crawlee/browser-pool`; `crawlee` no longer re-exports them. Crawler-specific factories remain available through `crawlee`.

Replace `PlaywrightLauncher` with `launchPlaywright(launchContext, configuration)` or `playwrightBrowserPool()`. `PlaywrightLaunchContext` remains public. Replace reads of removed `crawler.launchContext` with your own options reference.

Playwright's top-level `launcher` and `launchContext.launchContextOptions` now fail validation. Use `launchContext.launcher` and `launchContext.launchOptions`.

## Context, cookies and hooks

Replace `context.browserController` proxy access with `session.proxyInfo`. If a raw controller is necessary, supply a built-in pool and use `pool.getBrowserControllerByPage(page)`.

Browser hooks use `context.gotoOptions`. TLS handling comes from `session.proxyInfo.ignoreTlsErrors`; other certificate overrides use Playwright `launchOptions.ignoreHTTPSErrors` or Puppeteer `acceptInsecureCerts`.

Replace removed `blockResources` / `cacheResponses` context and utility helpers with `puppeteerUtils.blockRequests(page, options)` and the browser cache. For removed `closeCookieModals`, see the configuration/context reference.

Puppeteer cookies now use `page.browserContext().cookies()` / `setCookie()`. Reads and writes cover the whole context, affecting shared-context isolation. Direct calls must supply cookie `url` or `domain`. Handler-created cookies persist to sessions when `saveResponseCookies` is enabled.

Cloudflare post-hooks must return the solved response. Prefer `postNavigationHooks: [handleCloudflareChallengeHook()]`, or:

```ts
async ({ handleCloudflareChallenge }) => {
    const response = await handleCloudflareChallenge();
    return response && { response };
}
```

Returning `{ response: undefined }` would overwrite an unchallenged response. The standalone helper loses its session argument: `handleCloudflareChallenge(page, url, options)`.

## Adaptive rendering

`AdaptivePlaywrightCrawler` extends `BasicCrawler`. Supplied `RenderingTypePredictor` instances require owner-managed `initialize()` and cleanup. Custom predictors implement `IRenderingTypePredictor.predict` / `storeResult`; teardown drains pending `storeResult()` promises.

Remove `preventDirectStorageAccess` and `commitResult`. Result callbacks receive `StorageTransactionView` instead of `RequestHandlerResult`, retaining `datasetItems`, `enqueuedUrls` and `keyValueStoreChanges`. `calls` / `enqueuedUrlLists` disappear. Use `afterStorageCommit()` for effects tied to winning writes. Transactions cannot be disabled.

## Stagehand and internals

Remove `experimentalContainers`, Stagehand `ignoreShadowRoots` / `ignoreIframes`, and extra dictionary keys in `StagehandGotoOptions`.

Replace `StagehandRequestHandler` with `RequestHandler<StagehandCrawlingContext>`. Remove `stagehandUtils`; import `AgentResult` from `@browserbasehq/stagehand`. Move `launchContext.stagehandOptions` to the crawler/factory's top-level option. Replace `StagehandPlugin.getStagehandForBrowser()` and access to private `stagehandOptions` with `context.stagehand`.

Pool maps, counters, option mirrors and hook arrays are private. Supply options/hooks at construction; use `getPage()`, `getPageId()`, `getBrowserControllerByPage()` and lifecycle events. Replace `BROWSER_POOL_EVENTS.BROWSER_CLOSED` with the controller event `BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED`.

Replace removed `BrowserSpecification`, `GetFingerprintReturn` and browser-pool `FingerprintGenerator` types with applicable `fingerprint-generator` types. Obtain your own logger via `serviceLocator.getLogger()`. Fingerprint caches/injectors, controller bookkeeping and `PlaywrightBrowser` construction are internal. Supported subclass hooks are listed in the crawler-internals reference.
