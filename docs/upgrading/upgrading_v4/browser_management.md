---
id: browser-management
title: 'Upgrading to v4: browser management'
sidebar_label: Browser management
sidebar_position: 3
slug: /upgrading/upgrading-to-v4/browser-management
---

Applies when you construct a `BrowserPool` yourself, reach for `browserController`, or tune `AdaptivePlaywrightCrawler` internals. This page is part of the [Upgrading to v4](./upgrading_v4.md) guide.

## Custom `BrowserPool` implementations via the `IBrowserPool` interface

Browser crawlers now accept any object implementing the new `IBrowserPool` interface as their `browserPool` option, not just instances of the built-in `BrowserPool`. The interface follows the classic acquire/release pattern, plus a pair of helpers for moving state between the crawling session and the page:

- **`newPage(options?)`** — opens a new page. An optional `session` can be passed as a best-effort hint — the pool may use it for proxy configuration, fingerprinting, etc., but nothing is guaranteed.
- **`closePage(page, options?)`** — signals the pool that the caller is done with the page. If the optional `error` is a `SessionError`, the session that served the page is finished. A plain `SessionError` means it was blocked, so the pool should purge all state associated with it (e.g. retire the underlying browser). The `SessionRetiredError` subclass means the session merely reached its `maxUsageCount` or `maxAgeSecs`, and a pool may keep a warm page instead.
- **`extractPageState(page)`** — reads the relevant state (currently cookies) out of a page so the crawler can persist it back into the session.
- **`injectPageState(page, state)`** — the counterpart to `extractPageState`; seeds a page with state (currently cookies) before navigation. Isolation between pages is best-effort and depends on the pool implementation.

Lifecycle (`destroy`) is the responsibility of whoever owns the pool: a custom pool you construct yourself is never owned by the crawler, so the crawler never tears it down. This makes it straightforward to plug in a remote browser farm, a session-aware pool, or another custom browser-management strategy without subclassing `BrowserPool`.

```typescript
import { PuppeteerCrawler } from '@crawlee/puppeteer';
import { BrowserPool, PuppeteerPlugin, type IBrowserPool } from '@crawlee/browser-pool';
import puppeteer from 'puppeteer';

const sharedPool = new BrowserPool({ browserPlugins: [new PuppeteerPlugin(puppeteer)] });

const crawler = new PuppeteerCrawler({
    browserPool: sharedPool,
    requestHandler: async ({ page }) => {
        // …
    },
});

// You own `sharedPool` — destroy it yourself when you're done.
await crawler.run();
await sharedPool.destroy();
```

The `crawler.browserPool` property is now **read-only** (a getter). It was previously a writable field, so any code that reassigned it after construction (`crawler.browserPool = myPool`) no longer works — pass your pool via the `browserPool` constructor option instead.

## `@crawlee/browser-pool` is no longer re-exported from `crawlee`

The meta-package used to `export *` from `@crawlee/browser-pool`, which made `BrowserPool`, `PuppeteerPlugin`, `PlaywrightPlugin`, `BrowserController`, `LaunchContext`, the fingerprint enums and the `IBrowserPool` / `NewPageOptions` interfaces importable from `crawlee`. They no longer are. Add `@crawlee/browser-pool` to your dependencies and import them from there:

```diff
-import { BrowserPool, PlaywrightPlugin } from 'crawlee';
+import { BrowserPool, PlaywrightPlugin } from '@crawlee/browser-pool';
```

The crawler-facing surface is unaffected: `playwrightBrowserPool()`, `puppeteerBrowserPool()` and their `remote*` counterparts still come from `crawlee` (and from `@crawlee/playwright` / `@crawlee/puppeteer`), so the common case of building a pool for a crawler needs no extra dependency.

## `BrowserCrawlingContext.browserController` has been removed

The `browserController` property is no longer part of the crawling context (`BrowserCrawlingContext`). Browser controller management is now fully internal to the pool — the crawler interacts with the pool only through the `IBrowserPool` interface (`newPage`, `closePage`, `extractPageState`, and `injectPageState`).

If you previously used `browserController` in your request handlers, here is how to migrate the most common patterns:

**Cookies** — Cookie injection and persistence are now handled automatically by the crawler and the pool. You no longer need to call `browserController.getCookies()` or `browserController.setCookies()` manually.

**Proxy info** — Access proxy information via `session.proxyInfo` instead of `browserController.launchContext.proxyUrl`. TLS-error handling moved along with it: the pool reads `session.proxyInfo.ignoreTlsErrors`, so there is no standalone `ignoreTlsErrors` page option anymore. If you need to disable TLS verification for some other reason, set `ignoreHTTPSErrors` (Playwright) / `acceptInsecureCerts` (Puppeteer) through the browser's `launchOptions`.

