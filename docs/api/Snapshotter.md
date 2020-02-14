---
id: snapshotter
title: Snapshotter
---

<a name="Snapshotter"></a>

Creates snapshots of system resources at given intervals and marks the resource as either overloaded or not during the last interval. Keeps a history
of the snapshots. It tracks the following resources: Memory, EventLoop, API and CPU. The class is used by the [`AutoscaledPool`](autoscaledpool)
class.

When running on the Apify platform, the CPU and memory statistics are provided by the platform, as collected from the running Docker container. When
running locally, `Snapshotter` makes its own statistics by querying the OS.

CPU becomes overloaded locally when its current use exceeds the `maxUsedCpuRatio` option or when Apify platform marks it as overloaded.

Memory becomes overloaded if its current use exceeds the `maxUsedMemoryRatio` option. It's computed using the total memory available to the container
when running on the Apify platform and a quarter of total system memory when running locally. Max total memory when running locally may be overridden
by using the `APIFY_MEMORY_MBYTES` environment variable.

Event loop becomes overloaded if it slows down by more than the `maxBlockedMillis` option.

Client becomes overloaded when rate limit errors (429 - Too Many Requests), typically received from the request queue, exceed the set limit within the
set interval.

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
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[options]</code></td><td><code><a href="../typedefs/snapshotteroptions">SnapshotterOptions</a></code></td>
</tr>
<tr>
<td colspan="3"><p>All <code>Snapshotter</code> configuration options.</p>
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

Returns a sample of latest memory snapshots, with the size of the sample defined by the sampleDurationMillis parameter. If omitted, it returns a full
snapshot history.

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

Returns a sample of latest event loop snapshots, with the size of the sample defined by the sampleDurationMillis parameter. If omitted, it returns a
full snapshot history.

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

Returns a sample of latest CPU snapshots, with the size of the sample defined by the sampleDurationMillis parameter. If omitted, it returns a full
snapshot history.

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

Returns a sample of latest Client snapshots, with the size of the sample defined by the sampleDurationMillis parameter. If omitted, it returns a full
snapshot history.

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
