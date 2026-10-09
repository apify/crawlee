# HTTP clients and downloads

## Responses and request options

HTTP clients, `context.response` and `sendRequest()` return native `Response`. Replace `statusCode` with `status`, header indexing with `headers.get(name)`, and body access with async `text()`, `json()`, `arrayBuffer()` or `body`. Bodies are consumable once; use crawler-parsed `body` / `$` when already consumed.

HTTP hooks lose `gotOptions`; set context/request fields or configure the client. Rename `ignoreSslErrors` to `ignoreTlsErrors`. The fetch fallback cannot disable TLS verification.

Remove `HttpRequest.headerGenerator`, `headerGeneratorOptions`, `useHeaderGenerator` and `sessionToken`; configure fingerprinting through the client and `SendRequestOptions.session`. `insecureHTTPParser` has no replacement. Replace `throwHttpErrors` with crawler `additionalHttpErrorStatusCodes` / `ignoreHttpErrorStatusCodes` or status checks. `maxRedirects` is removed; the limit is 10.

## Client selection

The default is `ImpitHttpClient` from `@crawlee/impit-client`; without it, fetch provides no proxies or impersonation. To retain got-scraping behavior, install `@crawlee/got-scraping-client` and pass `httpClient: new GotScrapingHttpClient()`. Replace standalone `gotScraping` imports from utils with direct `got-scraping` imports.

Session fingerprints override impit's browser hint. Pin the session fingerprint to require a browser family, preserving merged session options.

## Custom clients

Import `BaseHttpClient`, `FetchHttpClient`, `ResponseWithUrl` and `CustomFetchOptions` from `@crawlee/http-client`. Extend `BaseHttpClient` and implement:

```ts
protected fetch(input: Request, init?: RequestInit & CustomFetchOptions): Promise<Response>
```

The base provides `sendRequest(request, options?)`; replace `stream()` with response-body streaming. Client options and mocks require actual instances. Pass a constructor `logger` instead of reading private `this.log`. Honor `ignoreTlsErrors` when supported.

Replace `HttpResponse`, `HttpResponseWithoutBody`, `StreamingHttpResponse`, `ResponseTypes`, `BaseHttpResponseData`, `SimpleHeaders`, `processHttpRequestOptions`, `RedirectHandler` and `BrowserLikeResponse` with the native response contract. Import remaining types owned by `@crawlee/types` directly.

## FileDownload

`FileDownload` extends `BasicCrawler` and takes `BasicCrawlerOptions<FileDownloadCrawlingContext>`. Remove HTTP-only options: `navigationTimeoutSecs`, `additionalMimeTypes`, encoding overrides and navigation hooks. Configure the client or request instead. `FileDownload` now verifies TLS certificates; keep the v3 behavior with `httpClient: new ImpitHttpClient({ ignoreTlsErrors: true })`.

Remove `FileDownloadOptions`, `StreamHandlerContext` and the extra `FileDownloadCrawlingContext` type parameter. Replace context `body` / `stream` with response methods / `response.body`; move `streamHandler` work into `requestHandler`. Replace `MinimumSpeedStream` / `ByteCounterStream` with your own transforms. Storing streams inside a handler requires `withDirectStorageAccess()`; see the storage reference.