**Direct browser access** — If you need the raw browser or controller instance (e.g. for Puppeteer/Playwright-specific APIs), construct a `BrowserPool` yourself, pass it to the crawler, and reference it directly in your handler — no cast needed:

```typescript
import { BrowserPool, PuppeteerPlugin } from '@crawlee/browser-pool';
import { PuppeteerCrawler } from '@crawlee/puppeteer';
import puppeteer from 'puppeteer';

const pool = new BrowserPool({ browserPlugins: [new PuppeteerPlugin(puppeteer)] });

const crawler = new PuppeteerCrawler({
    browserPool: pool,
    requestHandler: async ({ page }) => {
        const controller = pool.getBrowserControllerByPage(page);
        // controller.browser, controller.launchContext, etc.
    },
});

await crawler.run();
// You own the pool — tear it down yourself.
await pool.destroy();
```

Note that this couples your code to the built-in `BrowserPool` — custom `IBrowserPool` implementations may not expose controllers at all.

## Puppeteer cookies are now read and written at the browser-context level

The `PuppeteerController._getCookies` / `_setCookies` methods (used internally by the session pool to sync cookies between a `Session` and a Puppeteer page) now call `page.browserContext().cookies()` / `setCookie()` instead of the deprecated `page.cookies()` / `page.setCookie()`. The page-level API was removed in newer Puppeteer releases.

This aligns the Puppeteer controller with the Playwright controller, which has always worked at the context level.

**What changes in practice**
- Cookie reads return every cookie stored in the page's browser context, not just cookies matching the page's current URL. If your `Session` relied on the URL-scoped filtering (for example, to avoid pulling cookies that belong to other tabs in the same context), you'll now see the full set.
- Cookie writes are applied to the whole browser context. When you launch pages with shared contexts, cookies written via `Session.setCookiesFromResponse` or similar will be visible to every other page in that context.

If you rely on Crawlee's default configuration (one browser context per session, which is the `useIncognitoPages` / `newContextPerSession` behavior used by `PuppeteerCrawler`), you should not notice any difference — each session already owns its own context.

**Cookie `url` field** — the old `page.setCookie()` auto-filled a missing `url` on each cookie with the page's current URL. The new `browserContext().setCookie()` does not; Chromium rejects cookies that carry neither `url` nor `domain`. Crawlee's internal `_setCookies` keeps the old behavior by back-filling `page.url()` for any cookie that has neither field set, but if you call `browserContext().setCookie()` directly (outside of Crawlee) you need to provide one of them yourself.

## Custom rendering type predictors via the `IRenderingTypePredictor` interface

The `renderingTypePredictor` option of `AdaptivePlaywrightCrawler` is now typed as the new `IRenderingTypePredictor` interface — `predict(request)` and `storeResult(requests, renderingType)`, nothing else, either of which may return a promise. The built-in `RenderingTypePredictor` implements it, so passing one still works.

What changed is the lifecycle: the crawler used to call `initialize()` on the predictor it was given, even though it did not create it. It now follows the same own-only-what-you-built rule as the session and browser pools — a predictor you pass in is *borrowed*, so setting it up is your job, and `initialize` is not part of the interface at all. The built-in predictor restores its persisted state in `initialize()` and will throw `Recoverable state has not yet been loaded` from `predict()` if it is never called:

```typescript
import { AdaptivePlaywrightCrawler, RenderingTypePredictor } from '@crawlee/playwright';

const renderingTypePredictor = new RenderingTypePredictor({ detectionRatio: 0.1 });
// You own the predictor — initialize it yourself (this used to be done by the crawler).
await renderingTypePredictor.initialize();

const crawler = new AdaptivePlaywrightCrawler({
    renderingTypePredictor,
    requestHandler: async ({ pushData }) => {
        // …
    },
});
```

If you don't pass a predictor, nothing changes: the crawler builds one from `renderingTypeDetectionRatio` and, since it owns that one, initializes it for you.

**Asynchronous predictors** — `predict()` is awaited before the crawler routes the request, so prefer loading whatever it needs up front over per-request I/O. `storeResult()` is *not* awaited per detection: the crawler tracks the promise it returns and drains everything still pending in `teardown()`, so a predictor that batches its writes can rely on them landing before the crawl ends. That wait is bounded by the internal timeout (`CRAWLEE_INTERNAL_TIMEOUT`), `crawler.drainRenderingDetections()` performs it on demand, and `crawler.inFlightRenderingTypeDetectionCount` reports what is still outstanding.

`teardown()` stops new detections from starting before it drains, so ending a `keepAlive` crawl by tearing it down from outside `run()` cannot leave a detection unpersisted either.

## Remove `experimentalContainers` option

This experimental option relied on an outdated manifest version for browser extensions, it is not possible to achieve this with the currently supported versions.

