---
id: snapshotteroptions
title: SnapshotterOptions
---

<a name="SnapshotterOptions"></a>

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[eventLoopSnapshotIntervalSecs]</code></td><td><code>Number</code></td><td><code>0.5</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the interval of measuring the event loop response time.</p>
</td></tr><tr>
<td><code>[clientSnapshotIntervalSecs]</code></td><td><code>Number</code></td><td><code>1</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the interval of checking the current state
  of the remote API client.</p>
</td></tr><tr>
<td><code>[maxBlockedMillis]</code></td><td><code>Number</code></td><td><code>50</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum allowed delay of the event loop in milliseconds.
  Exceeding this limit overloads the event loop.</p>
</td></tr><tr>
<td><code>[cpuSnapshotIntervalSecs]</code></td><td><code>Number</code></td><td><code>1</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the interval of measuring CPU usage.
  This is only used when running locally. On the Apify platform,
  the statistics are provided externally at a fixed interval.</p>
</td></tr><tr>
<td><code>[maxUsedCpuRatio]</code></td><td><code>Number</code></td><td><code>0.95</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the maximum usage of CPU.
  Exceeding this limit overloads the CPU.</p>
</td></tr><tr>
<td><code>[memorySnapshotIntervalSecs]</code></td><td><code>Number</code></td><td><code>1</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the interval of measuring memory consumption.
  This is only used when running locally. On the Apify platform,
  the statistics are provided externally at a fixed interval.
  The measurement itself is resource intensive (25 - 50ms async).
  Therefore, setting this interval below 1 second is not recommended.</p>
</td></tr><tr>
<td><code>[maxUsedMemoryRatio]</code></td><td><code>Number</code></td><td><code>0.7</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the maximum ratio of total memory that can be used.
  Exceeding this limit overloads the memory.</p>
</td></tr><tr>
<td><code>[maxClientErrors]</code></td><td><code>Number</code></td><td><code>1</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the maximum number of new rate limit errors within
  the given interval.</p>
</td></tr><tr>
<td><code>[snapshotHistorySecs]</code></td><td><code>Number</code></td><td><code>60</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the interval in seconds for which a history of resource snapshots
  will be kept. Increasing this to very high numbers will affect performance.</p>
</td></tr></tbody>
</table>
