---
id: version-2.3.0-cheerio-handle-page-inputs
title: CheerioHandlePageInputs
original_id: cheerio-handle-page-inputs
---

<a name="cheeriohandlepageinputs"></a>

## Properties

### `$`

**Type**: `CheerioAPI`

The [Cheerio](https://cheerio.js.org/) object with parsed HTML.

---

### `body`

**Type**: `string` | `Buffer`

The request body of the web page.

---

### `json`

**Type**: `*`

The parsed object from JSON string if the response contains the content type application/json.

---

### `request`

**Type**: [`Request`](../api/request)

The original [`Request`](../api/request) object.

---

### `contentType`

**Type**: `Object`

Parsed `Content-Type header: { type, encoding }`.

---

### `response`

**Type**: `IncomingMessage`

An instance of Node's [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage) object,

---

### `session`

**Type**: [`Session`](../api/session)

---

### `proxyInfo`

**Type**: [`ProxyInfo`](../typedefs/proxy-info)

An object with information about currently used proxy by the crawler and configured by the [`ProxyConfiguration`](../api/proxy-configuration) class.

---

### `crawler`

**Type**: [`CheerioCrawler`](../api/cheerio-crawler)

---
