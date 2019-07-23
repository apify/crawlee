---
id: autoscaledpool
title: AutoscaledPool
---

<a name="AutoscaledPool"></a>

Manages a pool of asynchronous resource-intensive tasks that are executed in parallel.
The pool only starts new tasks if there is enough free CPU and memory available
and the Javascript event loop is not blocked.

The information about the CPU and memory usage is obtained by the [`Snapshotter`](snapshotter) class,
which makes regular snapshots of system resources that may be either local
or from the Apify cloud infrastructure in case the process is running on the Apify platform.
Meaningful data gathered from these snapshots is provided to `AutoscaledPool` by the [`SystemStatus`](systemstatus) class.

Before running the pool, you need to implement the following three functions:
[`runTaskFunction()`](#new_AutoscaledPool_new),
[`isTaskReadyFunction()`](#new_AutoscaledPool_new) and
[`isFinishedFunction()`](#new_AutoscaledPool_new).

The auto-scaled pool is started by calling the [`run()`](#AutoscaledPool+run) function.
The pool periodically queries the [`isTaskReadyFunction()`](#new_AutoscaledPool_new) function
for more tasks, managing optimal concurrency, until the function resolves to `false`. The pool then queries
the [`isFinishedFunction()`](#new_AutoscaledPool_new). If it resolves to `true`, the run finishes after all running tasks complete.
If it resolves to `false`, it assumes there will be more tasks available later and keeps periodically querying for tasks.
If any of the tasks throws then the [`run()`](#AutoscaledPool+run) function rejects the promise with an error.

The pool evaluates whether it should start a new task every time one of the tasks finishes
and also in the interval set by the `options.maybeRunIntervalSecs` parameter.

**Example usage:**

```javascript
const pool = new Apify.AutoscaledPool({
    maxConcurrency: 50,
    runTaskFunction: async () => {
        // Run some resource-intensive asynchronous operation here.
    },
    isTaskReadyFunction: async () => {
        // Tell the pool whether more tasks are ready to be processed.
        // Return true or false
    },
    isFinishedFunction: async () => {
        // Tell the pool whether it should finish
        // or wait for more tasks to become available.
        // Return true or false
    },
});

await pool.run();
```

-   [AutoscaledPool](autoscaledpool)
    -   [`new AutoscaledPool(options)`](#new_AutoscaledPool_new)
    -   [`.minConcurrency`](#AutoscaledPool+minConcurrency) ⇒ `number`
    -   [`.minConcurrency`](#AutoscaledPool+minConcurrency)
    -   [`.maxConcurrency`](#AutoscaledPool+maxConcurrency) ⇒ `number`
    -   [`.maxConcurrency`](#AutoscaledPool+maxConcurrency)
    -   [`.desiredConcurrency`](#AutoscaledPool+desiredConcurrency) ⇒ `number`
    -   [`.desiredConcurrency`](#AutoscaledPool+desiredConcurrency)
    -   [`.currentConcurrency`](#AutoscaledPool+currentConcurrency) ⇒ `number`
    -   [`.run()`](#AutoscaledPool+run) ⇒ `Promise`
    -   [`.abort()`](#AutoscaledPool+abort) ⇒ `Promise`
    -   [`.pause([timeoutSecs])`](#AutoscaledPool+pause) ⇒ `Promise`
    -   [`.resume()`](#AutoscaledPool+resume)

<a name="new_AutoscaledPool_new"></a>

## `new AutoscaledPool(options)`

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
<td colspan="3"><p>All <code>AutoscaledPool</code> parameters are passed
  via an options object with the following keys.</p>
</td></tr><tr>
<td><code>options.runTaskFunction</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A function that performs an asynchronous resource-intensive task.
  The function must either be labeled <code>async</code> or return a promise.</p>
</td></tr><tr>
<td><code>options.isTaskReadyFunction</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A function that indicates whether <code>runTaskFunction</code> should be called.
  This function is called every time there is free capacity for a new task and it should
  indicate whether it should start a new task or not by resolving to either <code>true</code> or `false.
  Besides its obvious use, it is also useful for task throttling to save resources.</p>
</td></tr><tr>
<td><code>options.isFinishedFunction</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A function that is called only when there are no tasks to be processed.
  If it resolves to <code>true</code> then the pool&#39;s run finishes. Being called only
  when there are no tasks being processed means that as long as <code>isTaskReadyFunction()</code>
  keeps resolving to <code>true</code>, <code>isFinishedFunction()</code> will never be called.
  To abort a run, use the <a href="#AutoscaledPool+abort"><code>abort()</code></a> method.</p>
</td></tr><tr>
<td><code>[options.minConcurrency]</code></td><td><code>Number</code></td><td><code>1</code></td>
</tr>
<tr>
<td colspan="3"><p>The minimum number of tasks running in parallel.</p>
<p>  <em>WARNING:</em> If you set this value too high with respect to the available system memory and CPU, your code might run extremely slow or crash.
  If you&#39;re not sure, just keep the default value and the concurrency will scale up automatically.</p>
</td></tr><tr>
<td><code>[options.maxConcurrency]</code></td><td><code>Number</code></td><td><code>1000</code></td>
</tr>
<tr>
<td colspan="3"><p>The maximum number of tasks running in parallel.</p>
</td></tr><tr>
<td><code>[options.desiredConcurrencyRatio]</code></td><td><code>Number</code></td><td><code>0.95</code></td>
</tr>
<tr>
<td colspan="3"><p>Minimum level of desired concurrency to reach before more scaling up is allowed.</p>
</td></tr><tr>
<td><code>[options.scaleUpStepRatio]</code></td><td><code>Number</code></td><td><code>0.05</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the fractional amount of desired concurrency to be added with each scaling up.
  The minimum scaling step is one.</p>
</td></tr><tr>
<td><code>[options.scaleDownStepRatio]</code></td><td><code>Number</code></td><td><code>0.05</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines the amount of desired concurrency to be subtracted with each scaling down.
  The minimum scaling step is one.</p>
</td></tr><tr>
<td><code>[options.maybeRunIntervalSecs]</code></td><td><code>Number</code></td><td><code>0.5</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how often the pool should call the <code>runTaskFunction()</code> to start a new task, in seconds.
  This has no effect on starting new tasks immediately after a task completes.</p>
</td></tr><tr>
<td><code>[options.loggingIntervalSecs]</code></td><td><code>Number</code></td><td><code>60</code></td>
</tr>
<tr>
<td colspan="3"><p>Specifies a period in which the instance logs its state, in seconds.
  Set to <code>null</code> to disable periodic logging.</p>
</td></tr><tr>
<td><code>[options.autoscaleIntervalSecs]</code></td><td><code>Number</code></td><td><code>10</code></td>
</tr>
<tr>
<td colspan="3"><p>Defines in seconds how often the pool should attempt to adjust the desired concurrency
  based on the latest system status. Setting it lower than 1 might have a severe impact on performance.
  We suggest using a value from 5 to 20.</p>
</td></tr><tr>
<td><code>[options.snapshotterOptions]</code></td><td><code>Number</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Options to be passed down to the <a href="snapshotter"><code>Snapshotter</code></a> constructor. This is useful for fine-tuning
  the snapshot intervals and history.</p>
</td></tr><tr>
<td><code>[options.systemStatusOptions]</code></td><td><code>Number</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Options to be passed down to the <a href="systemstatus"><code>SystemStatus</code></a> constructor. This is useful for fine-tuning
  the system status reports. If a custom snapshotter is set in the options, it will be used
  by the pool.</p>
</td></tr></tbody>
</table>
<a name="AutoscaledPool+minConcurrency"></a>

## `autoscaledPool.minConcurrency` ⇒ `number`

Gets the minimum number of tasks running in parallel.

<a name="AutoscaledPool+minConcurrency"></a>

## `autoscaledPool.minConcurrency`

Sets the minimum number of tasks running in parallel.

_WARNING:_ If you set this value too high with respect to the available system memory and CPU, your code might run extremely slow or crash.
If you're not sure, just keep the default value and the concurrency will scale up automatically.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>value</code></td><td><code>number</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="AutoscaledPool+maxConcurrency"></a>

## `autoscaledPool.maxConcurrency` ⇒ `number`

Gets the maximum number of tasks running in parallel.

<a name="AutoscaledPool+maxConcurrency"></a>

## `autoscaledPool.maxConcurrency`

Sets the maximum number of tasks running in parallel.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>value</code></td><td><code>number</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="AutoscaledPool+desiredConcurrency"></a>

## `autoscaledPool.desiredConcurrency` ⇒ `number`

Gets the desired concurrency for the pool,
which is an estimated number of parallel tasks that the system can currently support.

<a name="AutoscaledPool+desiredConcurrency"></a>

## `autoscaledPool.desiredConcurrency`

Sets the desired concurrency for the pool, i.e. the number of tasks that should be running
in parallel if there's large enough supply of tasks.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>value</code></td><td><code>number</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="AutoscaledPool+currentConcurrency"></a>

## `autoscaledPool.currentConcurrency` ⇒ `number`

Gets the the number of parallel tasks currently running in the pool.

<a name="AutoscaledPool+run"></a>

## `autoscaledPool.run()` ⇒ `Promise`

Runs the auto-scaled pool. Returns a promise that gets resolved or rejected once
all the tasks are finished or one of them fails.

<a name="AutoscaledPool+abort"></a>

## `autoscaledPool.abort()` ⇒ `Promise`

Aborts the run of the auto-scaled pool and destroys it. The promise returned from
the [`run()`](#AutoscaledPool+run) function will immediately resolve, no more new tasks
will be spawned and all running tasks will be left in their current state.

Due to the nature of the tasks, auto-scaled pool cannot reliably guarantee abortion
of all the running tasks, therefore, no abortion is attempted and some of the tasks
may finish, while others may not. Essentially, auto-scaled pool doesn't care about
their state after the invocation of `.abort()`, but that does not mean that some
parts of their asynchronous chains of commands will not execute.

<a name="AutoscaledPool+pause"></a>

## `autoscaledPool.pause([timeoutSecs])` ⇒ `Promise`

Prevents the auto-scaled pool from starting new tasks, but allows the running ones to finish
(unlike abort, which terminates them). Used together with [`resume()`](#AutoscaledPool+resume)

The function's promise will resolve once all running tasks have completed and the pool
is effectively idle. If the `timeoutSecs` argument is provided, the promise will reject
with a timeout error after the `timeoutSecs` seconds.

The promise returned from the [`run()`](#AutoscaledPool+run) function will not resolve
when `.pause()` is invoked (unlike abort, which resolves it).

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[timeoutSecs]</code></td><td><code>number</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="AutoscaledPool+resume"></a>

## `autoscaledPool.resume()`

Resumes the operation of the autoscaled-pool by allowing more tasks to be run.
Used together with [`pause()`](#AutoscaledPool+pause)

Tasks will automatically start running again in `options.maybeRunIntervalSecs`.
