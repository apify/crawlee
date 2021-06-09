---
id: version-0.22.4-cheerio-handle-page-inputs
title: CheerioHandlePageInputs
original_id: cheerio-handle-page-inputs
---

<a name="cheeriohandlepageinputs"></a>

## Properties

### `$`

**Type**: `cheerio.Selector`

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

An instance of Node's http.IncomingMessage object,

---

### `autoscaledPool`

**Type**: [`AutoscaledPool`](../api/autoscaled-pool)

A reference to the underlying [`AutoscaledPool`](../api/autoscaled-pool) class that manages the concurrency of the crawler. Note that this property is
only initialized after calling the [`CheerioCrawler.run()`](../api/cheerio-crawler#run) function. You can use it to change the concurrency settings on
the fly, to pause the crawler by calling [`AutoscaledPool.pause()`](../api/autoscaled-pool#pause) or to abort it by calling
[`AutoscaledPool.abort()`](../api/autoscaled-pool#abort).

---

### `session`

**Type**: [`Session`](../api/session)

---

### `proxyInfo`

**Type**: [`ProxyInfo`](../typedefs/proxy-info)

An object with information about currently used proxy by the crawler and configured by the [`ProxyConfiguration`](../api/proxy-configuration) class.

---