## `PlaywrightLauncher` is no longer exported

`PlaywrightLauncher` was an implementation detail of `launchPlaywright()` and the Playwright browser pools, and it is no longer part of `@crawlee/playwright`'s (or `crawlee`'s) public exports. Use `launchPlaywright(launchContext, configuration)` to get a `Browser`, or `playwrightBrowserPool()` when you need a pool. `PlaywrightLaunchContext` is still exported, so the options object can still be typed.

## `BrowserCrawler.launchContext` was removed

The `launchContext` property on crawler instances is gone. It was assigned once in the constructor and never read, so nothing in Crawlee consumed it. The `launchContext` **option** is unchanged on `PlaywrightCrawler`, `PuppeteerCrawler` and `StagehandCrawler` — only the echo of it on the instance is gone. If you were reading `crawler.launchContext`, keep your own reference to the object you passed in.

The abstract `BrowserCrawler` base class also lost its third type parameter, `LaunchOptions`, which existed only to type that field. Custom crawlers extending `BrowserCrawler` must drop that type argument:

```diff
-class MyCrawler extends BrowserCrawler<Page, Response, LaunchOptions, MyCrawlingContext> {
+class MyCrawler extends BrowserCrawler<Page, Response, MyCrawlingContext> {
```

## Unused browser options are now rejected instead of ignored

`PlaywrightCrawler` no longer accepts a top-level `launcher` option, and `PlaywrightLaunchContext` no longer accepts `launchContextOptions`; both were silently ignored and are now reported as unknown options by the constructors' validation. Pass the browser type as `launchContext.launcher`, and persistent-context settings inside `launchContext.launchOptions`.

## Dead v3 fingerprinting types are removed

`BrowserSpecification`, `GetFingerprintReturn` and `@crawlee/browser-pool`'s own `FingerprintGenerator` interface (which shadowed `fingerprint-generator`'s class of the same name) are no longer exported. They had no consumers — `BrowserPool.fingerprintGenerator` is typed by `fingerprint-generator`'s `FingerprintGenerator`, and `fingerprintGeneratorOptions` is still typed by `FingerprintGeneratorOptions`.

## `BROWSER_POOL_EVENTS.BROWSER_CLOSED` was removed

It was never emitted. Listen for `BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED` on a `BrowserController` instead.

## `BrowserPool` internals are private

`pages`, `pageIds`, `pageCounter`, `pageToBrowserController`, `startingBrowserControllers`, `activeBrowserControllers`, `retiredBrowserControllers`, `operationTimeoutMillis`, `closeInactiveBrowserAfterMillis`, `maxOpenPagesPerBrowser`, `retireBrowserAfterPageCount` and `useFingerprints` are no longer readable or writable from outside the pool. Use `getPage()`, `getPageId()` and `getBrowserControllerByPage()` to reach pages, the `browserLaunched` / `browserRetired` / `pageCreated` / `pageClosed` events to observe the pool's lifecycle, and pass the corresponding `BrowserPoolOptions` at construction instead of assigning to the mirrors afterwards — the options themselves are unchanged.

The six hook arrays (`preLaunchHooks`, `postLaunchHooks`, `prePageCreateHooks`, `postPageCreateHooks`, `prePageCloseHooks`, `postPageCloseHooks`) are private too. Supply hooks through the constructor options; mutating or replacing the arrays on a live pool is no longer possible.

```diff
-const browserPool = new BrowserPool({ browserPlugins: [plugin] });
-browserPool.postLaunchHooks.push(myHook);
+const browserPool = new BrowserPool({ browserPlugins: [plugin], postLaunchHooks: [myHook] });
```

`BrowserController.log` and `BrowserPlugin.log` are no longer part of the public type surface either. Subclasses inside `@crawlee/browser-pool` still use them, but they are not covered by backwards-compatibility guarantees — get your own logger from `serviceLocator.getLogger()`.

Several more members are `@internal`, and remain present at runtime only: `BrowserPool.fingerprintInjector`, `.fingerprintCache`, `.fingerprintOptions`; `BrowserController.isActive`, `.totalPages`, `.lastPageOpenedAt`, `.normalizeProxyOptions()`; `AnonymizeProxySugarOptions`; and the `PlaywrightBrowser` constructor. The `_close` / `_kill` / `_newPage` / `_getCookies` / `_setCookies` hooks on `BrowserController` and the `_launch` / `addProxyToLaunchOptions` / `isChromiumBasedBrowser` hooks on `BrowserPlugin` are *not* in that list: they carry no release tag, on the abstract declarations and on the `PlaywrightController` / `PuppeteerController` / `PlaywrightPlugin` / `PuppeteerPlugin` overrides alike, and remain the extension contract for your own subclasses.
