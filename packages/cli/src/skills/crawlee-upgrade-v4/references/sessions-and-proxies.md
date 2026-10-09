# Sessions and proxies

`useSessionPool` and `sessionPoolOptions` are removed. All crawlers use sessions by default. Build a pool when customizing it, and move session-specific options into `sessionOptions`:

```ts
const sessionPool = new SessionPool({ maxPoolSize: 100, sessionOptions: { maxUsageCount: 5 } });
const crawler = new CheerioCrawler({ sessionPool, requestHandler });
```

Supplied pools are caller-owned: call `sessionPool.teardown()` in `finally` after use.

Replace `SessionPool.open()` with the lazy-initializing constructor. `usableSessionsCount` and `retiredSessionsCount` become async methods. The `crawler.sessionPool` getter is read-only.

`persistState()`, `resetStore()` and `teardown()` lose their persistence-option arguments. `resetStore()` throws while the pool is running; tear it down first. `reset()` discards in-memory sessions instead. The built-in persisted session-state shape remains compatible, but internal keys now use `CRAWLEE_` instead of `SDK_`.

## Session creation and retries

`createSessionFunction` loses its leading pool argument. Its new signature is `(options?: { sessionOptions?: SessionOptions }) => Session | Promise<Session>`. Pool defaults and per-call overrides are already merged into `options.sessionOptions`.

`Session` loses its `sessionPool` option and back-reference. The pool is no longer an EventEmitter, and `EVENT_SESSION_RETIRED` is removed. Move necessary retirement cleanup to a handler or context-pipeline cleanup hook. Retirement is terminal; `markGood()` cannot make a retired session usable again.

`Session.retireOnBlockedStatusCodes` is removed. Put `blockedStatusCodes` on the crawler. Remove `maxSessionRotations` and `request.sessionRotationCount`. `SessionError` retires the session and counts toward `maxRequestRetries`, whose default is 3. It no longer extends `RetryRequestError`; catch it explicitly when needed.

Custom pools implement `ISessionPool.getSession(sessionId?)`. Their sessions implement `ISession`, both imported from `@crawlee/types`. Returning `undefined` causes `MissingSessionError` and a normal retry.

## Cookies

`persistCookiesPerSession` becomes `saveResponseCookies`, defaulting to true. Browser cookies are saved after the handler as well as before it. Check login flows and any assumption that handler-set cookies stay page-local.

HTTP cookie precedence is sendRequest overrides, request Cookie header, then the session jar. Explicit cookie names override matching jar entries. A custom `cookieJar` replaces the jar for a `sendRequest` call. `mergeCookies` warns and skips malformed fragments instead of throwing.

`Session.getCookies`, `setCookies` and `setCookiesFromResponse` are removed. Use `session.cookieJar` directly, such as `await session.cookieJar.setCookie('foo=bar', url)`, or the async `Session.getCookieString(url)` when working with a concrete built-in Session. Context sessions expose `ISession`; use its jar.

## Proxies

`tieredProxyUrls`, `ProxyInfo.proxyTier`, `TieredProxy` and `TieredProxyOptions` are removed. To preserve escalation, use named sessions carrying different `proxyInfo` values and change `request.sessionId` in an error handler. Avoid also assigning crawler proxy configuration when the session already owns its proxy.

`ProxyConfiguration.newUrl()` and `newUrlFunction` take no arguments. `newProxyInfo(proxyInfo?)` accepts only an existing `ProxyInfo`, such as one restored with a persisted session. Custom `IProxyConfiguration` implementations must preserve restored proxies, refreshing environment-dependent fields as needed. Proxy resolution is per session. Preserve request-specific or sticky routing with named sessions and `request.sessionId`; the old session-ID and `{ request }` callback arguments are gone.
