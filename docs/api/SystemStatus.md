---
id: systemstatus
title: SystemStatus
---

<a name="SystemStatus"></a>

Provides a simple interface to reading system status from a [`Snapshotter`](snapshotter) instance. It only exposes two functions
[`getCurrentStatus()`](#SystemStatus+getCurrentStatus) and [`getHistoricalStatus()`](#SystemStatus+getHistoricalStatus). The system status is
calculated using a weighted average of overloaded messages in the snapshots, with the weights being the time intervals between the snapshots. Each
resource is calculated separately and the system is overloaded whenever at least one resource is overloaded. The class is used by the
[`AutoscaledPool`](autoscaledpool) class.

[`getCurrentStatus()`](#SystemStatus+getCurrentStatus) returns a boolean that represents the current status of the system. The length of the current
timeframe in seconds is configurable by the `currentHistorySecs` option and represents the max age of snapshots to be considered for the calculation.

[`getHistoricalStatus()`](#SystemStatus+getHistoricalStatus) returns a boolean that represents the long-term status of the system. It considers the
full snapshot history available in the [`Snapshotter`](snapshotter) instance.

-   [SystemStatus](systemstatus)
    -   [`new SystemStatus([options])`](#new_SystemStatus_new)
    -   [`.getCurrentStatus()`](#SystemStatus+getCurrentStatus) ⇒ [`SystemInfo`](../typedefs/systeminfo)
    -   [`.getHistoricalStatus()`](#SystemStatus+getHistoricalStatus) ⇒ `Object`

<a name="new_SystemStatus_new"></a>

## `new SystemStatus([options])`

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[options]</code></td><td><code><a href="../typedefs/systemstatusoptions">SystemStatusOptions</a></code></td>
</tr>
<tr>
<td colspan="3"><p>All <code>SystemStatus</code> configuration options.</p>
</td></tr></tbody>
</table>
<a name="SystemStatus+getCurrentStatus"></a>

## `systemStatus.getCurrentStatus()` ⇒ [`SystemInfo`](../typedefs/systeminfo)

Returns an [`SystemInfo`](../typedefs/systeminfo) object with the following structure:

```javascript
{
    isSystemIdle: Boolean,
    memInfo: Object,
    eventLoopInfo: Object,
    cpuInfo: Object
}
```

Where the `isSystemIdle` property is set to `false` if the system has been overloaded in the last `options.currentHistorySecs` seconds, and `true`
otherwise.

<a name="SystemStatus+getHistoricalStatus"></a>

## `systemStatus.getHistoricalStatus()` ⇒ `Object`

Returns an [`SystemInfo`](../typedefs/systeminfo) object with the following structure:

```javascript
{
    isSystemIdle: Boolean,
    memInfo: Object,
    eventLoopInfo: Object,
    cpuInfo: Object
}
```

Where the `isSystemIdle` property is set to `false` if the system has been overloaded in the full history of the [`Snapshotter`](snapshotter) (which
is configurable in the [`Snapshotter`](snapshotter)) and `true` otherwise.
