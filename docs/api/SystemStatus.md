---
id: systemstatus
title: SystemStatus
---
<a name="exp_module_SystemStatus--SystemStatus"></a>

## SystemStatus ⏏
Provides a simple interface to reading system status from a Snapshotter instance.
It only exposes two functions `getCurrentStatus()` and `gethistoricalstatus()`.
The system status is calculated using a weighted average of overloaded
messages in the snapshots, with the weights being the time intervals
between the snapshots. Each resource is calculated separately
and the system is overloaded whenever at least one resource is overloaded.
The class is used by the [AutoscaledPool](AutoscaledPool) class.

`getCurrentStatus()` returns a boolean that represents the current status of the system.
The length of the current timeframe in seconds is configurable
by the currentHistorySecs option and represents the max age
of snapshots to be considered for the calculation.

`getHistoricalStatus()` returns a boolean that represents the long-term status
of the system. It considers the full snapshot history available
in the Snapshotter instance.

**Kind**: global class of [<code>SystemStatus</code>](#module_SystemStatus)  
* [SystemStatus](#exp_module_SystemStatus--SystemStatus) ⏏
    * [`new SystemStatus(options)`](#new_module_SystemStatus--SystemStatus_new)
    * [`.getCurrentStatus()`](#module_SystemStatus--SystemStatus+getCurrentStatus) ⇒ <code>Boolean</code>
    * [`.getHistoricalStatus()`](#module_SystemStatus--SystemStatus+getHistoricalStatus) ⇒ <code>Boolean</code>

<a name="new_module_SystemStatus--SystemStatus_new"></a>

### `new SystemStatus(options)`
<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[options.currentHistorySecs]</code></td><td><code>Number</code></td><td><code>5</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines max age of snapshots used in the <code>isOk()</code> measurement.</p>
</td></tr><tr>
<td><code>[options.maxMemoryOverloadedRatio]</code></td><td><code>Number</code></td><td><code>0.2</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the maximum ratio of overloaded snapshots in a memory sample.
  If the sample exceeds this ratio, the system will be overloaded.</p>
</td></tr><tr>
<td><code>[options.maxEventLoopOverloadedRatio]</code></td><td><code>Number</code></td><td><code>0.02</code></td>
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
<a name="module_SystemStatus--SystemStatus+getCurrentStatus"></a>

### `systemStatus.getCurrentStatus()` ⇒ <code>Boolean</code>
Returns true if the system has not been overloaded in the last
currentHistorySecs seconds, otherwise returns false.

**Kind**: instance method of [<code>SystemStatus</code>](#exp_module_SystemStatus--SystemStatus)  
<a name="module_SystemStatus--SystemStatus+getHistoricalStatus"></a>

### `systemStatus.getHistoricalStatus()` ⇒ <code>Boolean</code>
Returns true if the system has not been overloaded in the full
history of the snapshotter (which is configurable in the snapshotter).

**Kind**: instance method of [<code>SystemStatus</code>](#exp_module_SystemStatus--SystemStatus)  
