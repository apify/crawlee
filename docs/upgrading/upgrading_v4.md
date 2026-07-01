---
id: upgrading-to-v4
title: Upgrading to v4
---

import ApiLink from '@site/src/components/ApiLink';

This page summarizes most of the breaking changes in Crawlee v4.

## ECMAScript modules

Crawlee v4 is a native ESM package now. It can be still consumed from a CJS project, as long as you use TypeScript and Node.js version that supports `require(esm)`.

## Node 22+ required

Support for older node versions was dropped.

## TypeScript 5.8+ required

Support for older TypeScript versions was dropped. Older versions might work too, but only if your project is also ESM.

## Cheerio v1

Previously, we kept the dependency on cheerio locked to the latest RC version, since there were many breaking changes introduced in v1.0. This release bumps cheerio to the stable v1. Also, we now use the default `parse5` internally.

## Deprecated crawler options are removed

The crawler following options are removed:

- `handleRequestFunction` -> `requestHandler`
- `handlePageFunction` -> `requestHandler`
- `handleRequestTimeoutSecs` -> `requestHandlerTimeoutSecs`
- `handleFailedRequestFunction` -> `failedRequestHandler`

## Underscore prefix is removed from many protected and private methods

- `BasicCrawler._runRequestHandler` -> `BasicCrawler.runRequestHandler`

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
- `HttpCrawler._parseResponse` (protected) - made private
- `HttpCrawler.use` and the `CrawlerExtension` class (experimental) - the `ContextPipeline` should be used for extending the crawler
- `FileDownloadOptions.streamHandler` - streaming should now be handled directly in the `requestHandler` instead
- `playwrightUtils.registerUtilsToContext` and `puppeteerUtils.registerUtilsToContext` - this is now added to the context via `ContextPipeline` composition
- `puppeteerUtils.blockResources` and `puppeteerUtils.cacheResponses` (deprecated)
- `Configuration.systemInfoV2` / `CRAWLEE_SYSTEM_INFO_V2` environment variable — the v2 behavior is now the default (see [Available resource detection](#available-resource-detection))

### The protected `BasicCrawler.crawlingContexts` map is removed

The property was not used by the library itself and re-implementing the functionality in user code is fairly straightforward.

## Removed crawling context properties

### Crawling context no longer includes Error for failed requests

The crawling context no longer includes the `Error` object for failed requests. Use the second parameter of the `errorHandler` or `failedRequestHandler` callbacks to access the error.

### Crawling context no longer includes a reference to the crawler itself

This was previously accessible via `context.crawler`. If you want to restore the functionality, you may use the `extendContext` option of the crawler:

```ts
const crawler = new CheerioCrawler({
  extendContext: () => ({ crawler }),
  requestHandler: async (context) => {
    if (Math.random() < 0.01) {
      context.crawler.stop()
    }
  }
})
```

## Crawling context is strictly typed

Previously, the crawling context extended a `Record` type, allowing to access any property. This was changed to a strict type, which means that you can only access properties that are defined in the context.

## `SessionPool` is now lazy-initialized

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

## `createSessionFunction` signature has changed

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

## `Session` no longer requires a `sessionPool` reference

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

## Custom `SessionPool` implementations via the `ISessionPool` interface

Crawlers now accept any object implementing the new `ISessionPool` interface as their `sessionPool` option, not just instances of the built-in `SessionPool`. The contract is intentionally tiny — a single method, `getSession()` / `getSession(id)`, that hands out a `Session` for a request. Lifecycle (reset, teardown) is the responsibility of whoever owns the pool: a custom pool you construct yourself is never owned by the crawler, so the crawler never tears it down. This makes it straightforward to plug in a remote, shared, or otherwise customized session-management strategy without subclassing `SessionPool` or copying its internals.

```typescript
import { BasicCrawler, Session, type ISessionPool } from '@crawlee/core';

class MySessionPool implements ISessionPool {
    private readonly sessions = new Map<string, Session>();

    async getSession(): Promise<Session>;
    async getSession(sessionId: string): Promise<Session | undefined>;
    async getSession(sessionId?: string): Promise<Session | undefined> {
        if (sessionId) {
            const existing = this.sessions.get(sessionId);
            return existing?.isUsable() ? existing : undefined;
        }

        const usable = [...this.sessions.values()].find((s) => s.isUsable());
        if (usable) return usable;

        const fresh = new Session();
        this.sessions.set(fresh.id, fresh);
        return fresh;
    }
}

const crawler = new BasicCrawler({
    sessionPool: new MySessionPool(),
    requestHandler: async ({ session }) => {
        // session is a Session instance, use it as usual
    },
});
```

The returned objects must be `Session` instances — the rest of the crawler relies on `session.markGood()`, `session.cookieJar`, `session.proxyInfo`, and the rest of the concrete `Session` API.

## `retireOnBlockedStatusCodes` is removed from `Session`

`Session.retireOnBlockedStatusCodes` is removed. Blocked status code handling is now internal to the crawler. Configure blocked status codes via the `blockedStatusCodes` crawler option (moved from `sessionPoolOptions`).

## `useSessionPool` and `sessionPoolOptions` are removed

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

## Custom `BrowserPool` implementations via the `IBrowserPool` interface

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

## `tieredProxyUrls` is removed from `ProxyConfiguration`

The `tieredProxyUrls` option has been removed, together with the `proxyTier` field on `ProxyInfo` and the `proxyTier` plumbing in `BrowserPool`. In v4 the `Session` is the main rotation unit - a session already carries its own proxy, cookies and error score, so the pool rotates the whole fingerprint when a session gets retired on a block.

If you used tiers to escalate from a cheap proxy pool to a pricier one on blocks, you can achieve the same behavior by pre-populating a `SessionPool` with named sessions - one per proxy tier - and flipping `request.sessionId` in an `errorHandler` to reassign the retry to the next tier. Skip the `proxyConfiguration` option on the crawler - the session already carries its own proxy.

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

## `maxSessionRotations` and `request.sessionRotationCount` are removed

Session errors no longer have their own retry budget. The `maxSessionRotations` crawler option, the `Request.sessionRotationCount` property, and the special-case retry logic for `SessionError` are all gone. A `SessionError` now retires the session and counts toward `maxRequestRetries` like any other failure, so configure a single retry limit via `maxRequestRetries` (default `3`). `SessionError` also no longer extends `RetryRequestError` - if you were catching `RetryRequestError` to detect a session-triggered retry, branch on `SessionError` directly instead.

## Remove `experimentalContainers` option

This experimental option relied on an outdated manifest version for browser extensions, it is not possible to achieve this with the currently supported versions.

## Available resource detection

In v3, we introduced a new way to detect available resources for the crawler, available via `systemInfoV2` flag. In v4, this is the default way to detect available resources. The old way is removed completely together with the `systemInfoV2` flag.

## `HttpClient` instances return `Response` objects

The interface of `HttpClient` instances was changed to return the [native `Response` objects](https://developer.mozilla.org/en-US/docs/Web/API/Response) instead of custom `HttpResponse` objects.

## `CrawlingContext.response` is now of type `Response`

The `CrawlingContext.response` property is now of type [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) instead of `HttpResponse`. `CrawlingContext.sendRequest` method now returns `Response` objects as well.

## Crawling context in the `FileDownload` crawler no longer includes `body` and `stream` properties

The crawling context in the `FileDownload` crawler no longer includes the `body` and `stream` properties. These can be accessed directly via the `response` property instead, e.g. `context.response.bytes()` or `context.response.body`.

## `KeyValueStore.getPublicUrl` is now async

The `KeyValueStore.getPublicUrl` method is now asynchronous and reads the public URL directly from the storage client.

## `preNavigationHooks` in `HttpCrawler` no longer accepts `gotOptions` object

The `preNavigationHooks` option in `HttpCrawler` subclasses no longer accepts the `gotOptions` object as a second parameter. Modify the `crawlingContext` fields (e.g. `.request`) directly instead.

## Configuration class redesign

The `Configuration` class has been redesigned for v4. The main changes are:

### Direct property access replaces `get()` and `set()`

**Before:**
```ts
const config = Configuration.getGlobalConfig();
config.set('persistStateIntervalMillis', 10_000);
const headless = config.get('headless');
```

**After:**
```ts
// Configuration is now immutable — set options via the constructor
const config = new Configuration({ persistStateIntervalMillis: 10_000 });
const headless = config.headless;
```

The `get()` and `set()` methods are removed. Access config values directly as properties.
Configuration instances are immutable — attempting to assign a property throws a `TypeError`.

### Constructor options now take precedence over environment variables

**New priority order (highest to lowest):**
1. Constructor options
2. Environment variables
3. `crawlee.json`
4. Schema defaults

Previously, environment variables always won. Now `new Configuration({ headless: false })`
works even when `CRAWLEE_HEADLESS=true` is set.

## Service management moved from `Configuration` to `ServiceLocator`

The service management functionality has been extracted from `Configuration` into a new `ServiceLocator` class, following the pattern established in Crawlee for Python.

### Breaking changes

The following methods and properties have been removed from `Configuration`:

- `Configuration.getStorageClient()` - moved to `ServiceLocator.getStorageClient()`
- `Configuration.getEventManager()` - moved to `ServiceLocator.getEventManager()`
- `Configuration.useStorageClient()` - use `ServiceLocator.setStorageClient()` instead
- `Configuration.useEventManager()` - use `ServiceLocator.setEventManager()` instead
- `Configuration.resetGlobalState()` - use `serviceLocator.reset()` instead
- `Configuration.storageManagers` - moved to `ServiceLocator.storageManagers`

The `EventManager` and `LocalEventManager` constructors now accept an options object for configuring event intervals (e.g. `persistStateIntervalMillis`, `systemInfoIntervalMillis`). You can also use the new `LocalEventManager.fromConfig()` factory method to create an instance with intervals derived from a `Configuration` object.

### Migration guide

If you were using the removed `Configuration` methods directly, you need to update your code:

**Before:**
```typescript
import { Configuration } from 'crawlee';

const config = Configuration.getGlobalConfig();
const storageClient = config.getStorageClient();
const eventManager = config.getEventManager();

// or static methods
const storageClient = Configuration.getStorageClient();
```

**After:**
```typescript
import { serviceLocator } from 'crawlee';

const storageClient = serviceLocator.getStorageClient();
const eventManager = serviceLocator.getEventManager();
```

### Using per-crawler services (recommended)

The new `ServiceLocator` supports per-crawler service isolation, allowing you to use different storage clients or event managers for different crawlers by passing them via options:

```typescript
import { BasicCrawler, Configuration, LocalEventManager, MemoryStorageClient } from 'crawlee';

const crawler = new BasicCrawler({
    requestHandler: async ({ request, log }) => {
        log.info(`Processing ${request.url}`);
    },
    configuration: new Configuration({ headless: false }),
    storageClient: new MemoryStorageClient(),
    eventManager: LocalEventManager.fromConfig(),
});

await crawler.run(['https://example.com']);
```

### Using the global service locator

For most use cases, the global `serviceLocator` singleton works well:

```typescript
import { serviceLocator, BasicCrawler, MemoryStorageClient } from 'crawlee';

// Configure global services (optional)
serviceLocator.setStorageClient(new MemoryStorageClient());

// All crawlers will use the global service locator by default
const crawler = new BasicCrawler({
    requestHandler: async ({ request, log }) => {
        log.info(`Processing ${request.url}`);
    },
});
```

### Accessing configuration

`Configuration.getGlobalConfig()` remains as a utility function, but in most cases, you should use `serviceLocator.getConfiguration()` instead:

```typescript
import { serviceLocator } from 'crawlee';

const config = serviceLocator.getConfiguration();
```

Do note that the method is currently misnamed - in specific circumstances, it will not return the global configuration object, but the one from the currently active service locator.

## Cookie handling in `HttpCrawler` and `sendRequest`

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

## `persistCookiesPerSession` renamed to `saveResponseCookies`

The `persistCookiesPerSession` crawler option has been renamed to `saveResponseCookies` on both `HttpCrawler` (and its subclasses like `CheerioCrawler`, `JSDOMCrawler`, etc.) and `BrowserCrawler`. The behavior is unchanged - when enabled (the default), response `Set-Cookie` headers are stored in the session's cookie jar so they're sent on subsequent requests using the same session. Rename the option in your crawler constructor options to migrate.

## Internal KVS keys renamed

Several internal Crawlee keys were prefixed with the `SDK_` prefix for legacy reasons - these keys now start with `CRAWLEE_` instead. These are, e.g., `CRAWLEE_SESSION_POOL_STATE` or `CRAWLEE_CRAWLER_STATISTICS_{n}`.

## `StorageClient` interface simplified

The `StorageClient` interface (from `@crawlee/types`) has been redesigned to match the simplified architecture from Crawlee for Python. A new storage backend now needs **4 classes** instead of the previous 7.

### What changed

The three **collection client** interfaces have been removed:

- `DatasetCollectionClient`
- `KeyValueStoreCollectionClient`
- `RequestQueueCollectionClient`

Along with their associated types (`DatasetCollectionData`, `DatasetCollectionClientOptions`, and the `Dataset` interface from `@crawlee/types`).

The `StorageClient` interface changed from synchronous sub-client getters to **async factory methods**:

| Before (v3) | After (v4) |
|---|---|
| `client.dataset(id)` | `client.createDatasetClient({ id?, name? })` |
| `client.datasets().getOrCreate(name)` | _(absorbed into `createDatasetClient`)_ |
| `client.keyValueStore(id)` | `client.createKeyValueStoreClient({ id?, name? })` |
| `client.keyValueStores().getOrCreate(name)` | _(absorbed into `createKeyValueStoreClient`)_ |
| `client.requestQueue(id, opts)` | `client.createRequestQueueClient({ id?, name?, clientKey?, timeoutSecs? })` |
| `client.requestQueues().getOrCreate(name)` | _(absorbed into `createRequestQueueClient`)_ |

The sub-client interfaces (`DatasetClient`, `KeyValueStoreClient`, `RequestQueueClient`) have been aligned with their Python counterparts:

| Before (v3) | After (v4) |
|---|---|
| `get()` | `getMetadata()` |
| `update()` | Removed |
| `delete()` | `drop()` |
| _(n/a)_ | `purge()` (new — clears data, keeps storage) |

**`DatasetClient`:**

| Before (v3) | After (v4) |
|---|---|
| `pushItems(items: Data \| Data[] \| string \| string[])` | `pushData(items: Data[])` |
| `listItems(options?)` (dual iterable) | `getData(options?)` (returns a single `PaginatedList` page) |
| `listEntries(options?)` | Removed (handled by `Dataset` frontend) |
| `downloadItems()` | Removed |

**`KeyValueStoreClient`:**

| Before (v3) | After (v4) |
|---|---|
| `getRecord(key, options?)` | `getValue(key)` |
| `setRecord(record, options?)` | `setValue(record)` |
| `deleteRecord(key)` | `deleteValue(key)` |
| `getRecordPublicUrl(key)` | `getPublicUrl(key)` |
| `listKeys(options?)` → `KeyValueStoreClientListData` | `listKeys(options?)` → `KeyValueStoreItemData[]` |
| `keys()`, `values()`, `entries()` | Removed (handled by `KeyValueStore` frontend) |

**`RequestQueueClient`:**

The request queue client was reduced from 12 methods to 10. The distributed-locking protocol (`listAndLockHead` → `prolongRequestLock` → `deleteRequestLock`) and the queue-head/consistency bookkeeping that used to live in the `RequestQueue` frontend have been removed from the interface; coordinating multiple clients accessing the same queue (e.g. request locking on the Apify platform) is now an internal concern of the client implementation.

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

`RequestQueueClient.isEmpty()` and `RequestQueueClient.isFinished()` answer two different questions:

- `isEmpty()` is the weak check — `true` when the next `fetchNextRequest()` would return `null`, i.e. there is nothing left to fetch right now. Requests that are currently in progress (fetched but not yet handled or reclaimed) are **not** counted, because they are not fetchable. This is what drives the crawler's task scheduling.
- `isFinished()` is the strong check — `true` only when there are no pending requests **and** no requests currently in progress (including those locked by other clients sharing the queue). This is what determines whether crawling is actually done. An in-progress request keeps the queue *empty but not finished*, which is what stops a crawler from shutting down while a request is still being processed.

The separate `RequestQueueV1`/`RequestQueueV2` classes (and the `RequestProvider` base class) have been removed. They no longer differ in behavior — request coordination is now internal to the storage client — so they are merged into a single `RequestQueue` class. Replace any `RequestQueueV1`, `RequestQueueV2`, or `RequestProvider` imports with `RequestQueue`.

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

The `RequestQueue.requestLockSecs` property has been removed. Because request locking is now internal to the storage client, the lock duration is no longer configured on the queue. When you run a crawler, it automatically tells the queue how long it expects to hold a request (based on `requestHandlerTimeoutMillis`), so a long-running request handler will not have its request handed out a second time — you usually don't need to configure anything.

If you use a `RequestQueue` outside of a crawler and your processing may exceed the 3-minute default lock, call `setExpectedRequestProcessingTimeSecs(secs)` on the queue to raise it:

```ts
import { RequestQueue } from 'crawlee';

const queue = await RequestQueue.open();
queue.setExpectedRequestProcessingTimeSecs(600);
```

The `RequestQueue.internalTimeoutMillis` property and the associated "stuck queue" self-recovery have been removed. In v3 the `RequestQueue` frontend kept its own copy of the queue head and in-progress set, which could drift out of sync with the backing storage (an eventual-consistency hazard on the Apify platform); `isFinished()` watched for inactivity exceeding `internalTimeoutMillis` and reset that frontend state to recover. In v4 the frontend no longer holds any such bookkeeping — the storage client is the single source of truth — so there is nothing for a reset to fix, and stuck request locks now self-heal on expiry. Any consistency-recovery logic that is genuinely specific to the Apify platform's distributed storage belongs in the Apify SDK's client implementation instead, and is tracked in [apify/crawlee#3328](https://github.com/apify/crawlee/issues/3328).

**Removed types** from `@crawlee/types`: `DatasetClientUpdateOptions`, `KeyValueStoreClientUpdateOptions`, `KeyValueStoreRecordOptions`, `KeyValueStoreClientListData`, `KeyValueStoreClientGetRecordOptions`, `QueueHead`, `RequestQueueHeadItem`, `ListOptions`, `ListAndLockOptions`, `ListAndLockHeadResult`, `ProlongRequestLockOptions`, `ProlongRequestLockResult`, `DeleteRequestLockOptions`. `KeyValueStoreClientListOptions` was renamed to `KeyValueStoreListKeysOptions`.

The high-level storage classes (`Dataset`, `KeyValueStore`, `RequestQueue`) now receive their sub-client directly in the constructor options instead of receiving a `StorageClient` and calling its methods.

### `RecordOptions` simplified

`timeoutSecs` and `doNotRetryTimeouts` were removed from `RecordOptions` (used by `KeyValueStore.setValue`). Only `contentType` remains.

### `maybeStringify` is removed

The `maybeStringify` helper exported from `@crawlee/core` has been removed. Value (de)serialization now lives entirely in the `KeyValueStore` frontend: writing serializes the value (and infers its content type), reading parses it back, and the storage client is a plain byte transport. If you imported `maybeStringify` directly, use the `serializeValue` / `parseValue` functions exported from `@crawlee/core` instead.

### `KeyValueStoreIteratorOptions` simplified

`exclusiveStartKey` and `collection` were removed. Only `prefix` remains.

### `Dataset.listItems` replaced by `Dataset.getData` and `Dataset.values`

`Dataset.listItems()` is replaced by two methods:
- `Dataset.getData(options?)` — returns a single `PaginatedList<Data>` page.
- `Dataset.values(options?)` — dual iterable: `for await...of` iterates all items; `await` returns all items as `Data[]`.

`Dataset.entries()` works the same way as `values()` but yields `[index, Data]` tuples. `KeyValueStore.keys()`, `.values()`, `.entries()` follow the same dual-iterable pattern.

### Removed `list()` method

The `list()` method on collection clients (e.g. `client.datasets().list()`) has no replacement. If you were using it to enumerate all storages, you will need to use the Apify API client directly.

### Migration guide

If you implemented a custom `StorageClient`, you need to:

1. Remove your `*CollectionClient` classes.
2. Replace the six getter methods (`dataset`, `datasets`, `keyValueStore`, `keyValueStores`, `requestQueue`, `requestQueues`) with three async factory methods (`createDatasetClient`, `createKeyValueStoreClient`, `createRequestQueueClient`). Each factory should handle both opening an existing storage and creating a new one.
3. Apply the sub-client renames listed above (`get` → `getMetadata`, `delete` → `drop`, etc.) and implement the new `purge()` method.

## `MemoryStorage` split into `FileSystemStorageClient` and `MemoryStorageClient`

In v3, the single `MemoryStorage` class from `@crawlee/memory-storage` did double duty: it kept everything in memory *and*, by default, mirrored it to disk (toggled via the `persistStorage` option / `CRAWLEE_PERSIST_STORAGE` environment variable). In v4 these two responsibilities are split into two independent classes, and the default storage client now persists to disk.

- **`FileSystemStorageClient`** (new, in the new `@crawlee/fs-storage` package) — always persists storage to the local directory (`CRAWLEE_STORAGE_DIR`, default `./storage`). This is what you get implicitly when you don't configure a storage client, and it is the behavior the old `MemoryStorage` had with its default `persistStorage: true`.
- **`MemoryStorageClient`** (the renamed `MemoryStorage`, now part of `@crawlee/core`) — keeps everything purely in memory and **never touches the disk**. This matches the old `MemoryStorage` with `persistStorage: false`. The standalone `@crawlee/memory-storage` package no longer exists; its code was merged into `@crawlee/core`.

Both classes are re-exported from the `crawlee` meta-package.

### The default storage client now persists to disk

Which client backs the implicit default is decided by `Configuration.persistStorage` (still controllable via the `CRAWLEE_PERSIST_STORAGE` environment variable): `true` (the default) selects `FileSystemStorageClient`, `false` selects `MemoryStorageClient`. If you relied on the default and never set `persistStorage`, your storage is persisted to disk exactly as before — no change.

### `MemoryStorage` is renamed and is now memory-only

If you constructed the storage client explicitly, two things changed:

1. **The class is renamed** `MemoryStorage` → `MemoryStorageClient`.
2. **It no longer writes to disk.** A bare `new MemoryStorage()` in v3 persisted to disk by default; `new MemoryStorageClient()` in v4 does not. If you want persistence, use `FileSystemStorageClient` instead.

**Before:**
```typescript
import { MemoryStorage } from '@crawlee/memory-storage';

// Persisted to disk by default in v3.
const storageClient = new MemoryStorage();
```

**After:**
```typescript
import { FileSystemStorageClient } from '@crawlee/fs-storage';
import { MemoryStorageClient } from '@crawlee/core';

// Persists to disk (the old default behavior):
const storageClient = new FileSystemStorageClient();

// Or keep everything in memory only (the old `persistStorage: false`):
const inMemory = new MemoryStorageClient();
```

The `localDataDirectory`, `persistStorage`, and `writeMetadata` options are still accepted by `MemoryStorageClient` for source compatibility, but they are ignored — in-memory storage has nowhere to write. `FileSystemStorageClient` honors `localDataDirectory` and `writeMetadata`; it always persists, so it has no `persistStorage` option.

### No request lock expiry in `MemoryStorageClient`

Because the in-memory queue lives entirely within a single process and is never shared with another consumer, `MemoryStorageClient`'s request queue no longer uses an expiring, cross-process lock. A fetched request simply stays *in progress* until it is handled or reclaimed; it never becomes fetchable again on its own after a timeout. `setExpectedRequestProcessingTimeSecs()` is therefore a no-op for in-memory storage. (Disk-backed `FileSystemStorageClient` keeps the lock-with-expiry behavior.)

## Multiple crawler instances use separate default request queues

In v3, every `BasicCrawler` (or subclass) that didn't receive an explicit `requestQueue` option would open the same default request queue. If you created two crawlers in the same process, they would silently share a queue — leading to request collisions and hard-to-debug deduplication issues.

In v4, only the **first** crawler instance uses the default request queue. Each subsequent instance automatically gets its own queue via an internal alias (e.g. `__default_1__`, `__default_2__`, etc.). This means multiple crawlers can safely coexist without interfering with each other's requests.

If you explicitly pass a `requestQueue` (or `requestManager`) to the crawler, that queue is used as-is regardless of instance order.

## Repeated `run()` calls use `purge()` instead of `drop()` + recreate

When calling `crawler.run()` multiple times on the same crawler instance, v3 would drop the default request queue and create a fresh one between runs. In v4, the crawler **purges** the queue instead — clearing all requests and resetting internal counters, but keeping the same queue object. This is more efficient and avoids edge cases around stale references.

The new `purge()` method is available on `RequestQueue` and is also defined as an optional method on the `IRequestManager` interface.

By default, only queues that the crawler created itself (the "owned" queue) are purged between runs — a user-supplied queue is never touched unless you explicitly opt in. The `purgeRequestQueue` option in `CrawlerRunOptions` controls this behavior:

| `purgeRequestQueue` value | Owned queue (auto-created) | User-supplied queue |
|---|---|---|
| omitted (default) | Purged | Not purged |
| `true` | Purged | Purged |
| `false` | Not purged | Not purged |

```typescript
// The purge happens automatically between run() calls:
const crawler = new BasicCrawler({ requestHandler: async ({ request }) => { /* ... */ } });
await crawler.run(['https://example.com/a', 'https://example.com/b']);
// Queue is purged here, so the same URLs can be processed again:
await crawler.run(['https://example.com/a', 'https://example.com/c']);
```

You can opt out of the automatic purge by passing `purgeRequestQueue: false`:

```typescript
await crawler.run(urls, { purgeRequestQueue: false });
```

If you supplied your own `requestQueue` and want it purged between runs, pass `purgeRequestQueue: true` explicitly:

```typescript
const queue = await RequestQueue.open('my-queue');
const crawler = new BasicCrawler({ requestQueue: queue, requestHandler: async () => { /* ... */ } });
await crawler.run(['https://example.com/first']);
// Explicitly purge the user-supplied queue before the second run:
await crawler.run(['https://example.com/second'], { purgeRequestQueue: true });
```

## Storage `.open()` now also accepts `{ id?, name? }`

`Dataset.open()`, `KeyValueStore.open()`, and `RequestQueue.open()` previously accepted a single `idOrName?: string` parameter. This was ambiguous — callers couldn't express whether they were opening a storage by its ID or by name.

The first parameter now also accepts a `StorageIdentifier` object with separate `id` and `name` fields:

```ts
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

## Request loaders and managers

The request loader/manager interfaces have been reworked to mirror the abstractions in Crawlee for Python. See the new [Request loaders](../guides/request-loaders) guide for the full picture.

### `IRequestList` renamed to `IRequestLoader`

The `IRequestList` interface has been renamed to `IRequestLoader` and is now the read-only base interface implemented by `RequestList` and `SitemapRequestLoader`. The writable `IRequestManager` interface now **extends** `IRequestLoader` with the request-adding and reclaiming surface (`addRequest`, `addRequestsBatched`, `reclaimRequest`, optional `purge`). There is no `IRequestList` alias — update your imports and type references to `IRequestLoader` (or `IRequestManager` if you need the write surface).

### Loader interface surface changes

The harmonized loader interface differs from the old `IRequestList` in a few ways:

| Before (v3) | After (v4) |
|---|---|
| `length(): number` | `getTotalCount(): Promise<number>` (renamed and now async) |
| _(n/a)_ | `getPendingCount(): Promise<number>` (new) |
| `handledCount(): number` | `getHandledCount(): Promise<number>` (renamed and now async) |
| `markRequestHandled(request)` | `markRequestAsHandled(request)` (renamed) |
| `reclaimRequest()` on the interface | Removed from the read-only loaders entirely; reclaiming is a write operation that lives only on `IRequestManager` (e.g. `RequestQueue`, `RequestManagerTandem`) |
| `inProgress: Set<string>` on the interface | Removed from the interface |
| `persistState(): Promise<void>` (required) | `persistState?(): Promise<void>` (optional) |
| _(n/a)_ | `toTandem?(requestManager?)` (new) |

`RequestList.length()` and `RequestList.handledCount()` (and their `SitemapRequestLoader` counterparts) were renamed to `getTotalCount()` and `getHandledCount()` and are now `async` — `await` them.

`markRequestHandled()` was renamed to `markRequestAsHandled()` across the loader and manager interfaces (`RequestList`, `SitemapRequestLoader`, `RequestQueue`, `RequestManagerTandem`) to match the storage client method of the same name (and the Python `mark_request_as_handled`). Rename any calls accordingly.

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

### Combining a list and a queue: `toTandem()`

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

### `SitemapRequestList` renamed to `SitemapRequestLoader`

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

### Crawler `requestList` / `requestQueue` options deprecated in favor of `requestManager`

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

### `BasicCrawler.requestList` and `BasicCrawler.requestQueue` fields removed

The public `requestList` and `requestQueue` instance fields are gone. The crawler exposes a single `protected requestManager?: IRequestManager` instead. Access the active manager via the new async `getRequestManager()` method.

### `getRequestQueue()` deprecated in favor of `getRequestManager()`

`BasicCrawler.getRequestQueue()` is deprecated. It still works as an alias, but now returns an `IRequestManager` that is no longer guaranteed to be a `RequestQueue` (it may be a `RequestManagerTandem`). Use `getRequestManager()` instead.

**Before:**
```typescript
const queue = await crawler.getRequestQueue();
```

**After:**
```typescript
const manager = await crawler.getRequestManager();
```

### `enqueueLinks` `requestQueue` option renamed to `requestManager`

The standalone `enqueueLinks()` function and the click-elements enqueue helpers (`enqueueLinksByClickingElements` in `@crawlee/puppeteer` and `@crawlee/playwright`) now take a `requestManager` option instead of `requestQueue`:

**Before:**
```typescript
await enqueueLinks({ urls, requestQueue });
```

**After:**
```typescript
await enqueueLinks({ urls, requestManager });
```

## `transformRequestFunction` precedence in `enqueueLinks`

The `transformRequestFunction` callback in `enqueueLinks` now runs **after** URL pattern filtering (`globs`, `regexps`, `pseudoUrls`) instead of before. This means it has the highest priority and can overwrite any request options set by patterns or the global `label` option.

The priority order is now (lowest to highest):
1. Global `label` / `userData` options
2. Pattern-specific options from `globs`, `regexps`, or `pseudoUrls` objects
3. `transformRequestFunction`

The `transformRequestFunction` callback receives a `RequestOptions` object and can return either:
- The modified `RequestOptions` object
- A new `RequestOptions` plain object
- `'unchanged'` to keep the original options as-is
- A falsy value or `'skip'` to exclude the request from the queue

## Puppeteer cookies are now read and written at the browser-context level

The `PuppeteerController._getCookies` / `_setCookies` methods (used internally by the session pool to sync cookies between a `Session` and a Puppeteer page) now call `page.browserContext().cookies()` / `setCookie()` instead of the deprecated `page.cookies()` / `page.setCookie()`. The page-level API was removed in newer Puppeteer releases.

This aligns the Puppeteer controller with the Playwright controller, which has always worked at the context level.

**What changes in practice**
- Cookie reads return every cookie stored in the page's browser context, not just cookies matching the page's current URL. If your `Session` relied on the URL-scoped filtering (for example, to avoid pulling cookies that belong to other tabs in the same context), you'll now see the full set.
- Cookie writes are applied to the whole browser context. When you launch pages with shared contexts, cookies written via `Session.setCookiesFromResponse` or similar will be visible to every other page in that context.

If you rely on Crawlee's default configuration (one browser context per session, which is the `useIncognitoPages` / `newContextPerSession` behavior used by `PuppeteerCrawler`), you should not notice any difference — each session already owns its own context.

**Cookie `url` field** — the old `page.setCookie()` auto-filled a missing `url` on each cookie with the page's current URL. The new `browserContext().setCookie()` does not; Chromium rejects cookies that carry neither `url` nor `domain`. Crawlee's internal `_setCookies` keeps the old behavior by back-filling `page.url()` for any cookie that has neither field set, but if you call `browserContext().setCookie()` directly (outside of Crawlee) you need to provide one of them yourself.
