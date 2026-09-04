---
id: upgrading-to-v4
title: Upgrading to v4
---

import ApiLink from '@site/src/components/ApiLink';

This page summarizes the breaking changes in Crawlee v4. There are many, so the guide is organized to let you stop reading as early as possible:

- [What v4 does better](#what-v4-does-better) — why the migration is worth the trouble.
- [Rename cheat sheet](#rename-cheat-sheet) — the purely mechanical renames, in one table.
- [Changes most users will hit](#changes-most-users-will-hit) — read this part in full.
- The **Only if you…** sections — each applies only if you use what its title says. Skim the titles and skip what doesn't concern you.
- [Appendix: removed symbols](#appendix-removed-symbols) — for when the compiler hands you a missing name and you want to know where it went.

## What v4 does better

- **Timeouts that mean what they say.** Navigation and the request handler are [timed separately](#navigation-and-the-request-handler-are-timed-separately) — no more mysteriously summed limits — and a single route can get [its own timeout](#per-route-and-per-request-handler-timeouts) or extend it mid-flight.
- **Composable crawling context.** The new `extendContext` option and `ContextPipeline` composition replace subclassing tricks for [adding members to the crawling context](#crawling-context-no-longer-includes-a-reference-to-the-crawler-itself).
- **Bring your own implementation.** Crawlers now accept any [`ISessionPool`](#custom-sessionpool-implementations-via-the-isessionpool-interface), [`IBrowserPool`](#custom-browserpool-implementations-via-the-ibrowserpool-interface), [`IRenderingTypePredictor`](#custom-rendering-type-predictors-via-the-irenderingtypepredictor-interface), [`IRequestManager`](#request-loaders-and-managers) or [`IStatistics`](#statisticsoptions-is-replaced-by-a-statistics-instance) — and never tear down an instance they did not create, which [`await using` now does for you](#collaborators-you-own-are-disposable).
- **One concurrency budget for several crawlers.** The new [`ConcurrencySystem`](#autoscaling-moved-to-concurrencysystem) can be shared between crawlers, capping their combined concurrency instead of letting each one oversubscribe the host.
- **Native `fetch` types.** HTTP clients and `context.response` now use the [standard `Response`](#crawlingcontextresponse-is-now-of-type-response), and `got-scraping` is an [opt-in dependency](#http-client-packages-and-basehttpclient-reshaped) instead of a mandatory one.
- **The session is the rotation unit.** A session carries its proxy, cookies and error score, and is rotated as a whole when blocked — replacing [proxy tiers](#tieredproxyurls-is-removed-from-proxyconfiguration) and [session rotation counters](#maxsessionrotations-and-requestsessionrotationcount-are-removed).
- **Crawlers stop stepping on each other.** Multiple crawlers in one process [no longer share the default request queue](#multiple-crawler-instances-use-separate-default-request-queues), and repeated `run()` calls [no longer empty it](#repeated-run-calls-no-longer-empty-the-request-queue) behind your back.
- **Cookies behave.** `sendRequest` finally [respects your `Cookie` header](#cookie-handling-in-httpcrawler-and-sendrequest), and browser cookies set inside the handler are [persisted to the session](#browser-cookies-are-also-persisted-after-requesthandler).
- **No half-written results.** Storage writes in a request handler are [transactional](#storage-writes-in-request-handlers-are-transactional) — a handler that throws leaves nothing behind, and its retry does not duplicate data.
- **Simpler storage backend contract.** A custom storage backend is now [4 classes instead of 7](#storagebackend-interface-simplified).

## Rename cheat sheet

The purely mechanical renames, collected in one place. Where a row links to a section, the rename also comes with a behavior or signature change — read it before renaming blindly.

| v3 | v4 |
| --- | --- |
| `handleRequestFunction` / `handlePageFunction` | `requestHandler` |
| `handleRequestTimeoutSecs` | `requestHandlerTimeoutSecs` |
| `handleFailedRequestFunction` | `failedRequestHandler` |
| `persistCookiesPerSession` | `saveResponseCookies` |
| `config` (option / property name) | `configuration` ([details](#config-is-renamed-to-configuration-everywhere)) |
| `Configuration.getGlobalConfig()` | `Configuration.getGlobalConfiguration()` |
| `LocalEventManager.fromConfig()` | `LocalEventManager.fromConfiguration()` |
| `StorageClient` | `StorageBackend` ([reshaped](#storagebackend-interface-simplified)) |
| `MemoryStorage` (`@crawlee/memory-storage`) | `MemoryStorageBackend` (`@crawlee/core`, [now memory-only](#memorystorage-split-into-filesystemstoragebackend-and-memorystoragebackend)) |
| `RequestQueueV1` / `RequestQueueV2` / `RequestProvider` | `RequestQueue` |
| `IRequestList` | `IRequestLoader` ([reshaped](#irequestlist-renamed-to-irequestloader)) |
| `SitemapRequestList` | `SitemapRequestLoader` ([details](#sitemaprequestlist-renamed-to-sitemaprequestloader)) |
| `RobotsFile` | `RobotsTxtFile` |
| `markRequestHandled()` | `markRequestAsHandled()` |
| `requestList.length()` / `requestList.handledCount()` | `await getTotalCount()` / `await getHandledCount()` |
| `requestList.isEmpty()` / `requestList.isFinished()` | `await checkReadiness()` ([details](#isempty--isfinished-replaced-by-checkreadiness)) |
| `Dataset.listItems()` | `Dataset.getData()` / `Dataset.values()` ([details](#datasetlistitems-replaced-by-datasetgetdata-and-datasetvalues)) |
| crawler options `requestList` / `requestQueue` | `requestManager` ([details](#crawler-requestlist--requestqueue-options-deprecated-in-favor-of-requestmanager)) |
| `enqueueLinks({ requestQueue })` | `enqueueLinks({ requestManager })` |
| `enqueueLinks({ globs, regexps, pseudoUrls })` | `enqueueLinks({ include })` ([details](#globs-regexps-and-pseudourls-replaced-by-include)) |
| `(await enqueueLinks()).processedRequests` | `(await enqueueLinks()).addedRequests` ([details](#enqueuelinks-return-value-reshaped-addrequestsbatchedresult-instead-of-batchaddrequestsresult)) |
| `autoscaledPoolOptions` | `taskLoopOptions` ([narrowed](#autoscaledpooloptions-is-now-taskloopoptions-and-no-longer-carries-concurrency-config)) |
| `crawler.stats` | `crawler.statistics` ([retyped](#statisticsoptions-is-replaced-by-a-statistics-instance)) |
| `browserPoolOptions` | `browserPool` + a `*BrowserPool()` factory ([details](#browserpooloptions-is-removed)) |
| `gotScraping` (from `@crawlee/utils`) | `GotScrapingHttpClient` (`@crawlee/got-scraping-client`) |
| `SDK_`-prefixed internal KVS keys | `CRAWLEE_`-prefixed ([details](#internal-kvs-keys-renamed)) |
| `ArgumentError` (from `ow`) | `ArgumentValidationError` ([details](#argument-validation-errors-use-zod)) |

## Changes most users will hit

Environment requirements, renamed options and behavior changes that nearly every project runs into. Read this whole section.

### ECMAScript modules

Crawlee v4 is a native ESM package now. It can be still consumed from a CJS project, as long as you use TypeScript and Node.js version that supports `require(esm)`.

### Node 22+ required

Support for older node versions was dropped.

### Collaborators you own are disposable

A crawler never tears down an instance it did not build, so anything you construct and pass in — `SessionPool`, `ConcurrencySystem`, `BrowserPool`, `RemoteBrowserPool`, `RenderingTypePredictor` — is yours to shut down. All of them implement `Symbol.asyncDispose`, so `await using` does it for you:

```typescript
await using concurrencySystem = new ConcurrencySystem({ maxConcurrency: 20 });
await concurrencySystem.start();

await Promise.all([a.run(), b.run()]);
```

The hook calls the same `stop()` / `teardown()` / `destroy()` method as before, and those stay — `await using` needs Node.js 24, and v4 supports Node.js 22.

### TypeScript 5.8+ required

Support for older TypeScript versions was dropped. Crawlee ships compiled JavaScript, so this only affects type-checking against its type declaration files — plain JavaScript projects are unaffected. In particular, a CJS TypeScript project needs TypeScript 5.8+ to type-check a `require()` of an ESM package like Crawlee; older versions might still work if your project is also ESM.

### Cheerio v1

Previously, we kept the dependency on cheerio locked to the latest RC version, since there were many breaking changes introduced in v1.0. This release bumps cheerio to the stable v1. Also, we now use the default `parse5` internally.

### Argument validation errors use zod

Argument validation moved from `ow` to [zod](https://zod.dev). Invalid inputs now throw `ArgumentValidationError` (previously ow's `ArgumentError`) — update any code catching it by name or `instanceof`.

The messages read field-first and name the received type, value, and the validated interface:

```text
// v3 (ow)
Expected property `maxRequestRetries` to be of type `number` but received type `string` in object `HttpCrawlerOptions`

// v4 (zod)
Invalid input: expected number, received the string `3` at `maxRequestRetries` in `HttpCrawlerOptions`
```

Unlike ow, all problems are reported at once (one line per issue), and arrays name their element type:

```text
Invalid input: expected number, received the string `many` at `maxRequestRetries` in `HttpCrawlerOptions`
Invalid input: expected an array of numbers, received the number `500` at `additionalHttpErrorStatusCodes` in `HttpCrawlerOptions`
```

For programmatic handling, the error exposes zod's structured output — `error.issues` (the [zod issues](https://zod.dev/error-customization) array) and `error.cause` (the raw `ZodError`):

```ts
try {
    new CheerioCrawler({ maxRequestRetries: '3' } as any);
} catch (error) {
    if (error instanceof ArgumentValidationError) {
        error.issues[0].path; // ['maxRequestRetries']
        error.cause; // ZodError
    }
}
```

One behavioral change: options validated against class interfaces (`httpClient`, `configuration`, `eventManager`) now require actual instances (`instanceof BaseHttpClient`, …) rather than duck-typed plain objects — extend the class (or `Object.create(BaseHttpClient.prototype)` in tests) instead of passing an object literal.

### Zod 4.1+ required

`@crawlee/core` used to accept zod 3 as well; it now needs 4.1 or newer, for the codecs it validates persisted state with. Zod is an ordinary dependency rather than a peer, so a project pinned to zod 3 keeps working — it just ends up with both versions installed.

### Installing with `--omit=optional` breaks native dependencies

Crawlee v4 relies on more native, prebuilt dependencies than v3 did — notably the `impit` HTTP client and the `@crawlee/fs-storage-native` package backing `@crawlee/fs-storage`. Like other napi-rs-based packages, these ship one platform-specific binary per OS/architecture, distributed as `optionalDependencies` so that npm installs only the one matching your platform.

Running `npm install --omit=optional` (or the equivalent `yarn`/`pnpm` flag) skips all optional dependencies, including these platform binaries, so the native dependencies fail to install correctly. If your Dockerfile or install scripts carried over `--omit=optional` from a v3 project template, remove it — it is no longer safe to use with Crawlee v4.

### Deprecated crawler options are removed

The crawler following options are removed:

- `handleRequestFunction` -> `requestHandler`
- `handlePageFunction` -> `requestHandler`
- `handleRequestTimeoutSecs` -> `requestHandlerTimeoutSecs`
- `handleFailedRequestFunction` -> `failedRequestHandler`

### Crawler constructors no longer take a `Configuration` argument

The crawler classes dropped the optional second `config?: Configuration` constructor parameter: `PlaywrightCrawler`, `PuppeteerCrawler`, and `AdaptivePlaywrightCrawler` (the same applies to the other crawlers, which never advertised it publicly). `AdaptivePlaywrightCrawler` additionally now extends `BasicCrawler` rather than `PlaywrightCrawler`. Pass a `Configuration` via the `configuration` option instead (see [Using per-crawler services](#using-per-crawler-services-recommended)).

**Before:**
```typescript
const crawler = new PlaywrightCrawler({ requestHandler }, new Configuration({ headless: false }));
```

**After:**
```typescript
const crawler = new PlaywrightCrawler({
    requestHandler,
    configuration: new Configuration({ headless: false }),
});
```

The browser *launchers* (`PlaywrightLauncher`, `PuppeteerLauncher`) keep their `(launchContext?, configuration?)` constructor signature — this change is only about the crawler classes.

### Configuration class redesign

The `Configuration` class has been redesigned for v4. The main changes are:

#### Direct property access replaces `get()` and `set()`

**Before:**
```typescript
const config = Configuration.getGlobalConfig();
config.set('persistStateIntervalMillis', 10_000);
const headless = config.get('headless');
```

**After:**
```typescript
// Configuration is now immutable — set options via the constructor
const config = new Configuration({ persistStateIntervalMillis: 10_000 });
const headless = config.headless;
```

The `get()` and `set()` methods are removed. Access config values directly as properties.
Configuration instances are immutable — attempting to assign a property throws a `TypeError`.

#### Constructor options now take precedence over environment variables

**New priority order (highest to lowest):**
1. Constructor options
2. Environment variables
3. `crawlee.json`
4. Schema defaults

Previously, environment variables always won. Now `new Configuration({ headless: false })`
works even when `CRAWLEE_HEADLESS=true` is set.

### Service management moved from `Configuration` to `ServiceLocator`

The service management functionality has been extracted from `Configuration` into a new `ServiceLocator` class.

#### Breaking changes

The following methods and properties have been removed from `Configuration`:

- `Configuration.getStorageClient()` - moved to `ServiceLocator.getStorageBackend()`
- `Configuration.getEventManager()` - moved to `ServiceLocator.getEventManager()`
- `Configuration.useStorageClient()` - use `ServiceLocator.setStorageBackend()` instead
- `Configuration.useEventManager()` - use `ServiceLocator.setEventManager()` instead
- `Configuration.resetGlobalState()` - use `serviceLocator.reset()` instead
- `Configuration.storageManagers` - moved to `ServiceLocator.getStorageInstanceManager()`

The `EventManager` and `LocalEventManager` constructors now accept an options object for configuring event intervals (e.g. `persistStateIntervalMillis`, `systemInfoIntervalMillis`). You can also use the new `LocalEventManager.fromConfiguration()` factory method to create an instance with intervals derived from a `Configuration` object.

#### Migration guide

If you were using the removed `Configuration` methods directly, you need to update your code:

**Before:**
```typescript
import { Configuration } from 'crawlee';

const config = Configuration.getGlobalConfig();
const storageBackend = config.getStorageClient();
const eventManager = config.getEventManager();

// or static methods
const storageBackend = Configuration.getStorageClient();
// (both of these are the removed v3 APIs)
```

**After:**
```typescript
import { serviceLocator } from 'crawlee';

const storageBackend = serviceLocator.getStorageBackend();
const eventManager = serviceLocator.getEventManager();
```

#### Using per-crawler services (recommended)

The new `ServiceLocator` supports per-crawler service isolation, allowing you to use different storage backends or event managers for different crawlers by passing them via options:

```typescript
import { BasicCrawler, Configuration, LocalEventManager, MemoryStorageBackend } from 'crawlee';

const crawler = new BasicCrawler({
    requestHandler: async ({ request, log }) => {
        log.info(`Processing ${request.url}`);
    },
    configuration: new Configuration({ headless: false }),
    storageBackend: new MemoryStorageBackend(),
    eventManager: LocalEventManager.fromConfiguration(),
});

await crawler.run(['https://example.com']);
```

#### Using the global service locator

For most use cases, the global `serviceLocator` singleton works well:

```typescript
import { serviceLocator, BasicCrawler, MemoryStorageBackend } from 'crawlee';

// Configure global services (optional)
serviceLocator.setStorageBackend(new MemoryStorageBackend());

// All crawlers will use the global service locator by default
const crawler = new BasicCrawler({
    requestHandler: async ({ request, log }) => {
        log.info(`Processing ${request.url}`);
    },
});
```

#### Accessing configuration

`Configuration.getGlobalConfiguration()` remains as a utility function, but in most cases, you should use `serviceLocator.getConfiguration()` instead:

```typescript
import { serviceLocator } from 'crawlee';

const config = serviceLocator.getConfiguration();
```

Despite its name, `getGlobalConfiguration()` returns the configuration of the currently active service locator, which is not always the global one — prefer `serviceLocator.getConfiguration()`.

#### `config` is renamed to `configuration` everywhere

v3 used `config` and `configuration` interchangeably. v4 settles on `configuration`.

Renamed methods:

| Before | After |
| --- | --- |
| `Configuration.getGlobalConfig()` | `Configuration.getGlobalConfiguration()` |
| `LocalEventManager.fromConfig()` | `LocalEventManager.fromConfiguration()` |

Renamed options — pass `configuration` instead of `config`:

- `Dataset.open()`, `KeyValueStore.open()` and `RequestQueue.open()` (`StorageOpenOptions`)
- `useState()` (`UseStateOptions`)
- `purgeDefaultStorages()` (both the options object and the legacy positional argument)
- `new Snapshotter()` (`SnapshotterOptions`)
- `saveSnapshot()` in `@crawlee/playwright` and `@crawlee/puppeteer` (`SaveSnapshotOptions`)
- `RecoverableStateOptions`, `RequestListOptions`, `CpuLoadSignalOptions` and `MemoryLoadSignalOptions`

**Before:**
```typescript
const store = await KeyValueStore.open(null, { config: new Configuration({ persistStorage: false }) });
```

**After:**
```typescript
const store = await KeyValueStore.open(null, { configuration: new Configuration({ persistStorage: false }) });
```

Renamed properties — `Dataset.config`, `KeyValueStore.config`, `Snapshotter.config` and `BrowserLauncher.config` (including `PlaywrightLauncher`, `PuppeteerLauncher` and `StagehandLauncher`) are now `.configuration`.

The `configuration` crawler option is unchanged, as are `serviceLocator.getConfiguration()` and `serviceLocator.setConfiguration()`.

### Navigation and the request handler are timed separately

In v3, navigation ran inside the request handler's time window, and the two options were summed (plus an undocumented 10 second buffer) to form the actual limit. Setting `requestHandlerTimeoutSecs: 60` on a `PlaywrightCrawler` therefore produced errors complaining about 130 seconds.

Navigation and the request handler are now timed independently, and each reports itself:

| Option | Covers | Default |
| --- | --- | --- |
| `requestHandlerTimeoutSecs` | your `requestHandler` only | 60 |
| `navigationTimeoutSecs` | the `preNavigationHooks`, the navigation, and the `postNavigationHooks` together | 30 (HTTP), 60 (browser) |

`navigationTimeoutSecs` is a single budget shared by the whole navigation phase, so a slow hook eats into the same window the navigation uses. The separate `navigationHooksTimeoutSecs` option has been removed.

Two things to watch for when upgrading:

- **Navigation hooks are now bounded.** They had no timeout of their own before, so a `preNavigationHooks` / `postNavigationHooks` function that pushes the whole phase past `navigationTimeoutSecs` will now fail the request. Raise `navigationTimeoutSecs`, or call `context.extendTimeout()` from inside the hook when the extra time is only needed occasionally.
- **A request can no longer hang forever.** An internal timeout now bounds the whole request, covering the phases that have no timeout of their own (`extendContext`, the robots.txt check, response processing). By default it is deliberately generous (twice the request handler timeout, and never less than 5 minutes), so it only fires when a request is genuinely stuck. Set `CRAWLEE_INTERNAL_TIMEOUT` (in milliseconds) to override it. A value below the navigation and request handler timeouts is ignored — the crawler warns at startup and keeps the timeout above them so those phases are never cut short.

### Per-route and per-request handler timeouts

`requestHandlerTimeoutSecs` still applies to every request alike, but a single route can now opt out of it — useful when one page type needs markedly more time than the rest, and you do not want to raise the timeout for everything else to accommodate it:

```typescript
router.addHandler('LIST', async ({ enqueueLinks }) => { ... }, { requestHandlerTimeoutSecs: 120 });
router.addHandler('DETAIL', async ({ pushData }) => { ... }); // keeps the crawler's default
```

When the time needed is only apparent once the handler is already running, `context.extendTimeout()` buys it more:

```typescript
router.addHandler('LIST', async ({ page, extendTimeout }) => {
    const pageCount = await countPages(page);
    extendTimeout(pageCount * 10);
    await scrapeAllPages(page);
});
```

### `useSessionPool` and `sessionPoolOptions` are removed

The `useSessionPool` and `sessionPoolOptions` options have been removed from the `BasicCrawler` constructor. Every crawler now uses a `SessionPool` by default. Instead of passing `sessionPoolOptions`, create a `SessionPool` instance directly and pass it via the `sessionPool` option.

```typescript
import { SessionPool } from '@crawlee/core';

const crawler = new BasicCrawler({
    // The old parameters won't work anymore
    // useSessionPool: true,
    // sessionPoolOptions: { maxUsageCount: 5 },
    sessionPool: new SessionPool({
        maxUsageCount: 5,
    }),
});
```

### `SessionPool` is now lazy-initialized

`SessionPool.open()` static factory method is removed. Create instances with `new SessionPool(options)` instead — all public methods automatically initialize the pool on first use.

`SessionPool.usableSessionsCount` and `SessionPool.retiredSessionsCount` are now async methods instead of synchronous getters. `SessionPool.getState()` is also async now.

**Before:**
```typescript
const sessionPool = await SessionPool.open({ maxPoolSize: 100 });
const count = sessionPool.usableSessionsCount;
const state = sessionPool.getState();
```

**After:**
```typescript
const sessionPool = new SessionPool({ maxPoolSize: 100 });
const count = await sessionPool.usableSessionsCount();
const state = await sessionPool.getState();
```

### `retireOnBlockedStatusCodes` is removed from `Session`

`Session.retireOnBlockedStatusCodes` is removed. Blocked status code handling is now internal to the crawler. Configure blocked status codes via the `blockedStatusCodes` crawler option (moved from `sessionPoolOptions`).

### `maxSessionRotations` and `request.sessionRotationCount` are removed

Session errors no longer have their own retry budget. The `maxSessionRotations` crawler option, the `Request.sessionRotationCount` property, and the special-case retry logic for `SessionError` are all gone. A `SessionError` now retires the session and counts toward `maxRequestRetries` like any other failure, so configure a single retry limit via `maxRequestRetries` (default `3`). `SessionError` also no longer extends `RetryRequestError` — if you were catching `RetryRequestError` to detect a session-triggered retry, branch on `SessionError` directly instead.

### Cookie handling in `HttpCrawler` and `sendRequest`

Cookie handling was refactored to be simpler and more predictable. The `BaseHttpClient` is now the single place where the `Cookie` request header is assembled, by merging cookies from the session's cookie jar with any `Cookie` header already present on the request. Explicit `Cookie` headers take precedence over jar cookies with the same name.

This means `sendRequest` now respects user-provided cookies. In v3, passing a `Cookie` header via `sendRequest` headers was silently overwritten by the session's cookie jar — this is no longer the case.

The precedence (highest to lowest) is:

1. `sendRequest` `Cookie` header and `cookieJar` overrides
2. `Cookie` header set directly on the request (via `request.headers`)
3. Session cookie jar (persisted cookies received from `Set-Cookie` response headers or set manually)

To fully replace the cookie jar for a `sendRequest` call, pass a custom `cookieJar` in the options:

```typescript
import { CookieJar } from 'tough-cookie';

const jar = new CookieJar();
await jar.setCookie('my=cookie', request.url);
const response = await sendRequest({ url: '...' }, { cookieJar: jar });
```

The protected `HttpCrawler._applyCookies` method is removed. If you were overriding it in a subclass, move your logic to a `preNavigationHook` that sets cookies on `request.headers.Cookie` or on the `session` cookie jar directly.

`mergeCookies` now skips malformed cookie fragments with a warning instead of throwing.

#### `Session.getCookies`, `setCookies` and `setCookiesFromResponse` are removed

The public cookie helper methods on `Session` — `getCookies(url)`, `setCookies(cookies, url)`, and `setCookiesFromResponse(response)` — have been removed as part of centralizing cookie assembly in `BaseHttpClient`. Work with the session's `cookieJar` directly, or use the new `Session.getCookieString(url)` to read the assembled `Cookie` header value.

**Before:**
```typescript
const cookies = session.getCookies(url);
session.setCookies([{ name: 'foo', value: 'bar' }], url);
session.setCookiesFromResponse(response);
```

**After:**
```typescript
// Read the Cookie header string for a URL:
const cookieHeader = session.getCookieString(url);

// Set / read cookies via the jar directly:
await session.cookieJar.setCookie('foo=bar', url);
const cookieHeader2 = await session.cookieJar.getCookieString(url);
```

### `persistCookiesPerSession` renamed to `saveResponseCookies`

The `persistCookiesPerSession` crawler option has been renamed to `saveResponseCookies` on both `HttpCrawler` (and its subclasses like `CheerioCrawler`, `JSDOMCrawler`, etc.) and `BrowserCrawler`. When enabled (the default), response cookies are stored in the session's cookie jar so they're sent on subsequent requests using the same session. Rename the option in your crawler constructor options to migrate.

### Browser cookies are also persisted after `requestHandler`

Previously, `BrowserCrawler` with `saveResponseCookies` (formerly `persistCookiesPerSession`) only copied cookies from the page into the session after navigation and **before** `requestHandler` ran. Cookies set during the handler — login flows, `page.setCookie()`, or XHR/`fetch` `Set-Cookie` responses — were not stored on the session for later requests.

In v4, when `saveResponseCookies` is enabled (the default), browser cookies are also re-read and stored in the session cookie jar **after** `requestHandler` completes. If you relied on handler-set cookies staying page-local and not affecting later requests on the same session, set `saveResponseCookies: false` or clear/overwrite cookies on the session explicitly.

### `browserPoolOptions` is removed

`browserPoolOptions` is gone from every browser crawler. It was a second way of configuring the very pool that the `browserPool` option accepts, and the two could not be combined — passing a pool made the options silently disappear.

Build the pool with the factory that matches your crawler instead. Each factory takes every `BrowserPool` option plus the crawler's own `launchContext` and `headless`, and derives the browser plugin from them, so the pool can never mismatch the crawler it is passed to:

| crawler | factory | remote counterpart |
| --- | --- | --- |
| `PlaywrightCrawler` | `playwrightBrowserPool()` | `remotePlaywrightBrowserPool()` |
| `PuppeteerCrawler` | `puppeteerBrowserPool()` | `remotePuppeteerBrowserPool()` |
| `StagehandCrawler` | `stagehandBrowserPool()` | `remoteStagehandBrowserPool()` |

**Before:**
```typescript
const crawler = new PlaywrightCrawler({
    browserPoolOptions: { useFingerprints: false },
    launchContext: { launcher: firefox },
});
```

**After:**
```typescript
const crawler = new PlaywrightCrawler({
    browserPool: playwrightBrowserPool({
        useFingerprints: false,
        launchContext: { launcher: firefox },
    }),
});
```

Building the pool outside the crawler has one consequence worth knowing: a pool passed as `browserPool` is borrowed, so the crawler never destroys it, and the options that would have configured a pool of the crawler's own — `launchContext`, `headless` and `remoteBrowser` — are now **rejected** instead of silently ignored. Move them into the factory call.

`remoteBrowser` keeps working on its own for the terse case; reach for a `remote*BrowserPool()` factory when you also want to tune the pool wrapping the remote connection, or to share one remote pool between crawlers.

`headless` is now declared on each concrete crawler rather than on `BrowserCrawler`, so the puppeteer-only `'new'` and `'old'` values are only accepted by `PuppeteerCrawler`.

### `ignoreSslErrors` is renamed to `ignoreTlsErrors`

The crawler option is renamed to `ignoreTlsErrors`, matching the naming used everywhere else in v4 (`session.proxyInfo.ignoreTlsErrors`, the browser pool, the impit client). The old `ignoreSslErrors` name is no longer accepted — rename it in your crawler options. Behavior is unchanged from v3: the option defaults to `true` and HTTP crawlers accept invalid TLS certificates by default.

Under the hood the crawler now forwards the option to the HTTP client as `SendRequestOptions.ignoreTlsErrors` on every navigation request, and the same flag is enabled automatically for MITM proxy sessions (`session.proxyInfo.ignoreTlsErrors`), matching the browser crawlers.

This only affects custom `BaseHttpClient` implementations: honor `ignoreTlsErrors` (from `SendRequestOptions`, or `CustomFetchOptions` when extending the `BaseHttpClient` class from `@crawlee/http-client`) if your client can disable TLS verification. The built-in impit and got-scraping clients do; the native fetch fallback cannot, so it warns and ignores the flag.

### `preNavigationHooks` in `HttpCrawler` no longer accepts `gotOptions` object

The `preNavigationHooks` option in `HttpCrawler` subclasses no longer accepts the `gotOptions` object as a second parameter. Modify the `crawlingContext` fields (e.g. `.request`) directly instead.

### Browser navigation hooks no longer receive `gotoOptions` as a second argument

The `preNavigationHooks` and `postNavigationHooks` of the browser crawlers (`PlaywrightCrawler`, `PuppeteerCrawler`) received the options object forwarded to `page.goto()` as a second parameter in v3. The hooks now receive only the crawling context, and the `page.goto()` options are available as its `gotoOptions` member, which can be mutated in place:

```ts
// v3
preNavigationHooks: [
    async (crawlingContext, gotoOptions) => {
        gotoOptions.timeout = 60_000;
    },
],

// v4
preNavigationHooks: [
    async ({ gotoOptions }) => {
        gotoOptions.timeout = 60_000;
    },
],
```

### Removed crawling context properties

#### Crawling context no longer includes Error for failed requests

The crawling context no longer includes the `Error` object for failed requests. Use the second parameter of the `errorHandler` or `failedRequestHandler` callbacks to access the error.

#### Crawling context no longer includes a reference to the crawler itself

This was previously accessible via `context.crawler`. If you want to restore the functionality, you may use the `extendContext` option of the crawler:

```typescript
const crawler = new CheerioCrawler({
  extendContext: () => ({ crawler }),
  requestHandler: async (context) => {
    if (Math.random() < 0.01) {
      context.crawler.stop()
    }
  }
})
```

`extendContext` runs **before navigation**, so the members it returns are visible to the `preNavigationHooks`, `postNavigationHooks`, and the `requestHandler` alike. As a consequence, the `context` passed to `extendContext` is the pre-navigation context and does **not** include navigation-dependent members (e.g. `page`, `response`, `$`, `body`). If your extension needs to read those, do it in a `postNavigationHook` or the `requestHandler` instead.

#### Crawling context no longer includes `closeCookieModals`

The `closeCookieModals` context helper is removed from the Playwright and Puppeteer crawlers, along with the `playwrightUtils.closeCookieModals` / `puppeteerUtils.closeCookieModals` functions and the optional `idcac-playwright` peer dependency they were built on.

See the [cookie modals guide](../guides/cookie-modals) for the replacements, including a drop-in `preNavigationHook` built on `@duckduckgo/autoconsent`.

### Crawling context is strictly typed

Previously, the crawling context extended a `Record` type, allowing to access any property. This was changed to a strict type, which means that you can only access properties that are defined in the context.

### The default HTTP client is now `impit`

The HTTP crawlers (and `sendRequest`) no longer use `got-scraping` by default. The default client is now `ImpitHttpClient` from the optional `@crawlee/impit-client` package (a Rust-based client with TLS fingerprint impersonation); when it is not installed, the crawlers fall back to a plain `fetch`-based client with a logged warning (no proxy support or impersonation). To keep using `got-scraping`, install `@crawlee/got-scraping-client` and pass `httpClient: new GotScrapingHttpClient()` explicitly.

Note that the session's fingerprint drives the impersonation: each new session gets a randomized realistic fingerprint by default, and its `browser` hint overrides the `browser` option passed to the `ImpitHttpClient` constructor. To force a specific browser family, pin the fingerprint on the sessions instead:

```ts
const crawler = new CheerioCrawler({
    httpClient: new ImpitHttpClient({ browser: Browser.Firefox }),
    sessionPool: new SessionPool({
        createSessionFunction: async (opts) =>
            new Session({
                ...opts?.sessionOptions,
                fingerprint: { browser: 'firefox', platform: 'linux', device: 'desktop' },
            }),
    }),
});
```

See the [Avoid getting blocked](https://crawlee.dev/js/docs/guides/avoid-blocking) guide for how the session fingerprint interacts with both HTTP and browser crawlers.

### `HttpClient` instances return `Response` objects

The interface of `HttpClient` instances was changed to return the [native `Response` objects](https://developer.mozilla.org/en-US/docs/Web/API/Response) instead of custom `HttpResponse` objects.

### `CrawlingContext.response` is now of type `Response`

The `CrawlingContext.response` property is now of type [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) instead of `HttpResponse`. `CrawlingContext.sendRequest` method now returns `Response` objects as well.

### Multiple crawler instances use separate default request queues

In v3, every `BasicCrawler` (or subclass) that didn't receive an explicit `requestQueue` option would open the same default request queue. If you created two crawlers in the same process, they would silently share a queue — leading to request collisions and hard-to-debug deduplication issues.

In v4, only the **first** crawler instance uses the default request queue. Each subsequent instance automatically gets its own queue via an internal alias (e.g. `__default_1__`, `__default_2__`, etc.). This means multiple crawlers can safely coexist without interfering with each other's requests.

If you explicitly pass a `requestQueue` (or `requestManager`) to the crawler, that queue is used as-is regardless of instance order.

### Repeated `run()` calls no longer empty the request queue

In v3, calling `crawler.run()` again on the same instance dropped the default request queue and created a fresh one, so the same URLs were crawled again — but only for a queue actually named `default`, which the Apify platform's default queue is not, so on the platform the second run silently crawled nothing.

v4 does the same thing everywhere: nothing is emptied between runs. A repeated `run()` continues with the same request manager, and requests the previous run handled — a failed request counts as handled — are not processed again. Any crawl that ends up processing nothing while its request manager holds only handled requests warns and says why, instead of finishing silently; that also covers a second crawler sharing the queue, or a queue a previous process already worked through.

The `purgeRequestQueue` option of `crawler.run()` went away with the automatic purge. To crawl the same requests again, empty the queue yourself:

```typescript
const crawler = new BasicCrawler({ requestHandler: async ({ request }) => { /* ... */ } });
await crawler.run(['https://example.com/a', 'https://example.com/b']);

const requestManager = await crawler.getRequestManager();
await requestManager.purge?.();

// The same URLs are crawled again:
await crawler.run(['https://example.com/a', 'https://example.com/c']);
```

`purge()` — empty the storage, keep its id and name — is new in v4 and available on `Dataset`, `KeyValueStore` and `RequestQueue`, as well as being an optional method on the `IRequestManager` interface. The Apify platform is the exception. Its API has no in-place empty, so all three throw there. The error points you at `drop()` or a fresh storage.

This has nothing to do with `purgeOnStart` / `CRAWLEE_PURGE_ON_START`, which still wipes the default storages once per process before the first run.

Most of the time you can avoid the purge entirely. Every crawler instance opens a request queue of its own (see the section above). A crawler per crawl therefore needs neither a purge nor any queue wiring. Pass `RequestQueue.open({ alias })` when you do want to hold on to that queue:

```typescript
for (const [index, urls] of batches.entries()) {
    const crawler = new BasicCrawler({
        // Optional — a fresh crawler gets its own queue anyway. Pass one to decide which.
        requestManager: await RequestQueue.open({ alias: `batch-${index}` }),
        requestHandler: async ({ request }) => { /* ... */ },
    });

    await crawler.run(urls);
}
```

An alias identifies a run-scoped queue. It has no persistent name, and is emptied on start along with the default storages. Reuse an alias and you get that same queue back, handled requests included. The next crawl then finds nothing to do. Give each crawl its own alias. `purge()` is for when one crawler and one queue must be reused.

### Storage `.open()` now also accepts `{ id?, name? }`

`Dataset.open()`, `KeyValueStore.open()`, and `RequestQueue.open()` previously accepted a single `idOrName?: string` parameter. This was ambiguous — callers couldn't express whether they were opening a storage by its ID or by name.

The first parameter now also accepts a `StorageIdentifier` object with separate `id` and `name` fields:

```typescript
interface StorageIdentifier {
    id?: string;
    name?: string;
}
```

Passing a plain string still works — it is first looked up as an ID, and if no such storage exists, it is treated as a name (matching the v3 behavior):

```typescript
const dataset = await Dataset.open('my-dataset');
const store = await KeyValueStore.open('my-store');
const queue = await RequestQueue.open('my-queue');
```

You can also use the object form, which additionally allows opening a storage by ID:

```typescript
const dataset = await Dataset.open({ name: 'my-dataset' });

// Opening by ID (e.g. on the Apify platform):
const dataset = await Dataset.open({ id: 'WkzbQMuFYuamGv3YF' });
```

Opening the default storage (no arguments or `null`) still works as before:

```typescript
const dataset = await Dataset.open();
```

The same change applies to `CrawlingContext.getKeyValueStore()` and `CrawlingContext.pushData()` — both now accept `string | StorageIdentifier` for identifying the target storage.

### Storage writes in request handlers are transactional

Every crawler now wraps each request in a **storage transaction** (see the [Transactional storage](../guides/result-storage#transactional-storage) section of the Result Storage guide): storage writes made anywhere in the request lifecycle — hooks, `extendContext` and the request handler alike — are recorded and only applied to real storage when the request handler succeeds. A handler that throws leaves no partial writes behind, and a retry does not duplicate data.

The observable behavior of a *successful* handler is unchanged (reads within a handler see its own writes), but several things differ on the failure path and around handler boundaries:

- **Uncommitted writes are invisible to other handlers.** Using the key-value store as a live channel between concurrently running handlers no longer works — one handler's `setValue()` only becomes visible to others once its request succeeds. Use `useState()` for cross-handler communication.
- **`useState()` / `getAutoSavedValue()` are *not* transactional.** The shared state object stays live; mutations of it are not rolled back when a handler fails.
- **Request queue additions are applied immediately by default** (the `writeThrough` policy) and are not rolled back — deduplication by `uniqueKey` keeps retries idempotent. Pass `transactionalStorage: { requestQueue: 'deferred' }` for strict all-or-nothing enqueues.
- **Commit is at-least-once.** It spans multiple storages, so a commit that fails partway fails the request; the retry may re-apply writes that already landed.
- **`KeyValueStore.setValue()` with a stream value throws inside a request handler.** A stream can only be consumed once, so it cannot be buffered. Wrap the call in `withDirectStorageAccess()` to write it immediately:

  ```typescript
  import { withDirectStorageAccess } from 'crawlee';

  await withDirectStorageAccess(async () => keyValueStore.setValue('video', stream, { contentType: 'video/mp4' }));
  ```

- **`drop()`, `purge()` and the request queue processing internals throw inside a request handler**, since no rollback could undo them. `withDirectStorageAccess()` is the escape hatch there, too.
- **Key listing order changes inside a handler**: `keys()`, `values()` and `entries()` emit the handler's own (buffered) keys first, then the rest.

The mechanism can be disabled entirely with `transactionalStorage: false` on any crawler except `AdaptivePlaywrightCrawler` (which needs it to discard the writes of its losing request handler attempts).

#### Removed symbols and options

- `checkStorageAccess` and `withCheckedStorageAccess` are superseded by the transaction mechanism; the per-call-site helper is now `withDirectStorageAccess()`.
- The experimental `AdaptivePlaywrightCrawler` no longer needs its bespoke write-buffering machinery: the `preventDirectStorageAccess` option is gone (direct storage calls are now captured by the per-attempt transaction instead of throwing), and `RequestHandlerResult` is replaced by the read-only `StorageTransactionView`, which the `resultChecker` / `resultComparator` callbacks (and `fullResultComparator`) now receive. The view keeps the familiar accessors (`datasetItems`, `enqueuedUrls`, `keyValueStoreChanges`), so most callbacks only need a type change. The `calls` and `enqueuedUrlLists` accessors are gone — `requestsFromUrl` sources are now expanded when added, so the fetched URLs appear in `enqueuedUrls` (and are what `fullResultComparator` compares).

### `storageObject` is removed from storage classes

The `storageObject` property (the raw backend record exposed on `Dataset`, `KeyValueStore` and `RequestQueue` instances) is removed. The commonly used fields are available directly on the instance as `id` and `name`, and `Dataset.getInfo()` returns the full metadata:

```ts
// v3
const { id, name } = dataset.storageObject;

// v4
const { id, name } = dataset;
const info = await dataset.getInfo();
```

### `KeyValueStore.getPublicUrl` is now async

The `KeyValueStore.getPublicUrl` method is now asynchronous and reads the public URL directly from the storage backend.

### `globs`, `regexps`, and `pseudoUrls` replaced by `include`

The separate `globs`, `regexps`, and `pseudoUrls` URL-filtering options of `enqueueLinks()`, the click-elements enqueue helpers, and `SitemapRequestLoader` have been collapsed into a single `include` option (mirroring the already-unified `exclude` option).

The `PseudoUrl` class is no longer exported and the `@apify/pseudo_url` dependency has been dropped. Rewrite any pseudo-URL patterns as globs or regular expressions.

Per-pattern request options (`label`, `userData`, `method`, `payload`, `headers` set directly on a pattern object) are no longer supported. Use the top-level `label` / `userData` options, or `transformRequestFunction`, to set request options for the enqueued requests.

**Before:**
```typescript
await enqueueLinks({
    globs: ['https://crawlee.dev/docs/**'],
    regexps: [/\/blog\//],
});
```

**After:**
```typescript
await enqueueLinks({
    include: ['https://crawlee.dev/docs/**', /\/blog\//],
});
```

#### Migrating `pseudoUrls`

A `PseudoUrl` is equivalent to an anchored regular expression: the text inside `[ ]` is the pattern (a wildcard), everything outside it is matched literally, and the whole URL is anchored. Translate each pseudo-URL to a `RegExp` (or a glob, if the pattern is simple enough):

**Before:**
```typescript
await enqueueLinks({
    pseudoUrls: ['https://crawlee.dev/[.*]'],
});
```

**After:**
```typescript
await enqueueLinks({
    // faithful translation — [.*] becomes .*, literal text is escaped and anchored
    include: [/^https:\/\/crawlee\.dev\/.*$/],
    // or, when the pattern is simple, an equivalent glob:
    // include: ['https://crawlee.dev/**'],
});
```

#### `include` patterns no longer replace the enqueue strategy

In v3, providing any URL patterns (`globs`, `regexps`, `pseudoUrls`) disabled the default enqueue strategy - the patterns were the only filter. In v4, the `strategy` **always applies** and is combined with `include` using AND logic: a URL must match an `include` pattern *and* satisfy the strategy (default `same-hostname`) to be enqueued. This mirrors the behavior of Crawlee for Python.

The practical consequence: patterns that used to match URLs on other hostnames (e.g. subdomains) now silently enqueue nothing unless you relax the strategy explicitly:

```ts
// v3 - the glob alone allowed subdomains
await enqueueLinks({
    globs: ['https://*.example.com/'],
});

// v4 - the default same-hostname strategy would filter the subdomains out again,
// so relax it explicitly
await enqueueLinks({
    include: ['https://*.example.com/'],
    strategy: 'same-domain',
});
```

### `transformRequestFunction` precedence in `enqueueLinks`

The `transformRequestFunction` callback in `enqueueLinks` now runs **after** URL pattern filtering (`include`, `exclude`) instead of before. This means it has the highest priority and can overwrite any request options set by the global `label` / `userData` options.

The priority order is now (lowest to highest):
1. Global `label` / `userData` options
2. `transformRequestFunction`

The `transformRequestFunction` callback receives a `RequestOptions` object and can return either:
- The modified `RequestOptions` object
- A new `RequestOptions` plain object
- `'unchanged'` to keep the original options as-is
- A falsy value or `'skip'` to exclude the request from the queue

### `enqueueLinks()` return value reshaped: `AddRequestsBatchedResult` instead of `BatchAddRequestsResult`

`enqueueLinks()` (and `context.addRequests()`) now return the same `AddRequestsBatchedResult` object that `crawler.addRequests()` / `queue.addRequestsBatched()` already returned in v3, instead of repackaging it into the legacy `BatchAddRequestsResult` shape:

| Before (`BatchAddRequestsResult`) | After (`AddRequestsBatchedResult`) |
| --- | --- |
| `processedRequests` | `addedRequests` |
| `unprocessedRequests` (always `[]` — `enqueueLinks()` never actually populated it) | *(removed — retries are handled internally, see "`RequestQueue.addRequestsBatched` no longer retries rejected requests" below)* |
| *(not exposed)* | `waitForAllRequestsToBeAdded` — a promise resolving with the requests added in batches after the first (new) |
| *(not exposed)* | `requestsOverLimit` — requests dropped because of the `limit` / `maxRequestsPerCrawl` budget (new) |

**Before:**
```typescript
const { processedRequests } = await enqueueLinks();
```

**After:**
```typescript
const { addedRequests } = await enqueueLinks();
```

### `extractLinks()`: extracting URLs without enqueueing them

Crawling contexts that support `enqueueLinks()` (Cheerio, JSDOM, LinkeDOM, and browser-based crawlers) now also expose an `extractLinks()` helper that returns the matching URLs as strings, without adding them to the request queue:

```typescript
const urls = await extractLinks({ selector: '.product-link' });
```

`enqueueLinks()` itself is unchanged in behavior — it now calls `extractLinks()` internally and forwards the URLs to `context.addRequests()`.

### `context.addRequests()` now applies `enqueueLinks`-style filtering, and `BasicCrawler` no longer has `enqueueLinks`

`context.addRequests()` (and `crawler.addRequests()`) accept the same `include` / `exclude` / `strategy` / `transformRequestFunction` / `onSkippedRequest` options as `enqueueLinks()`, and resolve `baseUrl`-relative URLs the same way. Unlike `enqueueLinks()`, there is no implicit "current page" to anchor the strategy to, so `strategy` defaults to `EnqueueStrategy.All` here instead of `EnqueueStrategy.SameHostname`.

`context.addRequests()` also now returns an `AddRequestsBatchedResult` (previously it resolved to `void`).

`BasicCrawler` (and its `BasicCrawlingContext`) no longer has an `enqueueLinks()` method — `BasicCrawler` has no concept of a page to extract links from. `enqueueLinks()` remains available on crawlers with web content (`CheerioCrawler`, `HttpCrawler`-derived crawlers, `PlaywrightCrawler`, `PuppeteerCrawler`, etc.), now implemented in terms of `extractLinks()` + `addRequests()`.

The `robotsTxtFile` / `respectRobotsTxtFile` per-call options are removed from `enqueueLinks()` — robots.txt filtering is applied by the crawler consistently via `BasicCrawlerOptions.respectRobotsTxtFile`.

### `onSkippedRequest` receives a `Request` instead of a URL string

The callback now gets `{ request, reason }` instead of `{ url, reason }` — use `request.url` for the URL.

### Internal KVS keys renamed

Several internal Crawlee keys were prefixed with the `SDK_` prefix for legacy reasons — these keys now start with `CRAWLEE_` instead. These are, e.g., `CRAWLEE_SESSION_POOL_STATE` or `CRAWLEE_CRAWLER_STATISTICS_{n}`.

## Only if you subclassed crawlers or touched internals

Skip this section unless you subclass Crawlee classes, override `protected` members, or read fields that were never documented.

### Underscore prefix is removed from many protected and private methods

The leading underscore was dropped from protected and private class members across the codebase. The most visible rename is:

- `BasicCrawler._runRequestHandler` -> `BasicCrawler.runRequestHandler`

The file-system storage backends' shared `CachedIdClient._cachedId` protected field was also renamed to `cachedId` (this only affects custom `@crawlee/fs-storage` backends that subclass it).

If you subclass a crawler or implement a custom browser plugin, these `protected` extension points lost their underscore too:

- `BasicCrawler._init` -> `init`
- `BasicCrawler._throwOnBlockedRequest` -> `throwOnBlockedRequest`
- `BasicCrawler._getMessageFromError` -> `getMessageFromError`
- `BasicCrawler._getCookieHeaderFromRequest` -> `getCookieHeaderFromRequest`
- `BrowserCrawler._navigationHandler` -> `navigationHandler` (including the `PlaywrightCrawler`, `PuppeteerCrawler` and `StagehandCrawler` overrides)
- `BrowserPlugin._addProxyToLaunchOptions` -> `addProxyToLaunchOptions`
- `BrowserPlugin._isChromiumBasedBrowser` -> `isChromiumBasedBrowser`
- `BrowserPlugin._connectToRemoteBrowser` -> `connectToRemoteBrowser`
- `BrowserPlugin._throwAugmentedLaunchError` -> `throwAugmentedLaunchError`

Two `@internal` members were renamed the same way: `LaunchContext._remoteToken` -> `remoteToken` and `PlaywrightBrowser._setBrowserType` -> `setBrowserType`.

A handful of hooks intentionally keep the underscore, because the un-prefixed name is taken by their public wrapper method: `BrowserPlugin._launch` (wrapped by `launch()`) and `BrowserController._close`, `_kill`, `_newPage`, `_getCookies`, `_setCookies` (wrapped by the same names without the underscore). Custom plugin or controller implementations override these under their existing names, unchanged.

Members that were also made `private` in the same pass are listed under [Unintentionally exposed internals are now private](#unintentionally-exposed-internals-are-now-private) below.

### Private properties are native `#` fields now

Private class properties across the codebase were converted from TypeScript's compile-time `private` to native ECMAScript private fields (`#name`). Where a `private _foo` field backed a `get foo()` accessor, the field is now `#foo` — the public accessor is unchanged.

TypeScript's `private` was purely a compile-time construct: the properties still existed on the instances at runtime, so code could reach them via `(crawler as any).something` or `crawler['something']`, and they showed up in `Object.keys()`, object spread and `JSON.stringify()`. Native `#` fields close that hole — they are inaccessible outside the declaring class and invisible to enumeration and serialization. If you were reaching into any of them, that now fails at runtime, not just in the type checker. As with the visibility tightening above, the supported extension points (handlers, hooks, `ContextPipeline` composition and the `ISessionPool` / `IBrowserPool` / `IRequestManager` interfaces) are the way to go; open an issue if something you need is missing.

One related behavior change: `LaunchContext.extend()` now consistently rejects all declared fields as reserved keys — including `fingerprint`, `proxyUrl` and `remoteToken`, which previously slipped through the reserved-name check. Set those directly instead (e.g. `launchContext.fingerprint = ...`); `extend()` is only for attaching your own extra fields.

### Unintentionally exposed internals are now private

A number of class members were `public` or `protected` only by accident — they were never meant to be part of the extension surface, are not used by any subclass, and in most cases also carried a leading underscore to signal that. In v4 they are `private` (and where it applies, `readonly`). If you were reaching into any of these — either to read internal state or to override a helper in a subclass — that no longer compiles.

This is intentional: these were never a supported API. If you relied on overriding one of the now-private helpers, the supported extension points (the `requestHandler`, `errorHandler`, `failedRequestHandler`, `preNavigationHooks`/`postNavigationHooks`, `ContextPipeline` composition, and the `ISessionPool` / `IBrowserPool` / `IRequestManager` interfaces) should cover the same use cases. If something you genuinely need is missing, open an issue.

The change spans, among others:

- **`BasicCrawler`** — `unexpectedStop`, `requestHandlerTimeoutMillis`, `sameDomainDelayMillis`, `domainAccessedTime`, `handledRequestsCount`, `statusMessageLoggingInterval`, `statusMessageCallback`, `ignoreHttpErrorStatusCodes`, `taskLoopOptions` (was `autoscaledPoolOptions`), `autoscaledPool`, `respectRobotsTxtFile`, and the helpers `buildBasicContextPipeline`, `validateRequestUserData`, `pauseOnMigration`, `fetchNextRequest`, `delayRequest`, `handleRequest`, `timeoutAndRetry`, `isTaskReadyFunction`, `defaultIsFinishedFunction`, `requestFunctionErrorHandler`, `handleFailedRequestHandler`, `canRequestBeRetried`
- **`HttpCrawler`** — `preNavigationHooks`, `postNavigationHooks`, `saveResponseCookies`, `navigationTimeoutMillis`, `suggestResponseEncoding`, `forceResponseEncoding`, `supportedMimeTypes`, and the helpers `requestFunction`, `parseResponse`, `getRequestOptions`, `encodeResponse`, `extendSupportedMimeTypes`, `handleRequestTimeout`
- **`AutoscaledPool`** — the whole class is `@internal` in v4, so its members are not enumerated here; see [`AutoscaledPool` is no longer public API](#autoscaledpool-is-no-longer-public-api)
- **`SessionPool`** — all pool internals (`log`, `maxPoolSize`, `createSessionFunction`, `keyValueStore`, `sessions`, `sessionMap`, `sessionOptions`, `persistStateKey`, `persistStateKeyValueStoreId`, `events`, `persistenceOptions`, `sessionReuseStrategy`, and the helpers `ensureInitialized`, `maybeLoadSessionPool`, `registerSession`, `createSession`, `hasSpaceForSession`, `pickSession`, `removeRetiredSessions`, `getRandomIndex`, `defaultCreateSessionFunction`)
- **`Session`** — `maybeSelfRetire` (`userData` is now `readonly`)
- **`RequestList`** — all `_`-prefixed helpers (`addFetchedRequests`, `addPersistedRequests`, `addRequest`, `addRequestsFromSources`, `ensureInProgress`, `ensureIsInitialized`, `ensureUniqueKeyValid`, `fetchRequestsFromUrl`, `getPersistedState`, `loadStateAndPersistedRequests`, `persistRequests`, `restoreState`)
- **`RequestQueue`** — `proxyConfiguration`, `requestCache`, `requestSeenCache`, `queuePausedForMigration`, `inProgressRequestBatchCount`, `expectedRequestProcessingSecs`, `httpClient`, `events`, and the helpers `cacheRequest`, `fetchRequestsFromUrl`, `addFetchedRequests` (`id`, `name`, `backend`, `log` are now `readonly`)
- **`ProxyConfiguration`** — `nextCustomUrlIndex`, `proxyUrls`, `newUrlFunction`, and the helpers `handleProxyUrlsList`, `callNewUrlFunction`, `throwCannotCombineCustomMethods`, `throwNoOptionsProvided` (the internal `log` field and `usedProxyUrls` map are removed; `isManInTheMiddle` is now `readonly`)
- **`Statistics`** — `saveRetryCountForJob`, `teardown`, `keyValueStore` (`errorTracker`, `errorTrackerRetry` are now `readonly`, and `state` / `requestRetryHistogram` are getters)
- **`SystemStatus`** — `isSystemIdle`
- **`Router`** — the constructor is now `private`; use the static `Router.create()` factory
- **`BaseHttpClient`** — `log` (subclasses receive it via the constructor `logger` option instead of reading `this.log`)
- **`JSDOMCrawler`** — `runScripts`, `hideInternalConsole`, `virtualConsole`
- **`AdaptivePlaywrightCrawler`** — `commitResult`, `allowStorageAccess`, `enqueueLinks`
- **`RenderingTypePredictor`** — `calculateFeatureVector`, `retrain`
- **`BrowserCrawler`** — `navigationTimeoutMillis`, `preNavigationHooks`, `postNavigationHooks`, `saveResponseCookies` (now `private readonly`; configure them through the constructor options as before), and the helpers `isRequestBlocked`, `applyCookies` (was `_applyCookies`), `handleNavigationTimeout` (was `_handleNavigationTimeout`), `throwIfProxyError` (was `_throwIfProxyError`)
- **`BrowserLauncher`** — the helpers `getChromeExecutablePath`, `getTypicalChromeExecutablePath`, `validateProxyUrlProtocol` (were `_`-prefixed). `getDefaultHeadlessOption` (was `_getDefaultHeadlessOption`) stays `protected` — it is an override point (`PuppeteerLauncher` overrides it) — but lost its underscore prefix
- **`RobotsTxtFile.load` and `Sitemap.parse`** — internal static factory helpers, now `private` (use the public `RobotsTxtFile.from` / `Sitemap.load` / `Sitemap.fromXmlString` entry points)
- Various internal fields on `BrowserController` (`id`, `browserPlugin`, `log`) and `BrowserPlugin` (`name`, `library`, `launchOptions`, `proxyUrl`, `userDataDir`, `browserPerProxy`, `ignoreProxyCertificate`, `log`) are now `readonly`

### The `RequestQueue` constructor no longer takes a `Configuration`

The internal `RequestQueue` constructor dropped its second `config: Configuration` parameter (it also stopped exposing a `protected config` field). You should not be constructing `RequestQueue` directly anyway — use `RequestQueue.open()`, which resolves configuration for you.

### Crawler generic parameters and handler types changed

To support the new `ContextPipeline` / `extendContext` composition, the crawler classes gained additional generic type parameters. `BasicCrawler<Context>` is now `BasicCrawler<Context, ContextExtension, ExtendedContext>`, and the same pattern was propagated to `HttpCrawler`, `CheerioCrawler`, `JSDOMCrawler`, `LinkeDOMCrawler`, `PuppeteerCrawler`, `PlaywrightCrawler`, `StagehandCrawler`, and their `*Options` interfaces. This only affects you if you **explicitly annotated** crawler generics or **subclassed** a crawler while narrowing its `Context` — in that case the compiler now expects the extra parameters (and a matching `contextPipelineBuilder`). Most users, who let the types be inferred, are unaffected.

The exported handler types were reshaped accordingly. `ErrorHandler` and `RequestHandler` no longer wrap their context in `LoadedContext<...>`; `ErrorHandler` now takes two type parameters (`ErrorHandler<BaseContext, ExtendedContext>`), receiving `inputs: BaseContext & Partial<ExtendedContext>`. The `RestrictedCrawlingContext` and `LoadedContext` types are no longer exported from `@crawlee/basic`. If you imported or annotated these directly, update the references; if you only used the crawler options' `requestHandler` / `errorHandler` / `failedRequestHandler` callbacks with inferred parameter types, nothing changes.

### Navigation hook types are now generic

`PlaywrightHook`, `PuppeteerHook` and `StagehandHook` are now type aliases (previously interfaces) generic over the request's `userData` type. A hook that types its context — via the generic (e.g. `PlaywrightHook<MyUserData>`) or an explicit context annotation — is now assignable to the `preNavigationHooks` / `postNavigationHooks` options of an untyped crawler. If you extended one of these interfaces, use an intersection type instead.

### `RecoverableState` reshaped

`serialize` and `deserialize` now take and return values rather than strings (so v3 records will not load) and each also accept a [Standard Schema](https://standardschema.dev) — a zod codec works as `deserialize` directly — `reset()` is synchronous, no longer clears the persisted record (the new `resetStore()` does) and doubles as a way to establish the state without awaiting `initialize()`, `persistStateKvsName` and `persistStateKvsId` collapsed into a single `keyValueStore` option taking a store (or a pending `KeyValueStore.open()`), `defaultState` also accepts a factory (which you need for a state `structuredClone` cannot rebuild, as the deep copy no longer goes through `serialize`/`deserialize`), and there is a new `persistenceTimeoutMillis` option. `teardown()` is no longer terminal — `initialize()` can be called again to open another persistence window — and a write that fails during a periodic `PERSIST_STATE` or during `teardown()` is warned about rather than thrown. A direct `persistState()` still throws.

### The `log` crawler option is replaced by `logger`

The crawler constructors no longer accept a `log` option with an `@apify/log` `Log` instance. Pass a `logger` implementing the `CrawleeLogger` interface instead. To keep using an `@apify/log` instance (e.g. a `child()` with a custom prefix), wrap it in the `ApifyLogAdapter` from `@crawlee/core`:

```ts
// v3
import { CheerioCrawler, log } from 'crawlee';

const crawler = new CheerioCrawler({
    log: log.child({ prefix: 'MyCrawler' }),
});

// v4
import { ApifyLogAdapter, CheerioCrawler, log } from 'crawlee';

const crawler = new CheerioCrawler({
    logger: new ApifyLogAdapter(log.child({ prefix: 'MyCrawler' })),
});
```

Related: `crawler.log` and the crawling context `log` are typed as `CrawleeLogger`, which has no `setLevel()` method - level filtering belongs to the underlying logging library. With the default logger, set the level on the global `@apify/log` instance instead:

```ts
// v3
crawler.log.setLevel(LogLevel.DEBUG);

// v4
import log, { LogLevel } from '@apify/log';
log.setLevel(LogLevel.DEBUG);
```

### The `log` property is typed as `CrawleeLogger`

The `log` property exposed throughout the public API (on the crawling context, `Statistics`, `EventManager`, `SessionOptions`, `Dataset`, etc.) is now typed as the `CrawleeLogger` interface (from `@crawlee/types`) rather than the concrete `Log` class from `@apify/log`. If you consume it structurally — calling `log.info(...)`, `log.debug(...)`, `log.child(...)` — nothing changes. You only need to act if you explicitly annotated a variable or parameter with the `Log` type from `@apify/log` and assigned `context.log` to it; type it as `CrawleeLogger` instead.

## Only if you manage sessions or proxies yourself

Applies when you construct `SessionPool` or `Session` instances directly, implement your own pool, or configure proxies beyond a static URL list.

### Custom `SessionPool` implementations via the `ISessionPool` interface

Crawlers now accept any object implementing the new `ISessionPool` interface as their `sessionPool` option, not just instances of the built-in `SessionPool`. The contract is intentionally tiny — a single method, `getSession(sessionId?)`, that hands out a session for a request. Lifecycle (reset, teardown) is the responsibility of whoever owns the pool: a custom pool you construct yourself is never owned by the crawler, so the crawler never tears it down. This makes it straightforward to plug in a remote, shared, or otherwise customized session-management strategy without subclassing `SessionPool` or copying its internals.

`ISessionPool` and `ISession` live in `@crawlee/types`; they are not re-exported from `@crawlee/core` (see [`@crawlee/types` symbols are no longer re-exported](#crawleetypes-symbols-are-no-longer-re-exported)).

```typescript
import { BasicCrawler, Session } from '@crawlee/core';
import type { ISession, ISessionPool } from '@crawlee/types';

class MySessionPool implements ISessionPool {
    private readonly sessions = new Map<string, ISession>();

    async getSession(sessionId?: string): Promise<ISession | undefined> {
        if (sessionId) {
            const existing = this.sessions.get(sessionId);
            return existing?.isUsable() ? existing : undefined;
        }

        const usable = [...this.sessions.values()].find((session) => session.isUsable());
        if (usable) return usable;

        const fresh = new Session();
        this.sessions.set(fresh.id, fresh);
        return fresh;
    }
}

const crawler = new BasicCrawler({
    sessionPool: new MySessionPool(),
    requestHandler: async ({ session }) => {
        // `session` is whatever your pool returned, typed as ISession
    },
});
```

The crawler depends only on the `ISession` interface — `id`, `cookieJar`, `proxyInfo`, `fingerprint`, and the `isUsable()` / `markGood()` / `markBad()` / `retire()` methods — so a custom pool may hand out its own session implementation instead of instances of the built-in `Session` class. `Session` implements `ISession`, so returning `Session` instances (as above) is the shortest path; `crawlingContext.session` is typed as `ISession` either way.

Returning `undefined` means the pool has no usable session for the request. The crawler turns that into a `MissingSessionError` and retries the request like any other failure.

The `crawler.sessionPool` property is now **read-only** (a getter). It was previously a writable field, so any code that reassigned it after construction (`crawler.sessionPool = myPool`) no longer works — pass your pool via the `sessionPool` constructor option instead.

### `createSessionFunction` signature has changed

The pool-wide `sessionOptions` are now merged with per-call overrides before `createSessionFunction` is invoked, and the leading `sessionPool` argument is gone — it was only useful to pass to `new Session({ sessionPool })`, and `Session` no longer keeps a back-reference to the pool. The new signature is `(options?: { sessionOptions?: SessionOptions }) => Session | Promise<Session>`.

**Before:**
```typescript
new SessionPool({
    sessionOptions: { maxUsageCount: 5 },
    createSessionFunction: async (pool, opts) =>
        new Session({
            ...pool.sessionOptions, // had to be spread manually for pool defaults to apply
            ...opts?.sessionOptions,
            sessionPool: pool,
        }),
});
```

**After:**
```typescript
new SessionPool({
    sessionOptions: { maxUsageCount: 5 },
    createSessionFunction: async (opts) =>
        new Session({
            ...opts?.sessionOptions, // already merged with pool-wide defaults
        }),
});
```

### `Session` no longer requires a `sessionPool` reference

`Session` no longer holds a back-reference to its `SessionPool` and no longer emits a `sessionRetired` event when retired. The `sessionPool` constructor option is gone, `SessionPool` is no longer an `EventEmitter`, and the `EVENT_SESSION_RETIRED` constant is no longer exported. Custom `createSessionFunction` implementations that constructed `Session` instances manually should drop the `sessionPool` argument.

**Before:**
```typescript
new SessionPool({
    createSessionFunction: async (pool, opts) =>
        new Session({ ...opts?.sessionOptions, sessionPool: pool }),
});
```

**After:**
```typescript
new SessionPool({
    createSessionFunction: async (opts) =>
        new Session({ ...opts?.sessionOptions }),
});
```

If you previously subscribed to `sessionRetired` on the pool to clean up resources tied to a session, perform the cleanup at the end of your request handler (or via a context-pipeline cleanup hook) by checking `session.isUsable()` instead. `Session.retire()` is now a terminal state — once retired, `isUsable()` returns `false` permanently and cannot be undone by a subsequent `markGood()`.

### `tieredProxyUrls` is removed from `ProxyConfiguration`

The `tieredProxyUrls` option has been removed, together with the `proxyTier` field on `ProxyInfo` and the `proxyTier` plumbing in `BrowserPool`. In v4 the `Session` is the main rotation unit — a session already carries its own proxy, cookies and error score, so the pool rotates the whole fingerprint when a session gets retired on a block.

If you used tiers to escalate from a cheap proxy pool to a pricier one on blocks, you can achieve the same behavior by pre-populating a `SessionPool` with named sessions — one per proxy tier — and flipping `request.sessionId` in an `errorHandler` to reassign the retry to the next tier. Skip the `proxyConfiguration` option on the crawler — the session already carries its own proxy.

```typescript
import { BasicCrawler, SessionPool } from '@crawlee/core';

const proxyInfoFromUrl = (proxyUrl: string) => {
    const { username, password, hostname, port } = new URL(proxyUrl);
    return {
        url: proxyUrl,
        username: decodeURIComponent(username),
        password: decodeURIComponent(password),
        hostname,
        port,
    };
};

const sessionPool = new SessionPool();
await sessionPool.addSession({ id: 'basic', proxyInfo: proxyInfoFromUrl('http://cheap-proxy.com') });
await sessionPool.addSession({ id: 'premium', proxyInfo: proxyInfoFromUrl('http://expensive-proxy.com') });

const crawler = new BasicCrawler({
    sessionPool,
    retryOnBlocked: true,
    requestHandler: async ({ request, sendRequest }) => {
        await sendRequest({ url: request.url });
    },
    errorHandler: async ({ request }) => {
        request.sessionId = 'premium';
    },
});

await crawler.run([{ url: 'https://example.com', sessionId: 'basic' }]);
```

More complex routing (more tiers, weighted draws, sticky assignment, cooldowns) can be expressed with additional named sessions and custom `errorHandler` logic.

#### `ProxyConfiguration.newUrl` / `newProxyInfo` signatures changed

Because proxy tiers are gone, the leading `sessionId` positional argument was dropped from `ProxyConfiguration.newUrl()` and `ProxyConfiguration.newProxyInfo()`. Both now take a single optional options object instead of `(sessionId?, options?)`. The `ProxyConfigurationFunction` callback (the `newUrlFunction` option) was likewise simplified — it no longer receives a `sessionId` as its first argument; it now receives an optional `{ request }` object. The `TieredProxy` interface and the `TieredProxyOptions` type have been removed.

**Before:**
```typescript
const proxyConfiguration = new ProxyConfiguration({
    newUrlFunction: (sessionId, options) => pickProxyFor(sessionId),
});
const url = await proxyConfiguration.newUrl(sessionId);
```

**After:**
```typescript
const proxyConfiguration = new ProxyConfiguration({
    newUrlFunction: ({ request } = {}) => pickProxyFor(request),
});
const url = await proxyConfiguration.newUrl();
```

## Only if you customize browser management

Applies when you construct a `BrowserPool` yourself, reach for `browserController`, or tune `AdaptivePlaywrightCrawler` internals.

### Custom `BrowserPool` implementations via the `IBrowserPool` interface

Browser crawlers now accept any object implementing the new `IBrowserPool` interface as their `browserPool` option, not just instances of the built-in `BrowserPool`. The interface follows the classic acquire/release pattern, plus a pair of helpers for moving state between the crawling session and the page:

- **`newPage(options?)`** — opens a new page. An optional `session` can be passed as a best-effort hint — the pool may use it for proxy configuration, fingerprinting, etc., but nothing is guaranteed.
- **`closePage(page, options?)`** — signals the pool that the caller is done with the page. If the optional `error` is a `SessionError`, the pool should purge all state associated with the session (e.g. retire the underlying browser).
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

### `BrowserCrawlingContext.browserController` has been removed

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

### Puppeteer cookies are now read and written at the browser-context level

The `PuppeteerController._getCookies` / `_setCookies` methods (used internally by the session pool to sync cookies between a `Session` and a Puppeteer page) now call `page.browserContext().cookies()` / `setCookie()` instead of the deprecated `page.cookies()` / `page.setCookie()`. The page-level API was removed in newer Puppeteer releases.

This aligns the Puppeteer controller with the Playwright controller, which has always worked at the context level.

**What changes in practice**
- Cookie reads return every cookie stored in the page's browser context, not just cookies matching the page's current URL. If your `Session` relied on the URL-scoped filtering (for example, to avoid pulling cookies that belong to other tabs in the same context), you'll now see the full set.
- Cookie writes are applied to the whole browser context. When you launch pages with shared contexts, cookies written via `Session.setCookiesFromResponse` or similar will be visible to every other page in that context.

If you rely on Crawlee's default configuration (one browser context per session, which is the `useIncognitoPages` / `newContextPerSession` behavior used by `PuppeteerCrawler`), you should not notice any difference — each session already owns its own context.

**Cookie `url` field** — the old `page.setCookie()` auto-filled a missing `url` on each cookie with the page's current URL. The new `browserContext().setCookie()` does not; Chromium rejects cookies that carry neither `url` nor `domain`. Crawlee's internal `_setCookies` keeps the old behavior by back-filling `page.url()` for any cookie that has neither field set, but if you call `browserContext().setCookie()` directly (outside of Crawlee) you need to provide one of them yourself.

### Custom rendering type predictors via the `IRenderingTypePredictor` interface

The `renderingTypePredictor` option of `AdaptivePlaywrightCrawler` is now typed as the new `IRenderingTypePredictor` interface — `predict(request)` and `storeResult(requests, renderingType)`, nothing else. The built-in `RenderingTypePredictor` implements it, so passing one still works.

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

### Remove `experimentalContainers` option

This experimental option relied on an outdated manifest version for browser extensions, it is not possible to achieve this with the currently supported versions.

### `handleCloudflareChallenge` hooks must return the response

In v3, calling `handleCloudflareChallenge()` in a `postNavigationHooks` entry was enough on its own - the helper received the session and removed `403` from the session pool's blocked status codes, so the challenge page (which is served with a 403 status) did not trip the blocked-request detection.

In v4, blocked status code handling is internal to the crawler and runs *after* the post-navigation hooks, and the helper no longer touches it. Instead, `handleCloudflareChallenge()` returns the reloaded `Response` after solving the challenge, and the hook must return it as the new context response - otherwise the crawler still sees the original 403 challenge response and throws a `SessionError` before your `requestHandler` runs, even when the challenge was solved successfully.

Use the pre-wrapped `handleCloudflareChallengeHook()` (it also handles the no-challenge case), or return the response yourself:

```ts
// v3
postNavigationHooks: [
    async ({ handleCloudflareChallenge }) => {
        await handleCloudflareChallenge();
    },
],

// v4
import { handleCloudflareChallengeHook } from 'crawlee';

postNavigationHooks: [handleCloudflareChallengeHook()],

// v4 (manual equivalent)
postNavigationHooks: [
    async ({ handleCloudflareChallenge }) => {
        // Returning `{ response: undefined }` would clobber the navigation response
        // when there was no challenge, so only return it when one was solved.
        const response = await handleCloudflareChallenge();
        return response && { response };
    },
],
```

If you called the standalone `playwrightUtils.handleCloudflareChallenge(page, url, session, options)` directly, note that the `session` parameter is gone - the v4 signature is `handleCloudflareChallenge(page, url, options)`, so an options object passed in the old fourth position would be silently ignored.

## Only if you customize crawler statistics

Applies when you passed `statisticsOptions` to a crawler, subclassed `Statistics`, or passed type arguments to `BrowserCrawler`/`BrowserCrawlerOptions`.

### `statisticsOptions` is replaced by a `statistics` instance

The `statisticsOptions` option has been removed from the crawler constructor. Instead of passing options for the crawler to build its `Statistics` from, construct a `Statistics` instance yourself and pass it via the new `statistics` option — the same inject-or-default idiom as `sessionPool` and `browserPool`.

```typescript
import { Statistics } from '@crawlee/core';

const crawler = new BasicCrawler({
    // The old parameter won't work anymore
    // statisticsOptions: { saveErrorSnapshots: true },
    statistics: new Statistics({ saveErrorSnapshots: true }),
});
```

Omit the option and the crawler builds its own default, exactly as before. A supplied instance is treated as borrowed: the crawler records into it and drives its capture lifecycle for the run, but never `reset()`s it between `run()` calls — so a preconfigured instance keeps whatever state it was handed.

The option accepts the built-in `Statistics` or any object implementing the new `IStatistics` interface, so a fully custom statistics backend can be plugged in without subclassing. The crawler exposes it as `crawler.statistics` (renamed from `crawler.stats`) typed as `IStatistics`.

### The `Statistics` persistence lifecycle is stricter

`persistState()` and `resetStore()` no longer take `PersistenceOptions` — persistence is enabled or disabled once, in the constructor. `resetStore()` throws while the instance is capturing, where the next `PERSIST_STATE` event would write the record straight back; call it before `startCapturing()` or after `stopCapturing()`. And `reset()` only resets the counters — it no longer stops an ongoing capture, which `stopCapturing()` does.

A persisted record is also validated on load now. One that does not match the expected shape is discarded whole, with a warning, and the statistics start from scratch — where v3 would copy the malformed values into the live state and let them corrupt every later increment.

### Subclassing `Statistics` to track extra fields is replaced by the `stateExtension` option

`defaultState()`, `serializeState()`, `deserializeState()` and `persistStateKey` were `protected` and are now private, so a subclass can no longer override them. Declare the extra fields via the new `stateExtension` option instead — `{ defaultState, deserialize, serialize }`, the same trio `RecoverableState` takes, scoped to the custom fields. See the [Custom statistics fields](../guides/custom-statistics) guide.

A consequence of the hooks going away: the persisted record is now validated strictly, and keys that are neither built-in nor declared in `stateExtension` are dropped rather than written back. `calculate()` is still public and still an override point.

The custom field types reach `crawler.statistics.state` through a new trailing `StatisticStateExtension` type parameter on the crawler classes and their options. It defaults to `{}`, so existing type arguments keep working — except on `BrowserCrawler` and `BrowserCrawlerOptions`, where it was inserted after `Routes` and shifts the trailing internal parameters (`GoToOptions`, `__BrowserPlugins`, …). Adjust any explicit type arguments you passed to those two.

`AdaptivePlaywrightCrawler` now uses this mechanism for its own extra fields, with two consequences:

- `httpOnlyRequestHandlerRuns`, `browserRequestHandlerRuns` and `renderingTypeMispredictions` were typed as optional and are now always present. Reading them no longer needs a `?? 0`.
- The `statistics` option used to throw for this crawler; it now accepts any `IStatistics<AdaptivePlaywrightCrawlerStatisticState>`. Build one by extending the exported `adaptivePlaywrightCrawlerStatisticState`.

## Only if you wrote a custom HTTP client or used `got-scraping` directly

Applies when you implemented `BaseHttpClient` yourself, or imported `gotScraping` from `@crawlee/utils`.

### HTTP client packages and `BaseHttpClient` reshaped

The HTTP client abstraction moved out of `@crawlee/core` into two new packages, and its shape changed to match the native `fetch` model.

- **`@crawlee/http-client`** (new) now owns the `BaseHttpClient` abstract base class, along with `FetchHttpClient`, `ResponseWithUrl` / `IResponseWithUrl`, and `CustomFetchOptions`.
- **`@crawlee/got-scraping-client`** (new) provides `GotScrapingHttpClient` — the `got-scraping`-backed client — as an opt-in dependency, so `got-scraping` is no longer pulled into every install.

`BaseHttpClient` was redesigned around `fetch`. In v3 it declared `sendRequest<TResponseType>(request): Promise<HttpResponse>` and `stream(request): Promise<StreamingHttpResponse>`; in v4 subclasses implement a single `protected abstract fetch(input: Request, init?): Promise<Response>` and the base class provides `sendRequest(request, options?): Promise<Response>`. There is no `stream()` method anymore — a `Response` already exposes `body` as a stream. The following symbols that were part of the old `@crawlee/core` HTTP surface are **removed**: `HttpResponse`, `HttpResponseWithoutBody`, `StreamingHttpResponse`, `ResponseTypes`, `BaseHttpResponseData`, `SimpleHeaders`, and `processHttpRequestOptions`.

If you implemented a custom HTTP client:

**Before:**
```typescript
import { BaseHttpClient, HttpRequest, HttpResponse } from '@crawlee/core';

class MyClient implements BaseHttpClient {
    async sendRequest<T>(request: HttpRequest<T>): Promise<HttpResponse<T>> { /* ... */ }
    async stream(request: HttpRequest) { /* ... */ }
}
```

**After:**
```typescript
import { BaseHttpClient, type CustomFetchOptions } from '@crawlee/http-client';

class MyClient extends BaseHttpClient {
    protected async fetch(input: Request, init?: RequestInit & CustomFetchOptions): Promise<Response> {
        // return a native Response; sendRequest() is inherited from BaseHttpClient
    }
}
```

#### `gotScraping` is no longer exported from `@crawlee/utils`

The `gotScraping` singleton previously exported from `@crawlee/utils` has been removed. If you used it as the crawler's HTTP client, use the new `GotScrapingHttpClient` instead:

```typescript
import { CheerioCrawler } from 'crawlee';
import { GotScrapingHttpClient } from '@crawlee/got-scraping-client';

const crawler = new CheerioCrawler({
    httpClient: new GotScrapingHttpClient(),
    requestHandler: async ({ $ }) => { /* ... */ },
});
```

If you called `gotScraping(...)` directly for one-off requests unrelated to Crawlee, depend on the [`got-scraping`](https://www.npmjs.com/package/got-scraping) package directly instead.

## Only if you use `FileDownload`

Applies when you use the `FileDownload` crawler from `@crawlee/http`.

### `FileDownload` now extends `BasicCrawler` and no longer takes `FileDownloadOptions`

`FileDownload` was re-based from `HttpCrawler` onto `BasicCrawler`. Its constructor now accepts `BasicCrawlerOptions<FileDownloadCrawlingContext>` instead of the dedicated `FileDownloadOptions` type, which — together with `StreamHandlerContext` — has been **removed** from `@crawlee/http`. In practice this means the HTTP-crawler-specific options (`navigationTimeoutSecs`, `additionalMimeTypes`, `suggestResponseEncoding`, `forceResponseEncoding`, the `gotOptions`-style `preNavigationHooks`, etc.) are no longer accepted by `FileDownload`; downloading is a thin layer over `BasicCrawler` and the request is performed via `sendRequest` / the configured `httpClient`. If you passed any of those HTTP-only options to `FileDownload`, drop them and configure the `httpClient` (or the request itself) directly. The `FileDownloadCrawlingContext` type also lost its extra type parameter and no longer extends the internal HTTP crawling context — it now extends the common `CrawlingContext` with `contentType`, `request`, and `response`.

### Crawling context in the `FileDownload` crawler no longer includes `body` and `stream` properties

The crawling context in the `FileDownload` crawler no longer includes the `body` and `stream` properties. These can be accessed directly via the `response` property instead, e.g. `context.response.bytes()` or `context.response.body`.

## Only if you use request lists and loaders

### Request loaders and managers

The request loader/manager interfaces have been reworked. See the new [Request loaders](../guides/request-loaders) guide for the full picture.

#### `RequestQueue.addRequestsBatched` no longer retries rejected requests

Requests that the storage backend reports as unprocessed are now warned about and skipped after the first attempt, instead of being retried a bounded number of times. What a backend reports as unprocessed is a semantic rejection (typically malformed request data) that re-sending cannot fix — retrying transient failures is the storage backend's own responsibility.

#### `IRequestList` renamed to `IRequestLoader`

The `IRequestList` interface has been renamed to `IRequestLoader` and is now the read-only base interface implemented by `RequestList` and `SitemapRequestLoader`. The writable `IRequestManager` interface now **extends** `IRequestLoader` with the request-adding and reclaiming surface (`addRequest`, `addRequestsBatched`, `reclaimRequest`, optional `purge`). There is no `IRequestList` alias — update your imports and type references to `IRequestLoader` (or `IRequestManager` if you need the write surface).

#### Loader interface surface changes

The harmonized loader interface differs from the old `IRequestList` in a few ways:

| Before (v3) | After (v4) |
|---|---|
| `length(): number` | `getTotalCount(): Promise<number>` (renamed and now async) |
| _(n/a)_ | `getPendingCount(): Promise<number>` (new) |
| `handledCount(): number` | `getHandledCount(): Promise<number>` (renamed and now async) |
| `markRequestHandled(request)` | `markRequestAsHandled(request)` (renamed) |
| `isEmpty(): Promise<boolean>` and `isFinished(): Promise<boolean>` | `checkReadiness(): Promise<RequestSourceStatus>` ([details](#isempty--isfinished-replaced-by-checkreadiness)) |
| `reclaimRequest()` on the interface | Removed from the read-only loaders entirely; reclaiming is a write operation that lives only on `IRequestManager` (e.g. `RequestQueue`, `RequestManagerTandem`) |
| `inProgress: Set<string>` on the interface | Removed from the interface |
| `persistState(): Promise<void>` (required) | `persistState?(): Promise<void>` (optional) |
| _(n/a)_ | `toTandem?(requestManager?)` (new) |

`RequestList.length()` and `RequestList.handledCount()` (and their `SitemapRequestLoader` counterparts) were renamed to `getTotalCount()` and `getHandledCount()` and are now `async` — `await` them.

`markRequestHandled()` was renamed to `markRequestAsHandled()` across the loader and manager interfaces (`RequestList`, `SitemapRequestLoader`, `RequestQueue`, `RequestManagerTandem`) to match the storage backend method of the same name. Rename any calls accordingly.

**Before:**
```typescript
const total = requestList.length();
const handled = requestList.handledCount();
```

**After:**
```typescript
const total = await requestList.getTotalCount();
const handled = await requestList.getHandledCount();
```

#### `IRequestManager` gained `recordPacingSignal()`

v3 could not tell a request source that a domain wants to be left alone: a 429 only retired the session, and a robots.txt `Crawl-delay` was not enforced at all. One member now carries all of it:

```typescript
recordPacingSignal(signal: PacingSignal): boolean;

type PacingSignal =
    // the source turned a request away because we were going too fast
    | { reason: 'rateLimited'; url: string; waitMs?: number; scope?: PacingScope }
    // it declared a standing floor on how often it may be requested
    | { reason: 'minInterval'; url: string; intervalMs: number; scope: PacingScope }
    // the operator asked for a floor under every domain, `sameDomainDelaySecs` being one
    | { reason: 'minIntervalEverywhere'; intervalMs: number; scope: PacingScope };

// suggests the two Crawlee itself uses, accepts any string
type PacingScope = LiteralUnion<'hostname' | 'registrableDomain', string>;
```

The crawler reports a 429 (with `Retry-After` if the response carried one), a robots.txt `Crawl-delay`, and its own `sameDomainDelaySecs`. Nothing in the payload names the mechanism, so a manager never learns where a signal came from, and `true` means it took responsibility — which is how the crawler knows to treat a rate limit as a paced retry rather than a blocked response. Delays are in milliseconds.

If you implement the interface:

- Return `false` when you do not pace, and forward the value when you wrap a manager that might. The method is required so that reporting is never a question of support, and a pacer nested in a composition still has to hear about it.
- Apply a signal at a **wider** `scope` than you were given if you must — a per-host floor still holds when the whole site is paced by it — never a narrower one, and throw on a scope you cannot honour instead of under-applying it. `ThrottlingRequestManager` groups by `throttleBy`, so it widens `'hostname'` signals and throws on anything wider or on a vocabulary it does not speak.
- `minIntervalEverywhere` covers every domain you dispatch to, which is why it is the variant with no `url`. Take it only if you pace all of them; throw if you pace some.

#### `isEmpty()` / `isFinished()` replaced by `checkReadiness()`

The two predicates v3 put on `IRequestList` and `IRequestManager` (and on `RequestList`, `RequestQueue` and `RequestProvider`) are replaced by a single `checkReadiness()` call, on `IRequestLoader`, `IRequestManager` and every implementation:

```typescript
type RequestSourceStatus =
    | { status: 'ready' } // a fetch is expected to hand something over  (v3: `!isEmpty()`)
    | { status: 'waiting'; readyAt?: number } // nothing now, not done   (v3: `isEmpty() && !isFinished()`)
    | { status: 'stalled'; reason: string } // holding requests it cannot make progress on
    | { status: 'finished' }; // nothing left at all                     (v3: `isFinished()`)
```

```diff
-if (!(await manager.isEmpty())) { /* fetch */ }
+if ((await manager.checkReadiness()).status === 'ready') { /* fetch */ }

-if (await manager.isFinished()) { /* stop */ }
+if ((await manager.checkReadiness()).status === 'finished') { /* stop */ }
```

One probe instead of two, which a task loop runs several times a second, plus two answers the booleans could not express: `waiting` can name when it expects work again (`readyAt`) instead of leaving the caller to poll, and `stalled` reports requests a source cannot make progress on, which the crawler turns into a `PersistentRateLimitError`.

If you implemented either interface, return `ready` without evaluating anything further — it is the most common answer and the only one a caller can act on immediately. Reading from two sources, the precedence is `ready` > `stalled` > `waiting` > `finished`, and a combined `waiting` carries the earlier `readyAt`.

**Storage backends keep the two booleans** — see [`StorageBackend` interface simplified](#storagebackend-interface-simplified).

#### Combining a list and a queue: `toTandem()`

`RequestList` and `SitemapRequestLoader` now expose a `toTandem()` helper that pairs the read-only loader with a writable request manager (the default `RequestQueue` if none is passed), producing a `RequestManagerTandem` you can hand to a crawler via the new `requestManager` option:

```typescript
import { CheerioCrawler, RequestList } from 'crawlee';

const requestList = await RequestList.open('my-list', ['https://example.com']);

const crawler = new CheerioCrawler({
    requestManager: await requestList.toTandem(),
    requestHandler: async ({ enqueueLinks }) => {
        await enqueueLinks();
    },
});
```

#### `SitemapRequestList` renamed to `SitemapRequestLoader`

The `SitemapRequestList` class (and its `SitemapRequestListOptions` type) have been renamed to `SitemapRequestLoader` and `SitemapRequestLoaderOptions` to match the loader terminology. Update your imports and type references accordingly:

```typescript
// Before
import { SitemapRequestList } from 'crawlee';
const loader = await SitemapRequestList.open({ sitemapUrls: ['https://example.com/sitemap.xml'] });

// After
import { SitemapRequestLoader } from 'crawlee';
const loader = await SitemapRequestLoader.open({ sitemapUrls: ['https://example.com/sitemap.xml'] });
```

The default `KeyValueStore` key used to persist the loader's state was also renamed from `SITEMAP_REQUEST_LIST_STATE` to `SITEMAP_REQUEST_LOADER_STATE`. State persisted under the old key by a v3 run will **not** be picked up after upgrading, so any in-flight sitemap crawl that migrates across the upgrade will restart from the beginning. If you need to preserve state, either finish the crawl before upgrading or pass an explicit `persistStateKey`.

#### Crawler `requestList` / `requestQueue` options deprecated in favor of `requestManager`

The crawler now reads its requests from a single `requestManager` (any `IRequestManager`, including a `RequestQueue`). The `requestList` and `requestQueue` constructor options are **deprecated** but still accepted as sugar:

- `requestQueue` alone → used directly as the manager.
- `requestList` + `requestQueue` → combined into a `RequestManagerTandem` automatically.
- `requestList` alone → combined with a lazily-opened default queue into a tandem.

```typescript
// Before
const crawler = new CheerioCrawler({ requestList, requestQueue });

// After
const crawler = new CheerioCrawler({ requestManager: new RequestManagerTandem(requestList, requestQueue) });
// or, equivalently
const crawler = new CheerioCrawler({ requestManager: await requestList.toTandem(requestQueue) });
```

A lone `requestList` now runs through a tandem over an auto-opened queue (rather than a read-only adapter). This means retries and `maxRequestsPerCrawl` accounting for that path now follow queue semantics.

#### HTTP 429 can now back off per domain instead of retiring the session

`blockedStatusCodes` still defaults to `[401, 403, 429]`, so out of the box a 429 retires the session and retries immediately, as in v3. New in v4 is the opt-in `ThrottlingRequestManager`, which handles rate limits at the scheduling layer instead:

```typescript
const crawler = new CheerioCrawler({
    requestManager: new ThrottlingRequestManager({
        domains: ['api.example.com'],
    }),
    requestHandler,
});
```

For the domains you list, a 429 is treated as a rate limit before `blockedStatusCodes` is consulted at all — it honours `Retry-After` (or backs off exponentially), holds only that domain's requests back, and leaves both the session and the request's retry budget untouched. Removing 429 from `blockedStatusCodes` therefore only affects domains the manager does not cover; you do not need to touch it to adopt throttling. Because those retries are free, a domain that never stops rate-limiting would keep the crawl alive indefinitely — so one that goes `maxDomainStallSecs` (15 minutes by default) without letting a single request through shuts the crawl down with a `PersistentRateLimitError`, leaving its requests queued for a later run — unless `keepAlive` is set, where outliving such a domain is the point.

It is also what enforces robots.txt `Crawl-delay` directives — with `respectRobotsTxtFile` enabled and no throttling manager covering the domain, the directive is ignored and the crawler warns about it. See the [request loaders guide](../guides/request-loaders#per-domain-throttling).

#### `sameDomainDelaySecs` is now backed by `ThrottlingRequestManager`

`sameDomainDelaySecs` still works and still means what it did in v3 — subdomains included, it paces a whole registrable domain rather than a single host. Underneath, it is now a floor reported to the crawler's request manager as a [pacing signal](#irequestmanager-gained-recordpacingsignal); only when nothing there paces does the crawler wrap its manager in a `ThrottlingRequestManager`, which gives each domain a queue of its own so a delayed request waits in storage rather than in an in-memory map. Consequences worth knowing about:

- A crawl that discovers more than `maxThrottledDomains` domains (100 by default) throws instead of quietly running out of steam. Pass your own `ThrottlingRequestManager` as `requestManager` to raise the ceiling — or crawl fewer sites.
- Combining it with a manager that paces on its own no longer throws, and no longer gives one domain two clocks: a `ThrottlingRequestManager` with `domains: 'all'` and `throttleBy: 'registrableDomain'` takes the delay as its `minCrawlDelaySecs` floor, wherever it sits in a composition. One that paces only *some* domains throws instead — set `domains: 'all'`, or configure the delay there yourself and drop the option.
- Requests that never pass through the request manager — those from a `requestsFromUrl` list — are not paced, and the crawler warns when it hands one out.

#### `BasicCrawler.requestList` and `BasicCrawler.requestQueue` fields removed

The public `requestList` and `requestQueue` instance fields are gone. The crawler exposes a single `protected requestManager?: IRequestManager` instead. Access the active manager via the new async `getRequestManager()` method.

#### `getRequestQueue()` deprecated in favor of `getRequestManager()`

`BasicCrawler.getRequestQueue()` is deprecated. It still works as an alias, but now returns an `IRequestManager` that is no longer guaranteed to be a `RequestQueue` (it may be a `RequestManagerTandem`). Use `getRequestManager()` instead.

**Before:**
```typescript
const queue = await crawler.getRequestQueue();
```

**After:**
```typescript
const manager = await crawler.getRequestManager();
```

#### `enqueueLinks` `requestQueue` option renamed to `requestManager`

The standalone `enqueueLinks()` function and the click-elements enqueue helpers (`enqueueLinksByClickingElements` in `@crawlee/puppeteer` and `@crawlee/playwright`) now take a `requestManager` option instead of `requestQueue`:

**Before:**
```typescript
await enqueueLinks({ urls, requestQueue });
```

**After:**
```typescript
await enqueueLinks({ urls, requestManager });
```

## Only if you configure or implement storage backends

The implicit default (file-system storage under `./storage`) behaves as before — this section matters when you construct a storage backend explicitly or implement your own.

### `StorageBackend` interface simplified

The `StorageBackend` interface (from `@crawlee/types`, formerly named `StorageClient`) has been redesigned and simplified. A new storage backend now needs **4 classes** instead of the previous 7.

#### What changed

The three **collection client** interfaces have been removed:

- `DatasetCollectionClient`
- `KeyValueStoreCollectionClient`
- `RequestQueueCollectionClient`

Along with their associated types (`DatasetCollectionData`, `DatasetCollectionClientOptions`, and the `Dataset` interface from `@crawlee/types`).

The `StorageBackend` interface changed from synchronous sub-client getters to **async factory methods**:

| Before (v3) | After (v4) |
|---|---|
| `client.dataset(id)` | `backend.createDatasetBackend({ id?, name? })` |
| `client.datasets().getOrCreate(name)` | _(absorbed into `createDatasetBackend`)_ |
| `client.keyValueStore(id)` | `backend.createKeyValueStoreBackend({ id?, name? })` |
| `client.keyValueStores().getOrCreate(name)` | _(absorbed into `createKeyValueStoreBackend`)_ |
| `client.requestQueue(id, opts)` | `backend.createRequestQueueBackend({ id?, name? })` |
| `client.requestQueues().getOrCreate(name)` | _(absorbed into `createRequestQueueBackend`)_ |

The sub-backend interfaces (`DatasetBackend`, `KeyValueStoreBackend`, `RequestQueueBackend`, formerly `DatasetClient` / `KeyValueStoreClient` / `RequestQueueClient`) have been simplified:

| Before (v3) | After (v4) |
|---|---|
| `get()` | `getMetadata()` |
| `update()` | Removed |
| `delete()` | `drop()` |
| _(n/a)_ | `purge()` (new — clears data, keeps storage) |

**`DatasetBackend`:**

| Before (v3) | After (v4) |
|---|---|
| `pushItems(items: Data \| Data[] \| string \| string[])` | `pushData(items: Data[])` |
| `listItems(options?)` (dual iterable) | `getData(options?)` (returns a single `PaginatedList` page) |
| `listEntries(options?)` | Removed (handled by `Dataset` frontend) |
| `downloadItems()` | Removed |

**`KeyValueStoreBackend`:**

| Before (v3) | After (v4) |
|---|---|
| `getRecord(key, options?)` | `getValue(key)` |
| `setRecord(record, options?)` | `setValue(record)` |
| `deleteRecord(key)` | `deleteValue(key)` |
| `getRecordPublicUrl(key)` | `getPublicUrl(key)` |
| `listKeys(options?)` → `KeyValueStoreClientListData` | `listKeys(options?)` → `KeyValueStoreListKeysResult` (a single self-describing page) |
| `keys()`, `values()`, `entries()` | Removed (handled by `KeyValueStore` frontend) |

**`RequestQueueBackend`:**

The request queue backend was reduced from 12 methods to 10. The distributed-locking protocol (`listAndLockHead` → `prolongRequestLock` → `deleteRequestLock`) and the queue-head/consistency bookkeeping that used to live in the `RequestQueue` frontend have been removed from the interface; coordinating multiple clients accessing the same queue (e.g. request locking on the Apify platform) is now an internal concern of the backend implementation.

| Before (v3) | After (v4) |
|---|---|
| `addRequest(request, opts?)` | `addBatchOfRequests([request], opts?)` |
| `batchAddRequests(requests, opts?)` | `addBatchOfRequests(requests, opts?)` |
| `getRequest(id)` | `getRequest(uniqueKey)` |
| `updateRequest(request, opts?)` | `markRequestAsHandled(request)` / `reclaimRequest(request, opts?)` |
| `listHead(opts?)` | `fetchNextRequest()` (returns a single request, marks it in progress) |
| `listAndLockHead(opts)` | Removed (locking is internal to the client) |
| `prolongRequestLock(id, opts)` | Removed |
| `deleteRequestLock(id, opts?)` | Removed |
| `deleteRequest(id)` | Removed |
| _(n/a)_ | `isEmpty()` (new — `true` when no pending requests are left to fetch) |
| _(n/a)_ | `isFinished()` (new — `true` when no pending **and** no in-progress requests remain) |

The lifecycle is now: `fetchNextRequest()` hands out a pending request and marks it in progress; once processed, call `markRequestAsHandled(request)`; on failure call `reclaimRequest(request, { forefront? })` to return it to the queue.

Methods that may have "nothing" to return now consistently resolve to `undefined` rather than `null`. `fetchNextRequest()` resolves to `undefined` when there is nothing to fetch, and `markRequestAsHandled()` / `reclaimRequest()` resolve to `undefined` when the request is not something the backend is currently processing (a no-op, not an error). This matches the `undefined` already returned by `getRequest()`, `KeyValueStoreBackend.getValue()`, and `getPublicUrl()`, so the whole backend family uses a single "absent" sentinel. If you implemented a custom backend that returned `null` from these methods, return `undefined` instead.

`RequestQueueBackend.isEmpty()` and `RequestQueueBackend.isFinished()` answer two different questions:

- `isEmpty()` is the weak check — `true` when the next `fetchNextRequest()` would return `undefined`, i.e. there is nothing left to fetch right now. Requests that are currently in progress (fetched but not yet handled or reclaimed) are **not** counted, because they are not fetchable. This is what drives the crawler's task scheduling.
- `isFinished()` is the strong check — `true` only when there are no pending requests **and** no requests currently in progress (including those locked by other clients sharing the queue). This is what determines whether crawling is actually done. An in-progress request keeps the queue *empty but not finished*, which is what stops a crawler from shutting down while a request is still being processed.

The loader and manager frontends do **not** draw that distinction — `IRequestLoader` and `IRequestManager` answer both questions with one [`checkReadiness()`](#isempty--isfinished-replaced-by-checkreadiness) call. The split lives at the backend boundary because that is the layer where the two questions really are two separate storage lookups; a frontend that split them too would either probe twice per scheduling decision or lose the distinction, whereas a backend that answers one at a time costs its caller nothing.

The separate `RequestQueueV1`/`RequestQueueV2` classes (and the `RequestProvider` base class) have been removed. They no longer differ in behavior — request coordination is now internal to the storage backend — so they are merged into a single `RequestQueue` class. Replace any `RequestQueueV1`, `RequestQueueV2`, or `RequestProvider` imports with `RequestQueue`.

The `requestLocking` crawler experiment has been removed, along with the `experiments` crawler option and the `CrawlerExperiments` type that contained it. Request locking has been the default since v3.10 and there is no longer an alternative implementation to opt out to, so the flag did nothing. Delete any `experiments: { requestLocking: ... }` from your crawler options:

```diff
 const crawler = new CheerioCrawler({
     async requestHandler({ $, request }) {
         // ...
     },
-    experiments: {
-        requestLocking: true,
-    },
 });
```

The `RequestQueue.requestLockSecs` property has been removed. Because request locking is now internal to the storage backend, the lock duration is no longer configured on the queue. When you run a crawler, it automatically tells the queue how long it expects to hold a request (based on `requestHandlerTimeoutMillis`), so a long-running request handler will not have its request handed out a second time — you usually don't need to configure anything.

If you use a `RequestQueue` outside of a crawler and your processing may exceed the 3-minute default lock, call `setExpectedRequestProcessingTimeSecs(secs)` on the queue to raise it:

```typescript
import { RequestQueue } from 'crawlee';

const queue = await RequestQueue.open();
await queue.setExpectedRequestProcessingTimeSecs(600);
```

The `RequestQueue.internalTimeoutMillis` property and the associated "stuck queue" self-recovery have been removed. In v3 the `RequestQueue` frontend kept its own copy of the queue head and in-progress set, which could drift out of sync with the backing storage (an eventual-consistency hazard on the Apify platform); `isFinished()` watched for inactivity exceeding `internalTimeoutMillis` and reset that frontend state to recover. In v4 the frontend no longer holds any such bookkeeping — the storage backend is the single source of truth — so there is nothing for a reset to fix, and stuck request locks now self-heal on expiry. Any consistency-recovery logic that is genuinely specific to the Apify platform's distributed storage belongs in the Apify SDK's client implementation instead, and is tracked in [apify/crawlee#3328](https://github.com/apify/crawlee/issues/3328).

**Apify-specific fields removed from storage metadata.** The metadata returned by `getMetadata()` (`DatasetInfo`, `KeyValueStoreInfo`, `RequestQueueInfo`) has been trimmed to what is meaningful for any storage backend. The following platform-specific fields were dropped: `actId`, `actRunId`, `userId`, and — on `RequestQueueInfo` — `expireAt` and `hadMultipleClients`. The per-storage `stats` field (and its `DatasetStats` / `KeyValueStoreStats` / `RequestQueueStats` types) was removed as well. If you consumed any of these, read them from the Apify API client directly; a custom `StorageBackend` should simply stop returning them.

**Removed types** from `@crawlee/types`: `DatasetClientUpdateOptions`, `KeyValueStoreClientUpdateOptions`, `KeyValueStoreRecordOptions`, `KeyValueStoreClientListData`, `KeyValueStoreClientGetRecordOptions`, `QueueHead`, `RequestQueueHeadItem`, `ListOptions`, `ListAndLockOptions`, `ListAndLockHeadResult`, `ProlongRequestLockOptions`, `ProlongRequestLockResult`, `DeleteRequestLockOptions`, `DatasetStats`, `KeyValueStoreStats`, `RequestQueueStats`. `KeyValueStoreClientListOptions` was renamed to `KeyValueStoreListKeysOptions`. The `CreateDatasetBackendOptions`, `CreateKeyValueStoreBackendOptions`, and `CreateRequestQueueBackendOptions` aliases were removed — the `create*Backend` methods now take `StorageIdentifier` directly.

The high-level storage classes (`Dataset`, `KeyValueStore`, `RequestQueue`) are now thin wrappers over a single sub-backend, which they receive directly in the constructor options. The constructor takes `{ metadata, backend }`, where `backend` is the sub-backend and `metadata` is the resolved storage info (as returned by the backend's `getMetadata()`) that the storage derives its `id` and `name` from — instead of receiving separate `id` / `name` arguments (or a `StorageBackend` and calling its methods). In practice you never call these constructors yourself; use `Dataset.open()` / `KeyValueStore.open()` / `RequestQueue.open()`, which resolve the metadata and open the backend for you.

`RequestQueue` no longer accepts (or stores) `clientKey` / `timeoutSecs`. These are request-locking concerns that are now internal to the storage backend implementation (see [apify/crawlee#3328](https://github.com/apify/crawlee/issues/3328)); they are also no longer part of the `createRequestQueueBackend` options — all three `create*Backend` methods now take a plain `StorageIdentifier` (`{ id?, name?, alias? }`). The now-redundant `CreateDatasetBackendOptions`, `CreateKeyValueStoreBackendOptions`, and `CreateRequestQueueBackendOptions` type aliases have been removed from `@crawlee/types`; use `StorageIdentifier` instead.

#### `RecordOptions` simplified

`timeoutSecs` and `doNotRetryTimeouts` were removed from `RecordOptions` (used by `KeyValueStore.setValue`). Only `contentType` remains.

#### `maybeStringify` is removed

The `maybeStringify` helper exported from `@crawlee/core` has been removed. Value (de)serialization now lives entirely in the `KeyValueStore` frontend: writing serializes the value (and infers its content type), reading parses it back, and the storage backend is a plain byte transport. If you imported `maybeStringify` directly, use the `serializeValue` / `parseValue` functions exported from `@crawlee/core` instead.

#### `KeyValueStoreIteratorOptions` simplified

`exclusiveStartKey` and `collection` were removed. Only `prefix` remains.

#### `Dataset.listItems` replaced by `Dataset.getData` and `Dataset.values`

`Dataset.listItems()` is replaced by two methods:
- `Dataset.getData(options?)` — returns a single `PaginatedList<Data>` page.
- `Dataset.values(options?)` — dual iterable: `for await...of` iterates all items; `await` returns all items as `Data[]`.

`Dataset.entries()` works the same way as `values()` but yields `[index, Data]` tuples. `KeyValueStore.keys()`, `.values()`, `.entries()` follow the same dual-iterable pattern.

#### Removed `list()` method

The `list()` method on collection clients (e.g. `client.datasets().list()`) has no replacement. If you were using it to enumerate all storages, you will need to use the Apify API client directly.

#### Migration guide

If you implemented a custom `StorageBackend`, you need to:

1. Remove your `*CollectionClient` classes.
2. Replace the six getter methods (`dataset`, `datasets`, `keyValueStore`, `keyValueStores`, `requestQueue`, `requestQueues`) with three async factory methods (`createDatasetBackend`, `createKeyValueStoreBackend`, `createRequestQueueBackend`). Each factory should handle both opening an existing storage and creating a new one.
3. Apply the sub-backend renames listed above (`get` → `getMetadata`, `delete` → `drop`, etc.) and implement the new `purge()` method.

### `MemoryStorage` split into `FileSystemStorageBackend` and `MemoryStorageBackend`

In v3, the single `MemoryStorage` class from `@crawlee/memory-storage` did double duty: it kept everything in memory *and*, by default, mirrored it to disk (toggled via the `persistStorage` option / `CRAWLEE_PERSIST_STORAGE` environment variable). In v4 these two responsibilities are split into two independent classes, and the default storage backend now persists to disk.

- **`FileSystemStorageBackend`** (new, in the new `@crawlee/fs-storage` package) — always persists storage to the local directory (`CRAWLEE_STORAGE_DIR`, default `./storage`). This is what you get implicitly when you don't configure a storage backend, and it is the behavior the old `MemoryStorage` had with its default `persistStorage: true`.
- **`MemoryStorageBackend`** (the renamed `MemoryStorage`, now part of `@crawlee/core`) — keeps everything purely in memory and **never touches the disk**. This matches the old `MemoryStorage` with `persistStorage: false`. The standalone `@crawlee/memory-storage` package no longer exists; its code was merged into `@crawlee/core`.

Both classes are re-exported from the `crawlee` meta-package.

#### The default storage backend now persists to disk

Which client backs the implicit default is decided by `Configuration.persistStorage` (still controllable via the `CRAWLEE_PERSIST_STORAGE` environment variable): `true` (the default) selects `FileSystemStorageBackend`, `false` selects `MemoryStorageBackend`. If you relied on the default and never set `persistStorage`, your storage is persisted to disk exactly as before — no change.

#### `MemoryStorage` is renamed and is now memory-only

If you constructed the storage backend explicitly, two things changed:

1. **The class is renamed** `MemoryStorage` → `MemoryStorageBackend`.
2. **It no longer writes to disk.** A bare `new MemoryStorage()` in v3 persisted to disk by default; `new MemoryStorageBackend()` in v4 does not. If you want persistence, use `FileSystemStorageBackend` instead.

**Before:**
```typescript
import { MemoryStorage } from '@crawlee/memory-storage';

// Persisted to disk by default in v3.
const storageBackend = new MemoryStorage();
```

**After:**
```typescript
import { FileSystemStorageBackend } from '@crawlee/fs-storage';
import { MemoryStorageBackend } from '@crawlee/core';

// Persists to disk (the old default behavior):
const storageBackend = new FileSystemStorageBackend({ localDataDirectory: './storage' });

// Or keep everything in memory only (the old `persistStorage: false`):
const inMemory = new MemoryStorageBackend();
```

`MemoryStorageBackend` no longer takes the `localDataDirectory`, `persistStorage`, or `writeMetadata` options — in-memory storage has nowhere to write, so they had no meaning. `FileSystemStorageBackend` honors `localDataDirectory`; it always persists, so it has no `persistStorage` option, and the `writeMetadata` option has been removed there too (see [`writeMetadata` option removed](#writemetadata-option-removed)).

#### No request lock expiry in `MemoryStorageBackend`

Because the in-memory queue lives entirely within a single process and is never shared with another consumer, `MemoryStorageBackend`'s request queue no longer uses an expiring, cross-process lock. A fetched request simply stays *in progress* until it is handled or reclaimed; it never becomes fetchable again on its own after a timeout. `setExpectedRequestProcessingTimeSecs()` is therefore a no-op for in-memory storage. (Disk-backed `FileSystemStorageBackend` keeps the lock-with-expiry behavior.)

#### `writeMetadata` option removed

`FileSystemStorageBackend` no longer accepts the `writeMetadata` option. The underlying file-system storage now always writes metadata files (`__metadata__.json` for each storage and a `<key>.__metadata__.json` sidecar for each key-value record), so the toggle no longer had any effect. Remove it from your storage backend options:

```diff
 import { FileSystemStorageBackend } from '@crawlee/fs-storage';

 const storageBackend = new FileSystemStorageBackend({
     localDataDirectory: './storage',
-    writeMetadata: true,
 });
```

`MemoryStorageBackend` never accepted `writeMetadata` (it has no on-disk format to begin with), so there is nothing to change there.

#### Out-of-band key-value files (e.g. a hand-placed `INPUT.json`)

`FileSystemStorageBackend` only fully tracks records it wrote itself (those have a `<key>.__metadata__.json` sidecar). It still reads a value file placed in the store directory out-of-band — such as a hand-written or platform-provided `INPUT.json` — by probing the requested key plus the `.json` and `.txt` extensions. A few behaviors around these "bare" files changed in v4:

- **Extensionless bare files report `application/octet-stream`.** In v3 a bare value file with no extension was read as `text/plain`. In v4 the client is a plain byte transport and only infers a content type from a real extension, so an extensionless file now comes back as `application/octet-stream`. Give the file a `.json` or `.txt` extension if you need a more specific type.
- **Malformed bare files are no longer silently swallowed.** In v3 a bare `INPUT.json` containing invalid JSON was treated as a missing record (`getValue` returned `undefined`). In v4 the raw bytes are returned verbatim and parsing happens in the `KeyValueStore` frontend, so a malformed value now surfaces a parse error at read time instead of looking absent.
- **Bare files are enumerated by `listKeys` under their actual on-disk name.** A bare `INPUT.json` (or `.txt`/`.bin`) shows up in `listKeys` as `INPUT.json` and reads back cleanly under that key via `getValue` / `recordExists` / `getPublicUrl`; the logical `INPUT` lookup keeps resolving the same file as well. An extensionless bare file is listed as `INPUT`. If both a tracked `INPUT` record and a bare `INPUT.json` exist, the tracked record wins and the bare variant is not listed. Everything `listKeys` needs is read from the filesystem index, so this no longer triggers the per-read O(n) directory scans the v3 fallback performed.

## Only if you tuned autoscaling

The `minConcurrency` / `maxConcurrency` / `maxRequestsPerMinute` crawler options work as before. This section matters when you used `autoscaledPoolOptions`, drove an `AutoscaledPool` directly, or configured snapshotting and system status.

### Autoscaling moved to `ConcurrencySystem`

Everything that decides whether there is free compute for one more task — snapshotting, the system-status evaluation, the concurrency budget and the scaling logic — moved out of `AutoscaledPool` into a new `ConcurrencySystem`. What is left of the pool is a bare task loop, which is now **internal**: crawlers build and drive one for themselves, and `ConcurrencySystem` is the only part of this you configure.

The point is sharing: inject one instance into several crawlers to cap their **combined** concurrency against a single budget, instead of letting each scale independently and oversubscribe the host. The option is typed as `IConcurrencySystem`, a minimal read-only contract, so an alternative governor can be substituted; `ConcurrencySystem` is the canonical implementation and the one crawlers build by default.

:::info Who starts and stops it

Whoever *builds* a `ConcurrencySystem` owns its lifecycle. Crawlers do that for the default system they build per run. One **you** supply is yours to `start()` and `stop()`, because no crawler can know when the last borrower has finished. Forgetting to start it makes `run()` **throw**; stopping it while a crawler is still running only **warns**. Read `isRunning` to check whether a system handed to you was already started by its owner.

:::

Every migration below has the same shape — build, start, run, stop:

```typescript
import { CheerioCrawler, ConcurrencySystem } from 'crawlee';

const concurrencySystem = new ConcurrencySystem({ maxConcurrency: 20 });
await concurrencySystem.start();

// One crawler, or several: a shared instance caps their combined concurrency.
const a = new CheerioCrawler({ concurrencySystem, requestHandler });
const b = new CheerioCrawler({ concurrencySystem, requestHandler });

try {
    await Promise.all([a.run(), b.run()]);
} finally {
    await concurrencySystem.stop();
}
```

On Node.js 24, `await using` replaces the `try`/`finally` — see [collaborators you own are disposable](#collaborators-you-own-are-disposable).

#### `AutoscaledPool` is no longer public API

`AutoscaledPool` is `@internal` in v4, along with `AutoscaledPoolOptions`. It is still exported from `@crawlee/core` (and re-exported by `crawlee`), so nothing breaks at import time — but with all the configuration moved to the `ConcurrencySystem`, what remains is a bare parallel task runner. It can change without a major bump, so avoid depending on it; if you only wanted bounded parallelism, a `p-limit`-style helper is a better fit than an internal Crawlee class.

The crawler's `autoscaledPool` property is **private** as a result. Everything it was reached for has a crawler-level counterpart:

| Before | After |
|---|---|
| `await crawler.autoscaledPool.pause(secs)` | `await crawler.pause(secs)` |
| `crawler.autoscaledPool.resume()` | `crawler.resume()` |
| `await crawler.autoscaledPool.abort()` | `await crawler.teardown()` — or `crawler.stop()`, to let in-flight requests finish |
| `crawler.autoscaledPool.system` | `crawler.concurrencySystem` |
| `crawler.autoscaledPool.desiredConcurrency` | `crawler.concurrencySystem?.desiredConcurrency` |
| `crawler.autoscaledPool.currentConcurrency` | `crawler.concurrencySystem?.currentConcurrency` |

```typescript
const crawler = new CheerioCrawler({
    async requestHandler({ log }) {
        log.info(`Currently running ${crawler.concurrencySystem?.currentConcurrency} requests in parallel.`);
    },
});
```

`crawler.concurrencySystem` is `undefined` until `run()` has resolved it, and a crawler-owned default is rebuilt for every run — so read it during a run rather than caching it across runs. A system *you* injected is simply the instance you passed in.

The getter is typed as the read-only `IConcurrencySystem` and has no setters, so retuning concurrency mid-crawl means owning the instance:

```typescript
const concurrencySystem = new ConcurrencySystem({ maxConcurrency: 50 });

const crawler = new CheerioCrawler({
    concurrencySystem,
    requestHandler,
    errorHandler: async ({ response }) => {
        if (response?.status === 429) concurrencySystem.maxConcurrency = 10;
    },
});
```

`crawler.pause()` resolves once the requests already in flight have settled, and leaves `run()` pending until you `resume()` — unlike `crawler.stop()`, which ends the run gracefully. One behavioral consequence of the split: pausing no longer suspends autoscaling, because the autoscaling interval belongs to the `ConcurrencySystem`, which knows nothing about its borrowers' pause state — deliberately, since other crawlers sharing it may still need scaling. A paused crawler's system keeps evaluating (and possibly scaling down) the desired concurrency and keeps emitting its periodic state log. Scaling *up* stays effectively blocked, as the current concurrency drains below the ratio required for a scale-up. To silence the system during a long pause, `stop()` it (if you own it) and `start()` it again before resuming; a restart discards the snapshots taken before it, so the pause is not mistaken for load.

##### If you were driving an `AutoscaledPool` directly

All scaling and load-monitoring options were **removed** from `AutoscaledPoolOptions` and now live on `ConcurrencySystemOptions`: `minConcurrency`, `maxConcurrency`, `desiredConcurrency`, `desiredConcurrencyRatio`, `scaleUpStepRatio`, `scaleDownStepRatio`, `loggingIntervalSecs`, `autoscaleIntervalSecs`, and `maxTasksPerMinute`, plus the load-signal configuration described [below](#load-signal-options-restructured). The `snapshotterOptions` and `systemStatusOptions` bags are both gone, as are the `minConcurrency`/`maxConcurrency` accessors and every setter (`desiredConcurrency`, `currentConcurrency` and `system` remain as read-only getters). In their place, `AutoscaledPoolOptions` gained a **required** `concurrencySystem`, plus a **required** `consumer` — the pool's identity (`{ id }`), which it presents to the governor on every capacity query and booking so that a shared one can tell several pools' tasks apart.

**Before:**
```typescript
const pool = new AutoscaledPool({
    minConcurrency: 5,
    maxConcurrency: 50,
    maxTasksPerMinute: 120,
    runTaskFunction: async () => { /* ... */ },
    isTaskReadyFunction: async () => true,
    isFinishedFunction: async () => false,
});
await pool.run();
```

**After:**
```typescript
import { AutoscaledPool, ConcurrencySystem } from '@crawlee/core';

const concurrencySystem = new ConcurrencySystem({
    minConcurrency: 5,
    maxConcurrency: 50,
    maxTasksPerMinute: 120,
});
await concurrencySystem.start();

const pool = new AutoscaledPool({
    concurrencySystem,
    consumer: { id: 'my-pool' },
    runTaskFunction: async () => { /* ... */ },
    isTaskReadyFunction: async () => true,
    isFinishedFunction: async () => false,
});

try {
    await pool.run();
} finally {
    await concurrencySystem.stop();
}
```

#### `autoscaledPoolOptions` is now `taskLoopOptions`, and no longer carries concurrency config

The crawler option was renamed — it was named after a class that is now internal — and narrowed to **only** the task-loop predicates `isFinishedFunction` and `isTaskReadyFunction`. Its type changed from `AutoscaledPoolOptions` to `TaskLoopPredicates` (itself a rename of the interim `AutoscaledPoolPredicateOptions`). Concurrency configuration goes through either the `minConcurrency` / `maxConcurrency` / `maxRequestsPerMinute` shortcuts (which configure the crawler's default `ConcurrencySystem`), or — for anything finer — a supplied `concurrencySystem`.

Three options that used to live here — `maybeRunIntervalSecs`, `taskTimeoutSecs` and `log` — did *not* move to the `ConcurrencySystem` and have no replacement: the crawler's task-loop cadence is no longer configurable.

**Before:**
```typescript
const crawler = new CheerioCrawler({
    autoscaledPoolOptions: {
        desiredConcurrency: 10,
        maxTasksPerMinute: 120,
        systemStatusOptions: { currentHistorySecs: 10 },
    },
    requestHandler,
});
```

**After:**
```typescript
const concurrencySystem = new ConcurrencySystem({
    desiredConcurrency: 10,
    maxTasksPerMinute: 120,
    currentHistorySecs: 10,
});

const crawler = new CheerioCrawler({ concurrencySystem, requestHandler });
```

The shortcuts cannot be combined with a supplied `concurrencySystem` — they configure the default system that a supplied one replaces, so the crawler constructor **throws** rather than dropping a limit you asked for. For the common case, the shortcuts are all you need and no `ConcurrencySystem` is involved:

```typescript
const crawler = new CheerioCrawler({
    minConcurrency: 5,
    maxConcurrency: 50,
    maxRequestsPerMinute: 120,
    requestHandler,
});
```

A supplied system also replaces the default *wholesale*, including any crawler-specific tuning that default carried. `HttpCrawler` and its subclasses (`CheerioCrawler`, `JSDOMCrawler`, …) ship a preset — a higher `desiredConcurrency` and a relaxed event loop signal — exported as `HTTP_OPTIMIZED_CONCURRENCY_SYSTEM_OPTIONS`; spread it in to keep it:

```typescript
import { ConcurrencySystem, HTTP_OPTIMIZED_CONCURRENCY_SYSTEM_OPTIONS } from 'crawlee';

const concurrencySystem = new ConcurrencySystem({
    ...HTTP_OPTIMIZED_CONCURRENCY_SYSTEM_OPTIONS,
    maxConcurrency: 50,
});
```

### Load-signal options restructured

The per-resource load-signal configuration was consolidated. It used to be spread across flat `SnapshotterOptions` fields, the `max*OverloadedRatio` options on `SystemStatusOptions`, and a separate `loadSignals` array — three places, two of them named after classes that are now internal. All of it now lives in a single `loadSignals` bag on `ConcurrencySystemOptions`: one options bag per built-in signal (each carrying its own limits *and* its `overloadedRatio`), plus `custom` for your own implementations.

**Before:**
```typescript
new AutoscaledPool({
    snapshotterOptions: {
        maxUsedMemoryRatio: 0.8,
        eventLoopSnapshotIntervalSecs: 2,
        maxBlockedMillis: 100,
        clientSnapshotIntervalSecs: 1,
        maxClientErrors: 3,
        snapshotHistorySecs: 60,
    },
    systemStatusOptions: {
        maxMemoryOverloadedRatio: 0.2,
        maxEventLoopOverloadedRatio: 0.7,
        maxCpuOverloadedRatio: 0.4,
        maxClientOverloadedRatio: 0.3,
        currentHistorySecs: 10,
        loadSignals: [myProxyHealthSignal],
    },
    // ...
});
```

**After:**
```typescript
new ConcurrencySystem({
    loadSignals: {
        memory: { maxUsedRatio: 0.8, overloadedRatio: 0.2 },
        eventLoop: { snapshotIntervalSecs: 2, maxBlockedMillis: 100, overloadedRatio: 0.7 },
        cpu: { overloadedRatio: 0.4 },
        storageBackend: { snapshotIntervalSecs: 1, maxErrors: 3, overloadedRatio: 0.3 },
        custom: [myProxyHealthSignal],
    },
    // the two evaluation windows are policy, alongside the scaling options
    snapshotHistorySecs: 60,
    currentHistorySecs: 10,
});
```

The signal that watches storage rate-limit errors follows the [`StorageClient` → `StorageBackend` rename](#storagebackend-interface-simplified): the option is `loadSignals.storageBackend`, the class `StorageBackendLoadSignal`, and its verdict is reported as `SystemInfo.storageBackendInfo`. The type of that verdict, `ClientInfo`, is now `LoadSignalInfo` — it backs every signal's entry, not just this one.

In detail: the four `max*OverloadedRatio` options of `SystemStatusOptions` were **removed** (each signal now owns its overload ratio, set in its own bag), custom signals moved from `systemStatusOptions.loadSignals` to `loadSignals.custom`, and the two evaluation windows — `snapshotHistorySecs` (autoscaling) and `currentHistorySecs` (task gating) — are plain options on `ConcurrencySystemOptions`, since they apply to every signal alike rather than to any one of them.

Two related capabilities are new, and covered in the [scaling guide](../guides/scaling-crawlers#load-signals): a built-in signal can be switched **off** with `false`, and each built-in is also a public class (`MemoryLoadSignal`, `EventLoopLoadSignal`, `CpuLoadSignal`, `StorageBackendLoadSignal`) you can construct to wrap or adapt.

A duplicate signal name now **throws**, where naming a custom signal after a built-in (`memInfo`, `eventLoopInfo`, `cpuInfo`, `storageBackendInfo`) used to look like an override but never was one: the built-in kept running and kept holding concurrency down, while your signal only overwrote its field in the reported `SystemInfo`. To take a built-in's place, switch it off:

```typescript
new ConcurrencySystem({
    loadSignals: {
        // Without `memory: false`, this throws — the built-in memory signal is still enabled.
        memory: false,
        custom: [myMemorySignal], // free to take over the vacated `memInfo` field
    },
});
```

`Snapshotter` and `SystemStatus` are no longer public API, along with `SnapshotterOptions` and `SystemStatusOptions` — they are implementation details of the `ConcurrencySystem`, which is now the only supported entry point to load monitoring; read the resulting `SystemInfo` through `ConcurrencySystem.getCurrentStatus()`. Still public: the configuration types, the four built-in signal classes, and the extension surface (`LoadSignal`, `SnapshotStore`, `LoadSignalStartContext`). The concrete snapshot types the built-ins produce are *not* — `getSample()` returns plain `LoadSnapshot` values.

#### Both evaluation windows are now requested from every signal

Overload is evaluated over two windows: `currentHistorySecs` (default 5s) gates whether another task may start, and `snapshotHistorySecs` (default 30s) drives autoscaling. The long one used to be implicit — `getHistoricalStatus()` asked each signal for *everything it had retained*, so a custom signal keeping five minutes of snapshots silently made autoscaling reason over five minutes of history for that resource while the built-ins used 30 seconds. Both are now requested explicitly from every signal, and `LoadSignal.start()` receives the wider of the two as `maxSampleWindowMillis` so retention can be sized to match.

You are affected if a custom signal retains **more** history than `snapshotHistorySecs` (its stale snapshots no longer influence scaling), or if its `getSample()` ignores the `sampleDurationMillis` argument, in which case it still contributes everything it has. On the API side, `snapshotHistoryMillis` was removed from the per-signal option types and `SnapshotStore` lost both its constructor argument and the `fromInterval`/`fromEvent` factories; call `useSampleWindow(maxSampleWindowMillis)` and `clear()` from your `start()` instead, as a store that is never given a window retains everything. The [scaling guide](../guides/scaling-crawlers#load-signals) has a worked example.

## Only if you import helpers from `@crawlee/utils` or `@crawlee/types`

Applies when you import utility functions, enums or types directly from `@crawlee/utils` or `@crawlee/types`, rather than only using the crawlers.

### Available resource detection

In v3, we introduced a new way to detect available resources for the crawler, available via `systemInfoV2` flag. In v4, this is the default way to detect available resources. The old way is removed completely together with the `systemInfoV2` flag.

As part of this change, the low-level resource- and environment-detection helpers exported from `@crawlee/utils` were **removed**: `getMemoryInfo()` (and the `MemoryInfo` interface), `isContainerized()`, `isDocker()`, `isLambda()`, and `getCgroupsVersion()`. These backed the old detection path and are no longer part of the public API. Resource detection is now handled internally by the crawler's autoscaling; if you called any of these directly, read the equivalent values from the OS (`node:os`) or the relevant cgroup files yourself.

### `@crawlee/types` symbols are no longer re-exported

The general-purpose utility types owned by `@crawlee/types` are no longer re-exported from other packages, so `Dictionary`, `Awaitable`, `Constructor`, `Cookie`, `QueueOperationInfo` and `AllowedHttpMethods` are no longer available from `@crawlee/core` (nor, in turn, from `@crawlee/basic` and the `crawlee` meta-package). Add `@crawlee/types` to your dependencies and import them from there — most of the package's types (`ISession`, `ProxyInfo`, `RequestSchema`, …) already required this. The interfaces you implement against — `StorageBackend`, `StorageIdentifier` and `IBrowserPool` / `NewPageOptions` — stay reachable from `@crawlee/core` and `@crawlee/browser-pool` respectively.

### Removed and relocated `@crawlee/utils` exports

Besides the resource-detection helpers above, several other `@crawlee/utils` exports were removed or moved:

- **Removed URL helpers:** `filterUrl(target, origin, strategy)`, `matchesEnqueueStrategy(strategy, target, origin)`, and the `UNSUPPORTED_SCHEME_MESSAGE` constant. URL filtering by enqueue strategy is now internal to `enqueueLinks`. The related `filterRequestsByPatterns(requests, patterns?, onSkippedUrl?)` function (from `@crawlee/core`) was removed for the same reason — pattern-based request filtering now happens inside `enqueueLinks`.
- **Relocated enums/types:** `EnqueueStrategy` now lives in `@crawlee/core` and `SearchParams` in `@crawlee/types`. They are no longer re-exported from `@crawlee/utils`, so `import { EnqueueStrategy } from '@crawlee/utils'` breaks — import them from `crawlee` (the meta-package) or from `@crawlee/core` / `@crawlee/types` instead.
- **Removed `RobotsFile` alias:** `RobotsFile` was an alias for the `RobotsTxtFile` class and is removed. Rename any usage to `RobotsTxtFile`; the class itself is unchanged apart from the signature change described below.
- **Split into public and `/internal` entry points:** the main `@crawlee/utils` entry now exposes only the user-facing helpers (`sleep`, `htmlToText`, `extractUrls`, `downloadListOfUrls`, `expandShadowRoots`, the `social` namespace, the Open Graph parser, and the robots/sitemap utilities). Helpers that primarily serve the crawler packages - e.g. `URL_NO_COMMAS_REGEX`, `URL_WITH_COMMAS_REGEX`, `extractUrlsFromCheerio`, `tryAbsoluteURL`, and the blocked-detection and iterable helpers - moved to the `@crawlee/utils/internal` entry point. They keep working, but imports need updating: `import { URL_NO_COMMAS_REGEX } from '@crawlee/utils/internal'`. As the name suggests, the internal entry follows no semver guarantees.
- **Removed `CheerioRoot` and the cheerio type re-exports:** `CheerioRoot` was an alias for cheerio's own `CheerioAPI` and is gone; `parseWithCheerio()` and `htmlToText()` are typed with `CheerioAPI` directly. The crawler packages also no longer re-export `Cheerio`, `CheerioAPI` and `Element`, so `import type { CheerioAPI } from 'crawlee'` (or from `@crawlee/basic` / `@crawlee/puppeteer` / ...) breaks - import them from `cheerio` and `domhandler`, which are the packages that own them.
- **`@crawlee/core` no longer re-exports the internal helpers:** `parseArgument`, `schemas` and `tryAbsoluteURL` reached `@crawlee/core` (and through it `@crawlee/basic`, `@crawlee/http`, `@crawlee/browser` and `crawlee`) as public exports, which put symbols from the no-semver `/internal` entry point back into a semver-stable surface. Import them from `@crawlee/utils/internal` instead. `ArgumentValidationError` is unaffected and stays exported from `@crawlee/core`.

#### `RobotsTxtFile.find` signature changed; sitemap options removed

The `proxyUrl` argument of `RobotsTxtFile.find()` moved from a positional parameter into the options bag, which also gained `httpClient` and `logger`:

**Before:**
```typescript
const robots = await RobotsTxtFile.find(url, proxyUrl, { timeoutMillis: 5000 });
```

**After:**
```typescript
const robots = await RobotsTxtFile.find(url, { proxyUrl, timeoutMillis: 5000 });
```

Relatedly, `RobotsTxtFile.getSitemaps()`, `parseSitemaps()`, and `parseUrlsFromSitemaps()` no longer take a `RobotsTxtFileSitemapsOptions` argument (the type is removed), and the `enqueueStrategy` / `networkTimeouts` options were dropped from `ParseSitemapOptions` — robots/sitemap parsing no longer filters by enqueue strategy.

### HTML-parsing helper functions are now asynchronous

The HTML-parsing helper functions `htmlToText`, `parseHandlesFromHtml` and `parseOpenGraph` are now asynchronous and return promises.

## Only if you use `StagehandCrawler`

### Stagehand type narrowings

A few Stagehand-specific option types were tightened:

- `StagehandGotoOptions` dropped its `Dictionary &` intersection — it is now exactly `NonNullable<Parameters<Page['goto']>[1]>`, so arbitrary extra keys are no longer accepted.
- The explicit `failedRequestHandler` field was removed from `StagehandCrawlerOptions` (it is inherited from the base crawler options generically, so passing `failedRequestHandler` still works).
- The `ignoreShadowRoots` and `ignoreIframes` options were removed from `StagehandCrawler`.

## Appendix: removed symbols

The full list of removed exports and members, for ctrl-F purposes. Where a replacement exists, it is noted inline.

### Removed symbols

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
- `context.blockResources` and `context.cacheResponses` — no longer attached to the crawling context. The functionality is still available as deprecated functions, accessible both via the `puppeteerUtils` namespace (`puppeteerUtils.blockResources`, `puppeteerUtils.cacheResponses`) and as top-level exports from `@crawlee/puppeteer` (`import { blockResources, cacheResponses } from '@crawlee/puppeteer'`). Unlike the old context helpers, these take an explicit `page` argument — e.g. `await blockResources(page)`. Both are `@deprecated` and will be removed in a future release, so migrate away from them.
- `context.closeCookieModals`, `playwrightUtils.closeCookieModals` and `puppeteerUtils.closeCookieModals` — removed along with the optional `idcac-playwright` peer dependency (see [Crawling context no longer includes `closeCookieModals`](#crawling-context-no-longer-includes-closecookiemodals) and the [cookie modals guide](../guides/cookie-modals))
- `Configuration.systemInfoV2` / `CRAWLEE_SYSTEM_INFO_V2` environment variable — the v2 behavior is now the default (see [Available resource detection](#available-resource-detection))
- `checkAndSerialize` and `chunkBySize` functions (from `@crawlee/core`) — value (de)serialization now lives in the `KeyValueStore` frontend; use `serializeValue` / `parseValue` (see [`maybeStringify` is removed](#maybestringify-is-removed))
- `BASIC_CRAWLER_TIMEOUT_BUFFER_SECS` constant (from `@crawlee/basic`) — was an internal timeout buffer, no longer exported
- `HttpResponse`, `HttpResponseWithoutBody`, `StreamingHttpResponse`, `ResponseTypes`, `BaseHttpResponseData`, `SimpleHeaders`, `processHttpRequestOptions`, and `GotScrapingHttpClient` (from `@crawlee/core`) — the HTTP client surface moved to `@crawlee/http-client` / `@crawlee/got-scraping-client` (see [HTTP client packages and `BaseHttpClient` reshaped](#http-client-packages-and-basehttpclient-reshaped))
- `StreamHandlerContext` and `FileDownloadOptions` types (from `@crawlee/http`) — see [`FileDownload` now extends `BasicCrawler`](#filedownload-now-extends-basiccrawler-and-no-longer-takes-filedownloadoptions)
- `PlainResponse` type (from `@crawlee/http`) — it wrapped the `got-scraping` response and is gone along with the rest of the old HTTP response surface (see [`CrawlingContext.response` is now of type `Response`](#crawlingcontextresponse-is-now-of-type-response))
- `checkStorageAccess`, `withCheckedStorageAccess` and the `RequestHandlerResult` type — superseded by the storage transaction mechanism; use `withDirectStorageAccess()` and `StorageTransactionView` (see [Storage writes in request handlers are transactional](#storage-writes-in-request-handlers-are-transactional))

#### The protected `BasicCrawler.crawlingContexts` map is removed

The property was not used by the library itself and re-implementing the functionality in user code is fairly straightforward.
