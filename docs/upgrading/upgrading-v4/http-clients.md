---
id: http-clients
title: 'Upgrading to v4: HTTP clients'
sidebar_label: HTTP clients
sidebar_position: 5
slug: /upgrading/upgrading-to-v4/http-clients
---

Applies when you implemented `BaseHttpClient` yourself, or imported `gotScraping` from `@crawlee/utils`. This page is part of the [Upgrading to v4](./upgrading-v4.md) guide.

## HTTP client packages and `BaseHttpClient` reshaped

The HTTP client abstraction moved out of `@crawlee/core` into two new packages, and its shape changed to match the native `fetch` model.

- **`@crawlee/http-client`** (new) now owns the `BaseHttpClient` abstract base class, along with `FetchHttpClient`, `ResponseWithUrl`, and `CustomFetchOptions`.
- **`@crawlee/got-scraping-client`** (new) provides `GotScrapingHttpClient` — the `got-scraping`-backed client — as an opt-in dependency, so `got-scraping` is no longer pulled into every install.

`BaseHttpClient` was redesigned around `fetch`. In v3 it declared `sendRequest<TResponseType>(request): Promise<HttpResponse>` and `stream(request): Promise<StreamingHttpResponse>`; in v4 subclasses implement a single `protected abstract fetch(input: Request, init?): Promise<Response>` and the base class provides `sendRequest(request, options?): Promise<Response>`. There is no `stream()` method anymore — a `Response` already exposes `body` as a stream. The following symbols that were part of the old `@crawlee/core` HTTP surface are **removed**: `HttpResponse`, `StreamingHttpResponse`, `ResponseTypes` and `BaseHttpResponseData`. `processHttpRequestOptions` is no longer public either; it remains reachable from `@crawlee/utils/internal` without semver guarantees.

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

### Removed `@crawlee/types` HTTP types

The `RedirectHandler` type (exported from `@crawlee/core` in v3) has been removed. It was the redirect-callback type for `BaseHttpClient.stream()`, which no longer exists in v4 — a custom HTTP client now only implements `fetch()`, as shown above. If you referenced it, delete the reference; there is no replacement.

The `BrowserLikeResponse` interface has been removed. It was a v3-era shim for reading `url()` and `headers()` off a got-style response during cookie handling, and has had no consumer since HTTP responses became standard `Response` objects. Read `response.url` and `response.headers` directly instead.

### Removed `HttpRequest` properties

The following properties have been removed from `HttpRequest`, as v4's HTTP client contract is `fetch`-shaped and read none of them:

- `headerGenerator`, `headerGeneratorOptions`, `useHeaderGenerator` — header and fingerprint generation is now the HTTP client implementation's concern. `ImpitHttpClient` derives headers from the session fingerprint automatically; configure it through the client's own constructor options.
- `sessionToken` — fingerprint stability is now keyed off the `Session` passed via `SendRequestOptions.session`.
- `insecureHTTPParser` — no longer supported; there is no equivalent in the `fetch`-based clients.
- `throwHttpErrors` — `sendRequest` never throws on an HTTP error status; inspect `response.status` yourself. The crawler's `additionalHttpErrorStatusCodes` / `ignoreHttpErrorStatusCodes` options only cover the crawled request itself.
- `responseType` (and the `HttpRequest<TResponseType>` type parameter) — read the body from the returned `Response` with `response.json()` / `response.text()` / `response.bytes()`.
- `maxRedirects` — redirect following is handled inside `BaseHttpClient.sendRequest` and capped at 10 redirects; it is no longer configurable per request.
- `encoding` — a `Response` has no decoding option. Decode the bytes yourself, e.g. `new TextDecoder('latin1').decode(await response.arrayBuffer())`.

`followRedirect` now only accepts a boolean. With `followRedirect: false`, `sendRequest` returns the redirect response instead of following it; the predicate form is gone.

### Remaining `HttpRequest` properties changed type

`HttpRequest` and `HttpRequestOptions` (the first argument of `context.sendRequest()`) moved from `@crawlee/core` to `@crawlee/types`, and no longer accept arbitrary extra keys. The properties that stayed are no longer got-shaped:

| Property | v3 | v4 |
| --- | --- | --- |
| `headers` | plain object | a `Headers` instance — a plain object throws at runtime |
| `timeout` | got's object, e.g. `{ request: 5000 }` | a number of milliseconds |
| `body` | `string`, `Buffer`, `Readable`, generator or form data | `Readable` — wrap other values in `Readable.from()`, or use `json` / `form` |
| `cookieJar` | any got-compatible jar | a `tough-cookie` `CookieJar` |

**Before:**
```typescript
await sendRequest({
    url,
    headers: { accept: 'application/json' },
    timeout: { request: 5000 },
});
```

**After:**
```typescript
await sendRequest({
    url,
    headers: new Headers({ accept: 'application/json' }),
    timeout: 5000,
});
```

`followRedirect` and `encoding` are still declared, but nothing reads them: redirects are always followed, and the body is decoded when you call `response.text()` / `response.json()`.

### `gotScraping` is no longer exported from `@crawlee/utils`

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
