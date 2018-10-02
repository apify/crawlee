---
id: autoscaledpool
title: AutoscaledPool
---
<a name="exp_module_AutoscaledPool--AutoscaledPool"></a>

## AutoscaledPool ⏏
Manages a pool of asynchronous resource-intensive tasks that are executed in parallel.
The pool only starts new tasks if there is enough free CPU and memory available
and the Javascript event loop is not blocked.

The information about the CPU and memory usage is obtained by the `Snapshotter` class,
which makes regular snapshots of system resources that may be either local
or from the Apify cloud infrastructure in case the process is running on the Apify platform.
Meaningful data gathered from these snapshots is provided to `AutoscaledPool` by the `SystemStatus` class.

Before running the pool, you need to implement the following three functions:
[`runTaskFunction()`](AutoscaledPool#runTaskFunction),
[`isTaskReadyFunction()`](AutoscaledPool#isTaskReadyFunction) and
[`isFinishedFunction()`](AutoscaledPool#isFinishedFunction).

The auto-scaled pool is started by calling the [`run()`](AutoscaledPool#run) function.
The pool periodically queries the `isTaskReadyFunction()` function
for more tasks, managing optimal concurrency, until the function resolves to `false`. The pool then queries
the `isFinishedFunction()`. If it resolves to `true`, the run finishes. If it resolves to `false`, it assumes
there will be more tasks available later and keeps querying for tasks, until finally both the
`isTaskReadyFunction()` and `isFinishedFunction()` functions resolve to `true`. If any of the tasks throws
then the `run()` function rejects the promise with an error.

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
        // Tell the pool whether more tasks are ready to be processed. (true / false)
    },
    isFinishedFunction: async () => {
        // Tell the pool whether it should finish or wait for more tasks to become available. (true / false)
    }
});

await pool.run();
```

**Kind**: global class of [<code>AutoscaledPool</code>](#module_AutoscaledPool)  
* [AutoscaledPool](#exp_module_AutoscaledPool--AutoscaledPool) ⏏
    * [`new AutoscaledPool(options)`](#new_module_AutoscaledPool--AutoscaledPool_new)
    * [`.run()`](#module_AutoscaledPool--AutoscaledPool+run) ⇒ <code>Promise</code>
    * [`.abort()`](#module_AutoscaledPool--AutoscaledPool+abort) ⇒ <code>Promise</code>

<a name="new_module_AutoscaledPool--AutoscaledPool_new"></a>

### `new AutoscaledPool(options)`

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  |  |
| options.runTaskFunction | <code>function</code> |  | A function that performs an asynchronous resource-intensive task.   The function must either be labeled `async` or return a promise. |
| options.isTaskReadyFunction | <code>function</code> |  | A function that indicates whether `runTaskFunction` should be called.   This function is called every time there is free capacity for a new task and it should   indicate whether it should start or not by resolving to either `true` or `false.   Besides its obvious use, it is also useful for task throttling to save resources. |
| options.isFinishedFunction | <code>function</code> |  | A function that is called only when there are no tasks to be processed.   If it resolves to `true` then the pool's run finishes. Being called only   when there are no tasks being processed means that as long as `isTaskReadyFunction()`   keeps resolving to `true`, `isFinishedFunction()` will never be called.   To abort a run, use the `pool.abort()` method. |
| [options.minConcurrency] | <code>Number</code> | <code>1</code> | Minimum number of tasks running in parallel. |
| [options.maxConcurrency] | <code>Number</code> | <code>1000</code> | Maximum number of tasks running in parallel. |
| [options.desiredConcurrencyRatio] | <code>Number</code> | <code>0.95</code> | Minimum level of desired concurrency to reach before more scaling up is allowed. |
| [options.scaleUpStepRatio] | <code>Number</code> | <code>0.05</code> | Defines the fractional amount of desired concurrency to be added with each scaling up.   The minimum scaling step is one. |
| [options.scaleDownStepRatio] | <code>Number</code> | <code>0.05</code> | Defines the amount of desired concurrency to be subtracted with each scaling down.   The minimum scaling step is one. |
| [options.maybeRunIntervalSecs] | <code>Number</code> | <code>0.5</code> | Indicates how often the pool should call the `runTaskFunction()` to start a new task, in seconds.   This has no effect on starting new tasks immediately after a task completes. |
| [options.loggingIntervalSecs] | <code>Number</code> | <code>60</code> | Specifies a period in which the instance logs its state, in seconds.   Set to `null` to disable periodic logging. |
| [options.autoscaleIntervalSecs] | <code>Number</code> | <code>10</code> | Defines in seconds how often the pool should attempt to adjust the desired concurrency   based on the latest system status. Setting it lower than 1 might have a severe impact on performance.   We suggest using a value from 5 to 20. |
| [options.snapshotterOptions] | <code>Number</code> |  | Options to be passed down to the `Snapshotter` constructor. This is useful for fine-tuning   the snapshot intervals and history.   See <a href="https://github.com/apifytech/apify-js/blob/develop/src/autoscaling/snapshotter.js">Snapshotter</a> source code for more details. |
| [options.systemStatusOptions] | <code>Number</code> |  | Options to be passed down to the `SystemStatus` constructor. This is useful for fine-tuning   the system status reports. If a custom snapshotter is set in the options, it will be used   by the pool.   See <a href="https://github.com/apifytech/apify-js/blob/develop/src/autoscaling/system_status.js">SystemStatus</a> source code for more details. |

<a name="module_AutoscaledPool--AutoscaledPool+run"></a>

### `autoscaledPool.run()` ⇒ <code>Promise</code>
Runs the auto-scaled pool. Returns a promise that gets resolved or rejected once
all the tasks are finished or one of them fails.

**Kind**: instance method of [<code>AutoscaledPool</code>](#exp_module_AutoscaledPool--AutoscaledPool)  
<a name="module_AutoscaledPool--AutoscaledPool+abort"></a>

### `autoscaledPool.abort()` ⇒ <code>Promise</code>
Aborts the run of the auto-scaled pool, discards all currently running tasks and destroys it.

**Kind**: instance method of [<code>AutoscaledPool</code>](#exp_module_AutoscaledPool--AutoscaledPool)  
