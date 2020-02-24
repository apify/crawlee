---
id: key-consumer
title: KeyConsumer
---

<a name="keyconsumer"></a>

User-function used in the [`KeyValueStore.forEachKey()`](/docs/api/key-value-store#foreachkey) method.

**Params**

-   **`key`**: `String` - Current {KeyValue} key being processed.
-   **`index`**: `Number` - Position of the current key in {KeyValuestore}.
-   **`info`**: `Object` - Information about the current {KeyValueStore} entry.
    -   **`.size`**: `Number` - Size of the value associated with the current key in bytes.

---
