---
id: snapshotter
title: Snapshotter
---

<a name="Snapshotter"></a>

Creates snapshots of system resources at given intervals and marks the resource
as either overloaded or not during the last interval. Keeps a history of the snapshots.
It tracks the following resources: Memory, EventLoop, API and CPU.
The class is used by the [`AutoscaledPool`](autoscaledpool) class.

When running on the Apify platform, the CPU and memory statistics are provided by the platform,
as collected from the running Docker container. When running locally, `Snapshotter`
makes its own statistics by querying the OS.

CPU becomes overloaded locally when its current use exceeds the `maxUsedCpuRatio` option or
when Apify platform marks it as overloaded.

Memory becomes overloaded if its current use exceeds the `maxUsedMemoryRatio` option.
It's computed using the total memory available to the container when running on
the Apify platform and a quarter of total system memory when running locally.
Max total memory when running locally may be overridden by using the `APIFY_MEMORY_MBYTES`
environment variable.

Event loop becomes overloaded if it slows down by more than the `maxBlockedMillis` option.

Client becomes overloaded when rate limit errors (429 - Too Many Requests),
typically received from the request queue, exceed the set limit within the set interval.

-   [Snapshotter](snapshotter)
    -   [`new Snapshotter([options])`](#new_Snapshotter_new)
    -   [`.start()`](#Snapshotter+start) ⇒ `Promise`
    -   [`.stop()`](#Snapshotter+stop) ⇒ `Promise`
    -   [`.getMemorySample([sampleDurationMillis])`](#Snapshotter+getMemorySample) ⇒ `Array`
    -   [`.getEventLoopSample([sampleDurationMillis])`](#Snapshotter+getEventLoopSample) ⇒ `Array`
    -   [`.getCpuSample([sampleDurationMillis])`](#Snapshotter+getCpuSample) ⇒ `Array`
    -   [`.getClientSample(sampleDurationMillis)`](#Snapshotter+getClientSample) ⇒ `Array`

<a name="new_Snapshotter_new"></a>

## `new Snapshotter([options])`

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[options]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>All <code>Snapshotter</code> parameters are passed
  via an options object with the following keys:</p>
</td></tr><tr>
<td><code>[options.eventLoopSnapshotIntervalSecs]</code></td><td><code>Number</code></td><td><code>0.5</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the interval of measuring the event loop response time.</p>
</td></tr><tr>
<td><code>[options.clientSnapshotIntervalSecs]</code></td><td><code>Number</code></td><td><code>1</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the interval of checking the current state
  of the remote API client.</p>
</td></tr><tr>
<td><code>[options.maxBlockedMillis]</code></td><td><code>Number</code></td><td><code>50</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum allowed delay of the event loop in milliseconds.
  Exceeding this limit overloads the event loop.</p>
</td></tr><tr>
<td><code>[options.cpuSnapshotIntervalSecs]</code></td><td><code>Number</code></td><td><code>1</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the interval of measuring CPU usage.
  This is only used when running locally. On the Apify platform,
  the statistics are provided externally at a fixed interval.</p>
</td></tr><tr>
<td><code>[options.maxUsedCpuRatio]</code></td><td><code>Number</code></td><td><code>0.95</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the maximum usage of CPU.
  Exceeding this limit overloads the CPU.</p>
</td></tr><tr>
<td><code>[options.memorySnapshotIntervalSecs]</code></td><td><code>Number</code></td><td><code>1</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the interval of measuring memory consumption.
  This is only used when running locally. On the Apify platform,
  the statistics are provided externally at a fixed interval.
  The measurement itself is resource intensive (25 - 50ms async).
  Therefore, setting this interval below 1 second is not recommended.</p>
</td></tr><tr>
<td><code>[options.maxUsedMemoryRatio]</code></td><td><code>Number</code></td><td><code>0.7</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the maximum ratio of total memory that can be used.
  Exceeding this limit overloads the memory.</p>
</td></tr><tr>
<td><code>[options.maxClientErrors]</code></td><td><code>Number</code></td><td><code>1</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the maximum number of new rate limit errors within
  the given interval.</p>
</td></tr><tr>
<td><code>[options.snapshotHistorySecs]</code></td><td><code>Number</code></td><td><code>60</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the interval in seconds for which a history of resource snapshots
  will be kept. Increasing this to very high numbers will affect performance.</p>
</td></tr></tbody>
</table>
<a name="Snapshotter+start"></a>

## `snapshotter.start()` ⇒ `Promise`

Starts capturing snapshots at configured intervals.

<a name="Snapshotter+stop"></a>

## `snapshotter.stop()` ⇒ `Promise`

Stops all resource capturing.

<a name="Snapshotter+getMemorySample"></a>

## `snapshotter.getMemorySample([sampleDurationMillis])` ⇒ `Array`

Returns a sample of latest memory snapshots, with the size of the sample defined
by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[sampleDurationMillis]</code></td><td><code>Number</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="Snapshotter+getEventLoopSample"></a>

## `snapshotter.getEventLoopSample([sampleDurationMillis])` ⇒ `Array`

Returns a sample of latest event loop snapshots, with the size of the sample defined
by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[sampleDurationMillis]</code></td><td><code>Number</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="Snapshotter+getCpuSample"></a>

## `snapshotter.getCpuSample([sampleDurationMillis])` ⇒ `Array`

Returns a sample of latest CPU snapshots, with the size of the sample defined
by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[sampleDurationMillis]</code></td><td><code>Number</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="Snapshotter+getClientSample"></a>

## `snapshotter.getClientSample(sampleDurationMillis)` ⇒ `Array`

Returns a sample of latest Client snapshots, with the size of the sample defined
by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>sampleDurationMillis</code></td><td><code>Number</code></td>
</tr>
<tr>
</tr></tbody>
</table>
