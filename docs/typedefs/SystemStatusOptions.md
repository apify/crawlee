---
id: systemstatusoptions
title: SystemStatusOptions
---

<a name="SystemStatusOptions"></a>

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[currentHistorySecs]</code></td><td><code>Number</code></td><td><code>5</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines max age of snapshots used in the
  <a href="#SystemStatus+getCurrentStatus"><code>getCurrentStatus()</code></a> measurement.</p>
</td></tr><tr>
<td><code>[maxMemoryOverloadedRatio]</code></td><td><code>Number</code></td><td><code>0.2</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the maximum ratio of overloaded snapshots in a memory sample.
  If the sample exceeds this ratio, the system will be overloaded.</p>
</td></tr><tr>
<td><code>[maxEventLoopOverloadedRatio]</code></td><td><code>Number</code></td><td><code>0.2</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the maximum ratio of overloaded snapshots in an event loop sample.
  If the sample exceeds this ratio, the system will be overloaded.</p>
</td></tr><tr>
<td><code>[maxCpuOverloadedRatio]</code></td><td><code>Number</code></td><td><code>0.4</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the maximum ratio of overloaded snapshots in a CPU sample.
  If the sample exceeds this ratio, the system will be overloaded.</p>
</td></tr><tr>
<td><code>[maxClientOverloadedRatio]</code></td><td><code>Number</code></td><td><code>0.2</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the maximum ratio of overloaded snapshots in a Client sample.
  If the sample exceeds this ratio, the system will be overloaded.</p>
</td></tr><tr>
<td><code>[snapshotter]</code></td><td><code><a href="snapshotter">Snapshotter</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>The <code>Snapshotter</code> instance to be queried for <code>SystemStatus</code>.</p>
</td></tr></tbody>
</table>
