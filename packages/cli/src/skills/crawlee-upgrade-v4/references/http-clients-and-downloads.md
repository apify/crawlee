# HTTP clients and downloads

## Native responses

HTTP clients, `context.response` and `sendRequest()` return standard `Response` objects. Replace old `statusCode` reads with `status`, header indexing with `headers.get(name)`, and response-body reads with the appropriate async `text()`, `json()`, `arrayBuffer()` or body stream. Preserve the expected decoding and data type. A response body is consumable once; avoid reading it a second time if already consumed. Crawler-provided parsed `body` or `$` can still be the right source in a handler.

HTTP pre-navigation hooks lose the second `gotOptions` argument. Set request fields on context and configure the chosen client for client-specific options. `ignoreSslErrors` becomes `ignoreTlsErrors`; the fetch fallback cannot disable TLS verification and warns if requested.

## Client selection

The default HTTP client is `ImpitHttpClient` from optional `@crawlee/impit-client`. Without that package, the fetch fallback warns and provides neither proxies nor impersonation. Do not remove optional dependencies from installs when those capabilities are needed.

To keep got-scraping behavior, add `@crawlee/got-scraping-client` and pass `httpClient: new GotScrapingHttpClient()`. `gotScraping` is no longer exported by `@crawlee/utils`. For standalone one-off calls, depend on `got-scraping` directly.

Session fingerprints drive impit's impersonation and override the browser hint on the client. To force a browser family, set a compatible fingerprint when constructing sessions, preserving their merged session options.

## Custom clients

`BaseHttpClient`, `FetchHttpClient`, `ResponseWithUrl`, `IResponseWithUrl` and `CustomFetchOptions` live in `@crawlee/http-client`. A client extends `BaseHttpClient` and implements `protected fetch(input: Request, init?: RequestInit & CustomFetchOptions): Promise<Response>`. The base implements `sendRequest(request, options?)`; there is no `stream()` method. Return a real native Response, and read its `body` for streaming.

The old `HttpResponse`, `HttpResponseWithoutBody`, `StreamingHttpResponse`, `ResponseTypes`, `BaseHttpResponseData`, `SimpleHeaders` and `processHttpRequestOptions` are removed. HTTP-related types still owned by `@crawlee/types` must be imported there; do not assume every old core export moved to the client package.

Client options require actual `BaseHttpClient` instances. Replace duck-typed test doubles with subclasses. Pass logging through the constructor's `logger` option instead of accessing private `this.log`. Honor `ignoreTlsErrors` from fetch options if the implementation supports it.

## FileDownload

`FileDownload` extends `BasicCrawler` and takes `BasicCrawlerOptions<FileDownloadCrawlingContext>`. It no longer accepts HTTP-crawler options such as `navigationTimeoutSecs`, `additionalMimeTypes`, encoding overrides or got-style hooks. Configure its `httpClient` or request instead.

`FileDownloadOptions` and `StreamHandlerContext` are removed. The context loses `body` and `stream`; use `response` methods or `response.body`. `FileDownloadCrawlingContext` loses its extra type parameter. `streamHandler` is gone; perform streaming in `requestHandler`. When storing a stream inside a handler, read the storage reference for `withDirectStorageAccess()`.
