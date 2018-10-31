---
id: systemstatus
title: SystemStatus
---
<a name="SystemStatus"></a>

Provides a simple interface to reading system status from a [`Snapshotter`](snapshotter) instance.
It only exposes two functions [`getCurrentStatus()`](#SystemStatus+getCurrentStatus)
and [`getHistoricalStatus()`](#SystemStatus+getHistoricalStatus).
The system status is calculated using a weighted average of overloaded
messages in the snapshots, with the weights being the time intervals
between the snapshots. Each resource is calculated separately
and the system is overloaded whenever at least one resource is overloaded.
The class is used by the [`AutoscaledPool`](autoscaledpool) class.

[`getCurrentStatus()`](#SystemStatus+getCurrentStatus)
returns a boolean that represents the current status of the system.
The length of the current timeframe in seconds is configurable
by the `currentHistorySecs` option and represents the max age
of snapshots to be considered for the calculation.

[`getHistoricalStatus()`](#SystemStatus+getHistoricalStatus)
returns a boolean that represents the long-term status
of the system. It considers the full snapshot history available
in the [`Snapshotter`](snapshotter) instance.


* [SystemStatus](systemstatus)
    * [`new SystemStatus([options])`](#new_SystemStatus_new)
    * [`.getCurrentStatus()`](#SystemStatus+getCurrentStatus) ⇒ <code>Object</code>
    * [`.getHistoricalStatus()`](#SystemStatus+getHistoricalStatus) ⇒ <code>Object</code>

<a name="new_SystemStatus_new"></a>

## `new SystemStatus([options])`
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
<td colspan="3"><p>All <code>SystemStatus</code> parameters are passed
  via an options object with the following keys:</p>
</td></tr><tr>
<td><code>[options.currentHistorySecs]</code></td><td><code>Number</code></td><td><code>5</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines max age of snapshots used in the
  <a href="#SystemStatus+getCurrentStatus"><code>getCurrentStatus()</code></a> measurement.</p>
</td></tr><tr>
<td><code>[options.maxMemoryOverloadedRatio]</code></td><td><code>Number</code></td><td><code>0.2</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the maximum ratio of overloaded snapshots in a memory sample.
  If the sample exceeds this ratio, the system will be overloaded.</p>
</td></tr><tr>
<td><code>[options.maxEventLoopOverloadedRatio]</code></td><td><code>Number</code></td><td><code>0.2</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the maximum ratio of overloaded snapshots in an event loop sample.
  If the sample exceeds this ratio, the system will be overloaded.</p>
</td></tr><tr>
<td><code>[options.maxCpuOverloadedRatio]</code></td><td><code>Number</code></td><td><code>0.1</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the maximum ratio of overloaded snapshots in a CPU sample.
  If the sample exceeds this ratio, the system will be overloaded.</p>
</td></tr></tbody>
</table>
<a name="SystemStatus+getCurrentStatus"></a>

## `systemStatus.getCurrentStatus()` ⇒ <code>Object</code>
Returns an object with the following structure:

```javascript
{
    isSystemIdle: Boolean,
    memInfo: Object,
    eventLoopInfo: Object,
    cpuInfo: Object
}
```

Where the `isSystemIdle` property is set to `false` if the system
has been overloaded in the last `options.currentHistorySecs` seconds,
and `true` otherwise.

<a name="SystemStatus+getHistoricalStatus"></a>

## `systemStatus.getHistoricalStatus()` ⇒ <code>Object</code>
Returns an object with the following structure:

```javascript
{
    isSystemIdle: Boolean,
    memInfo: Object,
    eventLoopInfo: Object,
    cpuInfo: Object
}
```

Where the `isSystemIdle` property is set to `false` if the system
has been overloaded in the full history of the [`Snapshotter`](snapshotter)
(which is configurable in the [`Snapshotter`](snapshotter)) and `true` otherwise.

