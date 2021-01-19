---
id: version-0.22.4-post-response-inputs
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

### `autoscaledPool`

**Type**: [`AutoscaledPool`](../api/autoscaled-pool)

---

### `session`

**Type**: [`Session`](../api/session)

The current session

---

### `proxyInfo`

**Type**: [`ProxyInfo`](../typedefs/proxy-info)

An object with information about currently used proxy by the crawler and configured by the [`ProxyConfiguration`](../api/proxy-configuration) class.

---
