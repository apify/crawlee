---
id: request-loaders
title: 'Upgrading to v4: request loaders and managers'
sidebar_label: Request loaders and managers
sidebar_position: 6
slug: /upgrading/upgrading-to-v4/request-loaders
---

Applies when you use `RequestList` or `SitemapRequestList`, pass `requestList` / `requestQueue` to a crawler, or implement the request loader and manager interfaces yourself. This page is part of the [Upgrading to v4](./upgrading-v4.md) guide.

## Request loaders and managers

The request loader/manager interfaces have been reworked. See the new [Request loaders](../../guides/request-loaders.mdx) guide for the full picture.

### `RequestQueue.addRequestsBatched` no longer retries rejected requests

Requests that the storage backend reports as unprocessed are now warned about and skipped after the first attempt, instead of being retried a bounded number of times. What a backend reports as unprocessed is a semantic rejection (typically malformed request data) that re-sending cannot fix — retrying transient failures is the storage backend's own responsibility.

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
| `isEmpty(): Promise<boolean>` and `isFinished(): Promise<boolean>` | `checkReadiness(): Promise<RequestSourceStatus>` ([details](#isempty--isfinished-replaced-by-checkreadiness)) |
| `reclaimRequest()` on the interface | Removed from the read-only loaders entirely; reclaiming is a write operation that lives only on `IRequestManager` (e.g. `RequestQueue`, `RequestManagerTandem`) |
| `inProgress: Set<string>` on the interface | Removed from the interface |
| `persistState(): Promise<void>` (required) | Removed from the interface; loaders that have state persist it themselves on the `persistState` event, and `RequestList`/`SitemapRequestLoader` still expose the method as a class member |
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

### `IRequestManager` gained `recordPacingSignal()`

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

### `isEmpty()` / `isFinished()` replaced by `checkReadiness()`

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

**Storage backends keep the two booleans** — see [`StorageBackend` interface simplified](./storage-backends.md#storagebackend-interface-simplified).

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

### HTTP 429 can now back off per domain instead of retiring the session

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

It is also what enforces robots.txt `Crawl-delay` directives — with `respectRobotsTxtFile` enabled and no throttling manager covering the domain, the directive is ignored and the crawler warns about it. See the [request loaders guide](../../guides/request-loaders.mdx#per-domain-throttling).

### `BasicCrawler.requestList` and `BasicCrawler.requestQueue` fields removed

The public `requestList` and `requestQueue` instance fields are gone. The crawler exposes a single read-only `protected requestManager` getter instead. Access the active manager via the new async `getRequestManager()` method.

### `BasicCrawler.requestManager` is read-only

`requestManager` is now a getter over a native `#requestManager` field, so a subclass can read it but can no longer assign to it. The crawler owns the manager's lifecycle — it resolves the `requestManager` / `requestList` / `requestQueue` options, opens a default queue when none was given, and wraps the result in a `ThrottlingRequestManager` when `sameDomainDelaySecs` is set — and assigning over it from a subclass skipped those steps.

Inject your own manager through the constructor option instead, and read the resolved one with `getRequestManager()`:

**Before:**
```typescript
class MyCrawler extends BasicCrawler {
    protected override async init() {
        await super.init();
        this.requestManager = await MyRequestQueue.open();
    }
}
```

**After:**
```typescript
const crawler = new MyCrawler({ requestManager: await MyRequestQueue.open() });
```

Being a native `#` field, it is also no longer visible to `Object.keys()`, object spread or `JSON.stringify()`.

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

### Removed `UrlList` type alias

`UrlList` is gone; the signatures that used it now spell the type out inline (`(string | null)[]`). No behavioral change — replace the alias with the expansion if you referenced it.
