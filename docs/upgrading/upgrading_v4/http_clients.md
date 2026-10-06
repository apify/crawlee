---
id: http-clients
title: 'Upgrading to v4: HTTP clients'
sidebar_label: HTTP clients
sidebar_position: 5
slug: /upgrading/upgrading-to-v4/http-clients
---

Applies when you implemented `BaseHttpClient` yourself, or imported `gotScraping` from `@crawlee/utils`. This page is part of the [Upgrading to v4](./upgrading_v4.md) guide.

## HTTP client packages and `BaseHttpClient` reshaped

The HTTP client abstraction moved out of `@crawlee/core` into two new packages, and its shape changed to match the native `fetch` model.

- **`@crawlee/http-client`** (new) now owns the `BaseHttpClient` abstract base class, along with `FetchHttpClient`, `ResponseWithUrl`, and `CustomFetchOptions`.
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

### Removed `@crawlee/types` HTTP types

The `RedirectHandler` type has been removed. It was the redirect-callback type for `BaseHttpClient.stream()`, which no longer exists in v4 — a custom HTTP client now only implements `sendRequest(request: Request, options?: SendRequestOptions)`. If you referenced it, delete the reference; there is no replacement.

The `BrowserLikeResponse` interface has been removed. It was a v3-era shim for reading `url()` and `headers()` off a got-style response during cookie handling, and has had no consumer since HTTP responses became standard `Response` objects. Read `response.url` and `response.headers` directly instead.

### Removed `HttpRequest` properties

The following properties have been removed from `HttpRequest`, as v4's HTTP client contract is `fetch`-shaped and read none of them:

- `headerGenerator`, `headerGeneratorOptions`, `useHeaderGenerator` — header and fingerprint generation is now the HTTP client implementation's concern. `ImpitHttpClient` derives headers from the session fingerprint automatically; configure it through the client's own constructor options.
- `sessionToken` — fingerprint stability is now keyed off the `Session` passed via `SendRequestOptions.session`.
- `insecureHTTPParser` — no longer supported; there is no equivalent in the `fetch`-based clients.
- `throwHttpErrors` — use the crawler's `additionalHttpErrorStatusCodes` / `ignoreHttpErrorStatusCodes` options, or inspect `response.status` yourself.
- `maxRedirects` — redirect following is handled inside `BaseHttpClient.sendRequest` and capped at 10 redirects; it is no longer configurable per request.

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
