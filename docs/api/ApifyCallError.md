---
id: apify-call-error
title: ApifyCallError
---

<a name="apifycallerror"></a>

The class represents exceptions thrown by the [`Apify.call()`](/docs/api/apify#call) function.

## Properties

### `message`

**Type**: `string`

Error message

---

### `run`

**Type**: [`ActorRun`](/docs/typedefs/actor-run)

Object representing the failed actor run.

---

### `name`

**Type**: `string`

Contains `"ApifyCallError"`

---

<a name="exports.apifycallerror"></a>

## `new ApifyCallError(run, [message])`

**Params**

-   **`run`**: [`ActorRun`](/docs/typedefs/actor-run)
-   **`[message]`**: `string` <code> = &quot;The actor invoked by Apify.call() did not succeed&quot;</code>

---
