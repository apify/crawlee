---
id: handle-request-inputs
title: HandleRequestInputs
---

<a name="handlerequestinputs"></a>

## Properties

### `request`

**Type**: [`Request`](/docs/api/request)

The original {Request} object.

---

### `autoscaledPool`

**Type**: [`AutoscaledPool`](/docs/api/autoscaled-pool)

A reference to the underlying [`AutoscaledPool`](/docs/api/autoscaled-pool) class that manages the concurrency of the crawler. Note that this property
is only initialized after calling the [`BasicCrawler.run()`](/docs/api/basic-crawler#run) function. You can use it to change the concurrency settings
on the fly, to pause the crawler by calling [`AutoscaledPool.pause()`](/docs/api/autoscaled-pool#pause) or to abort it by calling
[`AutoscaledPool.abort()`](/docs/api/autoscaled-pool#abort).

---

### `session`

**Type**: [`Session`](/docs/api/session)

---
