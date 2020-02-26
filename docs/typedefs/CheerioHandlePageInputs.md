---
id: cheerio-handle-page-inputs
title: CheerioHandlePageInputs
---

<a name="cheeriohandlepageinputs"></a>

## Properties

### `$`

**Type**: `CheerioSelector`

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

**Type**: [`Request`](/docs/api/request)

The original [`Request`](/docs/api/request) object.

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

**Type**: [`AutoscaledPool`](/docs/api/autoscaled-pool)

A reference to the underlying [`AutoscaledPool`](/docs/api/autoscaled-pool) class that manages the concurrency of the crawler. Note that this property
is only initialized after calling the [`CheerioCrawler.run()`](/docs/api/cheerio-crawler#run) function. You can use it to change the concurrency
settings on the fly, to pause the crawler by calling [`AutoscaledPool.pause()`](/docs/api/autoscaled-pool#pause) or to abort it by calling
[`AutoscaledPool.abort()`](/docs/api/autoscaled-pool#abort).

---

### `session`

**Type**: [`Session`](/docs/api/session)

---
