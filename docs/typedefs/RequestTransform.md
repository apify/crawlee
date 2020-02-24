---
id: request-transform
title: RequestTransform
---

<a name="requesttransform"></a>

**Returns**: [`RequestOptions`](/docs/typedefs/request-options) - The modified request options to enqueue.

Takes an Apify {RequestOptions} object and changes it's attributes in a desired way. This user-function is used
[`utils.enqueueLinks()`](/docs/api/utils#enqueuelinks) to modify requests before enqueuing them.

**Params**

-   **`original`**: [`RequestOptions`](/docs/typedefs/request-options) - Request options to be modified.

---
