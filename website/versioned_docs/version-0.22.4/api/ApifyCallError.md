---
id: version-0.22.4-apify-call-error
title: ApifyCallError
original_id: apify-call-error
---

<a name="apifycallerror"></a>

The class represents exceptions thrown by the [`Apify.call()`](../api/apify#call) function.

## Properties

### `message`

**Type**: `string`

Error message

---

### `run`

**Type**: [`ActorRun`](../typedefs/actor-run)

Object representing the failed actor run.

---

### `name`

**Type**: `string`

Contains `"ApifyCallError"`

---

<a name="exports.apifycallerror"></a>

## `new ApifyCallError(run, [message])`

**Parameters**:

-   **`run`**: [`ActorRun`](../typedefs/actor-run)
-   **`[message]`**: `string` <code> = &quot;The actor invoked by Apify.call() did not succeed&quot;</code>

---
