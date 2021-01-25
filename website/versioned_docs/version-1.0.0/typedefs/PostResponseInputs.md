---
id: version-1.0.0-post-response-inputs
title: PostResponseInputs
original_id: post-response-inputs
---

<a name="postresponseinputs"></a>

## Properties

### `response`

**Type**: `IncomingMessage` | `Readable`

stream

---

### `request`

**Type**: [`Request`](../api/request)

Original instance fo the {Request} object. Must be modified in-place.

---

### `session`

**Type**: [`Session`](../api/session)

The current session

---

### `proxyInfo`

**Type**: [`ProxyInfo`](../typedefs/proxy-info)

An object with information about currently used proxy by the crawler and configured by the [`ProxyConfiguration`](../api/proxy-configuration) class.

---

### `crawler`

**Type**: [`CheerioCrawler`](../api/cheerio-crawler)

---
