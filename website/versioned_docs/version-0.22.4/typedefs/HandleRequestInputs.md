---
id: version-0.22.4-handle-request-inputs
title: HandleRequestInputs
original_id: handle-request-inputs
---

<a name="handlerequestinputs"></a>

## Properties

### `request`

**Type**: [`Request`](../api/request)

The original {Request} object.

---

### `autoscaledPool`

**Type**: [`AutoscaledPool`](../api/autoscaled-pool)

A reference to the underlying [`AutoscaledPool`](../api/autoscaled-pool) class that manages the concurrency of the crawler. Note that this property is
only initialized after calling the [`BasicCrawler.run()`](../api/basic-crawler#run) function. You can use it to change the concurrency settings on the
fly, to pause the crawler by calling [`AutoscaledPool.pause()`](../api/autoscaled-pool#pause) or to abort it by calling
[`AutoscaledPool.abort()`](../api/autoscaled-pool#abort).

---

### `session`

**Type**: [`Session`](../api/session)

---
