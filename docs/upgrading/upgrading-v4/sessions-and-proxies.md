---
id: sessions-and-proxies
title: 'Upgrading to v4: sessions and proxies'
sidebar_label: Sessions and proxies
sidebar_position: 2
slug: /upgrading/upgrading-to-v4/sessions-and-proxies
---

Applies when you construct `SessionPool` or `Session` instances directly, implement your own pool, or configure proxies beyond a static URL list. This page is part of the [Upgrading to v4](./upgrading-v4.md) guide.

## Custom `SessionPool` implementations via the `ISessionPool` interface

Crawlers now accept any object implementing the new `ISessionPool` interface as their `sessionPool` option, not just instances of the built-in `SessionPool`. The contract is intentionally tiny — a single method, `getSession(sessionId?)`, that hands out a session for a request. Lifecycle (reset, teardown) is the responsibility of whoever owns the pool: a custom pool you construct yourself is never owned by the crawler, so the crawler never tears it down. This makes it straightforward to plug in a remote, shared, or otherwise customized session-management strategy without subclassing `SessionPool` or copying its internals.

`ISessionPool` and `ISession` live in `@crawlee/types`; they are not re-exported from `@crawlee/core` (see [`@crawlee/types` symbols are no longer re-exported](./utils-and-types.md#crawleetypes-symbols-are-no-longer-re-exported)).

```typescript
import { BasicCrawler, Session } from '@crawlee/basic';
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

The crawler depends only on the `ISession` interface — `id`, `cookieJar`, `proxyInfo`, `fingerprint`, and the `isUsable()` / `isBlocked()` / `markGood()` / `markBad()` / `retire()` methods — so a custom pool may hand out its own session implementation instead of instances of the built-in `Session` class. `Session` implements `ISession`, so returning `Session` instances (as above) is the shortest path; `crawlingContext.session` is typed as `ISession` either way.

Returning `undefined` means the pool has no usable session for the request. The crawler turns that into a `MissingSessionError` and retries the request like any other failure.

The `crawler.sessionPool` property is now **read-only** (a getter). It was previously a writable field, so any code that reassigned it after construction (`crawler.sessionPool = myPool`) no longer works — pass your pool via the `sessionPool` constructor option instead.

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

## `tieredProxyUrls` is removed from `ProxyConfiguration`

The `tieredProxyUrls` option has been removed, together with the `proxyTier` field on `ProxyInfo` and the `proxyTier` plumbing in `BrowserPool`. In v4 the `Session` is the main rotation unit — a session already carries its own proxy, cookies and error score, so the pool rotates the whole fingerprint when a session gets retired on a block.

If you used tiers to escalate from a cheap proxy pool to a pricier one on blocks, you can achieve the same behavior by pre-populating a `SessionPool` with named sessions — one per proxy tier — and flipping `request.sessionId` in an `errorHandler` to reassign the retry to the next tier. Do not pass `proxyConfiguration` to the crawler: whenever a `sessionPool` is supplied, the crawler ignores `proxyConfiguration` with a warning and every pooled session keeps the `proxyInfo` it was created with. Configure proxies on the pool instead, through `addSession({ proxyInfo })` or a custom `createSessionFunction`.

```typescript
import { BasicCrawler, SessionPool } from '@crawlee/basic';

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

### `ProxyConfiguration.newUrl` / `newProxyInfo` signatures changed

Because proxy tiers are gone, the leading `sessionId` positional argument was dropped from `ProxyConfiguration.newUrl()` and `ProxyConfiguration.newProxyInfo()`. `newUrl()` now takes no arguments, and `newProxyInfo()` takes only an optional, previously created `ProxyInfo` (e.g. one restored with a persisted session) instead of `(sessionId?, options?)`. Custom `IProxyConfiguration` implementations should return that `ProxyInfo` (refreshed if it depends on the environment) rather than a new one, otherwise the crawler replaces the session's proxy. The `ProxyConfigurationFunction` callback (the `newUrlFunction` option) was likewise simplified — it no longer receives any arguments, neither a `sessionId` nor a `{ request }` object. The proxy is resolved once per session, so to route specific requests through specific proxies, pin them to named sessions (see [Pinning a request to a specific session](../../guides/session-management.mdx#pinning-a-request-to-a-specific-session)). The `TieredProxy` interface and the `TieredProxyOptions` type have been removed.

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
    newUrlFunction: () => pickProxy(),
});
const url = await proxyConfiguration.newUrl();
```
