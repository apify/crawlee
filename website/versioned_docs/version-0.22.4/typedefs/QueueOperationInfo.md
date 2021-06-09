---
id: version-0.22.4-queue-operation-info
title: QueueOperationInfo
original_id: queue-operation-info
---

<a name="queueoperationinfo"></a>

A helper class that is used to report results from various [`RequestQueue`](../api/request-queue) functions as well as
[`utils.enqueueLinks()`](../api/utils#enqueuelinks).

## Properties

### `wasAlreadyPresent`

**Type**: `boolean`

Indicates if request was already present in the queue.

---

### `wasAlreadyHandled`

**Type**: `boolean`

Indicates if request was already marked as handled.

---

### `requestId`

**Type**: `string`

The ID of the added request

---

### `request`

**Type**: [`Request`](../api/request)

The original [`Request`](../api/request) object passed to the `RequestQueue` function.

---
