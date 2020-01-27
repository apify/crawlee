---
id: autoscaledpooloptions
title: AutoscaledPoolOptions
---

<a name="AutoscaledPoolOptions"></a>

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>runTaskFunction</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A function that performs an asynchronous resource-intensive task.
  The function must either be labeled <code>async</code> or return a promise.</p>
</td></tr><tr>
<td><code>isTaskReadyFunction</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A function that indicates whether <code>runTaskFunction</code> should be called.
  This function is called every time there is free capacity for a new task and it should
  indicate whether it should start a new task or not by resolving to either <code>true</code> or <code>false</code>.
  Besides its obvious use, it is also useful for task throttling to save resources.</p>
</td></tr><tr>
<td><code>isFinishedFunction</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A function that is called only when there are no tasks to be processed.
  If it resolves to <code>true</code> then the pool&#39;s run finishes. Being called only
  when there are no tasks being processed means that as long as <code>isTaskReadyFunction()</code>
  keeps resolving to <code>true</code>, <code>isFinishedFunction()</code> will never be called.
  To abort a run, use the <a href="#AutoscaledPool+abort"><code>abort()</code></a> method.</p>
</td></tr><tr>
<td><code>[minConcurrency]</code></td><td><code>Number</code></td><td><code>1</code></td>
</tr>
<tr>
<td colspan="3"><p>The minimum number of tasks running in parallel.</p>
<p>  <em>WARNING:</em> If you set this value too high with respect to the available system memory and CPU, your code might run extremely slow or crash.
  If you&#39;re not sure, just keep the default value and the concurrency will scale up automatically.</p>
</td></tr><tr>
<td><code>[maxConcurrency]</code></td><td><code>Number</code></td><td><code>1000</code></td>
</tr>
<tr>
<td colspan="3"><p>The maximum number of tasks running in parallel.</p>
</td></tr><tr>
<td><code>[desiredConcurrency]</code></td><td><code>Number</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>The desired number of tasks that should be running parallel on the start of the pool,
  if there is a large enough supply of them.
  By default, it is <code>minConcurrency</code>.</p>
</td></tr><tr>
<td><code>[desiredConcurrencyRatio]</code></td><td><code>Number</code></td><td><code>0.95</code></td>
</tr>
<tr>
<td colspan="3"><p>Minimum level of desired concurrency to reach before more scaling up is allowed.</p>
</td></tr><tr>
<td><code>[scaleUpStepRatio]</code></td><td><code>Number</code></td><td><code>0.05</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the fractional amount of desired concurrency to be added with each scaling up.
  The minimum scaling step is one.</p>
</td></tr><tr>
<td><code>[scaleDownStepRatio]</code></td><td><code>Number</code></td><td><code>0.05</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the amount of desired concurrency to be subtracted with each scaling down.
  The minimum scaling step is one.</p>
</td></tr><tr>
<td><code>[maybeRunIntervalSecs]</code></td><td><code>Number</code></td><td><code>0.5</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how often the pool should call the <code>runTaskFunction()</code> to start a new task, in seconds.
  This has no effect on starting new tasks immediately after a task completes.</p>
</td></tr><tr>
<td><code>[loggingIntervalSecs]</code></td><td><code>Number</code></td><td><code>60</code></td>
</tr>
<tr>
<td colspan="3"><p>Specifies a period in which the instance logs its state, in seconds.
  Set to <code>null</code> to disable periodic logging.</p>
</td></tr><tr>
<td><code>[autoscaleIntervalSecs]</code></td><td><code>Number</code></td><td><code>10</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines in seconds how often the pool should attempt to adjust the desired concurrency
  based on the latest system status. Setting it lower than 1 might have a severe impact on performance.
  We suggest using a value from 5 to 20.</p>
</td></tr><tr>
<td><code>[snapshotterOptions]</code></td><td><code><a href="../typedefs/snapshotteroptions">SnapshotterOptions</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Options to be passed down to the <a href="snapshotter"><code>Snapshotter</code></a> constructor. This is useful for fine-tuning
  the snapshot intervals and history.</p>
</td></tr><tr>
<td><code>[systemStatusOptions]</code></td><td><code><a href="../typedefs/systemstatusoptions">SystemStatusOptions</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Options to be passed down to the <a href="systemstatus"><code>SystemStatus</code></a> constructor. This is useful for fine-tuning
  the system status reports. If a custom snapshotter is set in the options, it will be used
  by the pool.</p>
</td></tr></tbody>
</table>
