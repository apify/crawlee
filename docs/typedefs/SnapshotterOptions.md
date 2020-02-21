---
id: snapshotter-options
title: SnapshotterOptions
---

<a name="snapshotteroptions"></a>

## Properties

### `eventLoopSnapshotIntervalSecs`

**Type**: `Number` <code> = 0.5</code>

Defines the interval of measuring the event loop response time.

---

### `clientSnapshotIntervalSecs`

**Type**: `Number` <code> = 1</code>

Defines the interval of checking the current state of the remote API client.

---

### `maxBlockedMillis`

**Type**: `Number` <code> = 50</code>

Maximum allowed delay of the event loop in milliseconds. Exceeding this limit overloads the event loop.

---

### `cpuSnapshotIntervalSecs`

**Type**: `Number` <code> = 1</code>

Defines the interval of measuring CPU usage. This is only used when running locally. On the Apify platform, the statistics are provided externally at
a fixed interval.

---

### `maxUsedCpuRatio`

**Type**: `Number` <code> = 0.95</code>

Defines the maximum usage of CPU. Exceeding this limit overloads the CPU.

---

### `memorySnapshotIntervalSecs`

**Type**: `Number` <code> = 1</code>

Defines the interval of measuring memory consumption. This is only used when running locally. On the Apify platform, the statistics are provided
externally at a fixed interval. The measurement itself is resource intensive (25 - 50ms async). Therefore, setting this interval below 1 second is not
recommended.

---

### `maxUsedMemoryRatio`

**Type**: `Number` <code> = 0.7</code>

Defines the maximum ratio of total memory that can be used. Exceeding this limit overloads the memory.

---

### `maxClientErrors`

**Type**: `Number` <code> = 1</code>

Defines the maximum number of new rate limit errors within the given interval.

---

### `snapshotHistorySecs`

**Type**: `Number` <code> = 60</code>

Sets the interval in seconds for which a history of resource snapshots will be kept. Increasing this to very high numbers will affect performance.

---
