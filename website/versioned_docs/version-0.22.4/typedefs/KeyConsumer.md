---
id: version-0.22.4-key-consumer
title: KeyConsumer
original_id: key-consumer
---

<a name="keyconsumer"></a>

User-function used in the [`KeyValueStore.forEachKey()`](../api/key-value-store#foreachkey) method.

**Parameters**:

-   **`key`**: `string` - Current {KeyValue} key being processed.
-   **`index`**: `number` - Position of the current key in [`KeyValueStore`](../api/key-value-store).
-   **`info`**: `object` - Information about the current [`KeyValueStore`](../api/key-value-store) entry.
    -   **`size`**: `number` - Size of the value associated with the current key in bytes.

---
