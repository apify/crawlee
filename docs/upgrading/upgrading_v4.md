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

## Service management moved from `Configuration` to `ServiceLocator`

The service management functionality has been extracted from `Configuration` into a new `ServiceLocator` class, following the pattern established in Crawlee for Python.

### Breaking changes

The following methods and properties have been removed from `Configuration`:

- `Configuration.getStorageClient()` - moved to `ServiceLocator.getStorageClient()`
- `Configuration.getEventManager()` - moved to `ServiceLocator.getEventManager()`
- `Configuration.useStorageClient()` - use `ServiceLocator.setStorageClient()` instead
- `Configuration.useEventManager()` - use `ServiceLocator.setEventManager()` instead
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
import { BasicCrawler, Configuration, LocalEventManager } from 'crawlee';
import { MemoryStorage } from '@crawlee/memory-storage';

const crawler = new BasicCrawler({
    requestHandler: async ({ request, log }) => {
        log.info(`Processing ${request.url}`);
    },
    configuration: new Configuration({ headless: false }),
    storageClient: new MemoryStorage(),
    eventManager: LocalEventManager.fromConfig(),
});

await crawler.run(['https://example.com']);
```

### Using the global service locator

For most use cases, the global `serviceLocator` singleton works well:

```typescript
import { serviceLocator, BasicCrawler } from 'crawlee';
import { MemoryStorage } from '@crawlee/memory-storage';

// Configure global services (optional)
serviceLocator.setStorageClient(new MemoryStorage());

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

The `get()` method on `DatasetClient`, `KeyValueStoreClient`, and `RequestQueueClient` has been renamed to **`getMetadata()`**.

The high-level storage classes (`Dataset`, `KeyValueStore`, `RequestQueue`) now receive their sub-client directly in the constructor options instead of receiving a `StorageClient` and calling its methods.

### Removed `list()` method

The `list()` method on collection clients (e.g. `client.datasets().list()`) has no replacement. If you were using it to enumerate all storages, you will need to use the Apify API client directly.

### Migration guide

If you implemented a custom `StorageClient`, you need to:

1. Remove your `*CollectionClient` classes.
2. Replace the six getter methods (`dataset`, `datasets`, `keyValueStore`, `keyValueStores`, `requestQueue`, `requestQueues`) with three async factory methods (`createDatasetClient`, `createKeyValueStoreClient`, `createRequestQueueClient`). Each factory should handle both opening an existing storage and creating a new one.
3. Rename `get()` to `getMetadata()` on your `DatasetClient`, `KeyValueStoreClient`, and `RequestQueueClient` implementations.

## Storage `.open()` now takes `{ id?, name? }` instead of a string

`Dataset.open()`, `KeyValueStore.open()`, and `RequestQueue.open()` previously accepted a single `idOrName?: string` parameter. This was ambiguous — callers couldn't express whether they were opening a storage by its ID or by name.

The first parameter is now a `StorageIdentifier` object with separate `id` and `name` fields:

```ts
interface StorageIdentifier {
    id?: string;
    name?: string;
}
```

**Before:**
```typescript
const dataset = await Dataset.open('my-dataset');
const store = await KeyValueStore.open('my-store');
const queue = await RequestQueue.open('my-queue');
```

**After:**
```typescript
const dataset = await Dataset.open({ name: 'my-dataset' });
const store = await KeyValueStore.open({ name: 'my-store' });
const queue = await RequestQueue.open({ name: 'my-queue' });

// Opening by ID (e.g. on the Apify platform):
const dataset = await Dataset.open({ id: 'WkzbQMuFYuamGv3YF' });
```

Opening the default storage (no arguments or `null`) still works as before:

```typescript
const dataset = await Dataset.open();
```

The same change applies to `CrawlingContext.getKeyValueStore()` and `CrawlingContext.pushData()` — both now accept `StorageIdentifier` instead of a plain string for identifying the target storage.

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
