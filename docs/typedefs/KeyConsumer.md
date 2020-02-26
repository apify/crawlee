---
id: key-consumer
title: KeyConsumer
---

<a name="keyconsumer"></a>

User-function used in the [`KeyValueStore.forEachKey()`](/docs/api/key-value-store#foreachkey) method.

**Params**

-   **`key`**: `string` - Current {KeyValue} key being processed.
-   **`index`**: `number` - Position of the current key in {KeyValuestore}.
-   **`info`**: `object` - Information about the current {KeyValueStore} entry.
    -   **`.size`**: `number` - Size of the value associated with the current key in bytes.

---
