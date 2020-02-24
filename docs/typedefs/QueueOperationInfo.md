---
id: queue-operation-info
title: QueueOperationInfo
---

<a name="queueoperationinfo"></a>

A helper class that is used to report results from various [`RequestQueue`](/docs/api/request-queue) functions as well as
[`utils.enqueueLinks()`](/docs/api/utils#enqueuelinks).

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

**Type**: [`Request`](/docs/api/request)

The original [`Request`](/docs/api/request) object passed to the `RequestQueue` function.

---
