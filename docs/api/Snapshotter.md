---
id: snapshotter
title: Snapshotter
---

<a name="snapshotter"></a>

Creates snapshots of system resources at given intervals and marks the resource as either overloaded or not during the last interval. Keeps a history
of the snapshots. It tracks the following resources: Memory, EventLoop, API and CPU. The class is used by the
[`AutoscaledPool`](/docs/api/autoscaled-pool) class.

When running on the Apify platform, the CPU and memory statistics are provided by the platform, as collected from the running Docker container. When
running locally, `Snapshotter` makes its own statistics by querying the OS.

CPU becomes overloaded locally when its current use exceeds the `maxUsedCpuRatio` option or when Apify platform marks it as overloaded.

Memory becomes overloaded if its current use exceeds the `maxUsedMemoryRatio` option. It's computed using the total memory available to the container
when running on the Apify platform and a quarter of total system memory when running locally. Max total memory when running locally may be overridden
by using the `APIFY_MEMORY_MBYTES` environment variable.

Event loop becomes overloaded if it slows down by more than the `maxBlockedMillis` option.

Client becomes overloaded when rate limit errors (429 - Too Many Requests), typically received from the request queue, exceed the set limit within the
set interval.

---

<a name="snapshotter"></a>

## `new Snapshotter([options])`

**Params**

-   **`[options]`**: [`SnapshotterOptions`](/docs/typedefs/snapshotter-options) - All `Snapshotter` configuration options.

---

<a name="start"></a>

## `snapshotter.start()`

**Returns**: `Promise`

Starts capturing snapshots at configured intervals.

---

<a name="stop"></a>

## `snapshotter.stop()`

**Returns**: `Promise`

Stops all resource capturing.

---

<a name="getmemorysample"></a>

## `snapshotter.getMemorySample([sampleDurationMillis])`

**Returns**: `Array`

Returns a sample of latest memory snapshots, with the size of the sample defined by the sampleDurationMillis parameter. If omitted, it returns a full
snapshot history.

**Params**

-   **`[sampleDurationMillis]`**: `Number`

---

<a name="geteventloopsample"></a>

## `snapshotter.getEventLoopSample([sampleDurationMillis])`

**Returns**: `Array`

Returns a sample of latest event loop snapshots, with the size of the sample defined by the sampleDurationMillis parameter. If omitted, it returns a
full snapshot history.

**Params**

-   **`[sampleDurationMillis]`**: `Number`

---

<a name="getcpusample"></a>

## `snapshotter.getCpuSample([sampleDurationMillis])`

**Returns**: `Array`

Returns a sample of latest CPU snapshots, with the size of the sample defined by the sampleDurationMillis parameter. If omitted, it returns a full
snapshot history.

**Params**

-   **`[sampleDurationMillis]`**: `Number`

---

<a name="getclientsample"></a>

## `snapshotter.getClientSample(sampleDurationMillis)`

**Returns**: `Array`

Returns a sample of latest Client snapshots, with the size of the sample defined by the sampleDurationMillis parameter. If omitted, it returns a full
snapshot history.

**Params**

-   **`sampleDurationMillis`**: `Number`

---
