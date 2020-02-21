---
id: request-as-browser-options
title: RequestAsBrowserOptions
---

<a name="requestasbrowseroptions"></a>

## Properties

### `url`

**Type**: `String`

URL of the target endpoint. Supports both HTTP and HTTPS schemes.

---

### `method`

**Type**: `String` <code> = GET</code>

HTTP method.

---

### `headers`

**Type**: `Object`

Additional HTTP headers to add. It's only recommended to use this option, with headers that are typically added by websites, such as cookies.
Overriding default browser headers will remove the masking this function provides.

---

### `proxyUrl`

**Type**: `String`

An HTTP proxy to be passed down to the HTTP request. Supports proxy authentication with Basic Auth.

---

### `languageCode`

**Type**: `String` <code> = en</code>

Two-letter ISO 639 language code.

---

### `countryCode`

**Type**: `String` <code> = US</code>

Two-letter ISO 3166 country code.

---

### `useMobileVersion`

**Type**: `Boolean`

If `true`, the function uses User-Agent of a mobile browser.

---

### `abortFunction`

**Type**: `function`

Function accepts `response` object as a single parameter and should return true or false. If function returns true request gets aborted. This function
is passed to the (@apify/http-request)[https://www.npmjs.com/package/@apify/http-request] NPM package.

---

### `ignoreSslErrors`

**Type**: `boolean` <code> = true</code>

If set to true, SSL/TLS certificate errors will be ignored.

---

### `useInsecureHttpParser`

**Type**: `boolean` <code> = true</code>

Node.js HTTP parser is stricter than Browser parsers. This prevents fetching of some websites whose servers do not comply with HTTP specs or employ
anti-scraping protections due to various parse errors, typically `invalid header value char` error. This option forces the parser to ignore certain
errors which allows those websites to be scraped. However, it will also open your application to various security vulnerabilities.

---
