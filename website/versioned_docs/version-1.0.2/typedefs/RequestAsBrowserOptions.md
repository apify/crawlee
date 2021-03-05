---
id: version-1.0.2-request-as-browser-options
title: RequestAsBrowserOptions
original_id: request-as-browser-options
---

<a name="requestasbrowseroptions"></a>

## Properties

### `url`

**Type**: `string`

URL of the target endpoint. Supports both HTTP and HTTPS schemes.

---

### `method`

**Type**: `string` <code> = &quot;\&quot;GET\&quot;&quot;</code>

HTTP method.

---

### `headers`

**Type**: `Object<string, string>`

Additional HTTP headers to add. It's only recommended to use this option, with headers that are typically added by websites, such as cookies.
Overriding default browser headers will remove the masking this function provides.

---

### `proxyUrl`

**Type**: `string`

An HTTP proxy to be passed down to the HTTP request. Supports proxy authentication with Basic Auth.

---

### `languageCode`

**Type**: `string` <code> = &quot;en&quot;</code>

Two-letter ISO 639 language code.

---

### `countryCode`

**Type**: `string` <code> = &quot;US&quot;</code>

Two-letter ISO 3166 country code.

---

### `useMobileVersion`

**Type**: `boolean`

If `true`, the function uses User-Agent of a mobile browser.

---

### `ignoreSslErrors`

**Type**: `boolean` <code> = true</code>

If set to true, SSL/TLS certificate errors will be ignored.

---

### `useInsecureHttpParser`

**Type**: `boolean` <code> = true</code>

Node.js' HTTP parser is stricter than parsers used by web browsers, which prevents scraping of websites whose servers do not comply with HTTP specs,
either by accident or due to some anti-scraping protections, causing e.g. the `invalid header value char` error. The `useInsecureHttpParser` option
forces the HTTP parser to ignore certain errors which lets you scrape such websites. However, it will also open your application to some security
vulnerabilities, although the risk should be negligible as these vulnerabilities mainly relate to server applications, not clients. Learn more in this
[blog post](https://snyk.io/blog/node-js-release-fixes-a-critical-http-security-vulnerability/).

---

### `abortFunction`

**Type**: [`AbortFunction`](../typedefs/abort-function)

Function accepts `response` object as a single parameter and should return true or false. If function returns true request gets aborted. This function
is passed to the [@apify/http-request](https://www.npmjs.com/package/@apify/http-request) NPM package.

---

### `useHttp2`

**Type**: `boolean` <code> = false</code>

If set to true, it will additionally accept HTTP2 requests. It will choose either HTTP/1.1 or HTTP/2 depending on the ALPN protocol.

---
