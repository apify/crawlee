---
id: version-0.22.4-autoscaled-pool
title: AutoscaledPool
original_id: autoscaled-pool
---

<a name="autoscaledpool"></a>

Manages a pool of asynchronous resource-intensive tasks that are executed in parallel. The pool only starts new tasks if there is enough free CPU and
memory available and the Javascript event loop is not blocked.

The information about the CPU and memory usage is obtained by the [`Snapshotter`](../api/snapshotter) class, which makes regular snapshots of system
resources that may be either local or from the Apify cloud infrastructure in case the process is running on the Apify platform. Meaningful data
gathered from these snapshots is provided to `AutoscaledPool` by the [`SystemStatus`](../api/system-status) class.

Before running the pool, you need to implement the following three functions:
[`AutoscaledPoolOptions.runTaskFunction()`](../typedefs/autoscaled-pool-options#runtaskfunction),
[`AutoscaledPoolOptions.isTaskReadyFunction()`](../typedefs/autoscaled-pool-options#istaskreadyfunction) and
[`AutoscaledPoolOptions.isFinishedFunction()`](../typedefs/autoscaled-pool-options#isfinishedfunction).

The auto-scaled pool is started by calling the [`AutoscaledPool.run()`](../api/autoscaled-pool#run) function. The pool periodically queries the
[`AutoscaledPoolOptions.isTaskReadyFunction()`](../typedefs/autoscaled-pool-options#istaskreadyfunction) function for more tasks, managing optimal
concurrency, until the function resolves to `false`. The pool then queries the
[`AutoscaledPoolOptions.isFinishedFunction()`](../typedefs/autoscaled-pool-options#isfinishedfunction). If it resolves to `true`, the run finishes
after all running tasks complete. If it resolves to `false`, it assumes there will be more tasks available later and keeps periodically querying for
tasks. If any of the tasks throws then the [`AutoscaledPool.run()`](../api/autoscaled-pool#run) function rejects the promise with an error.

The pool evaluates whether it should start a new task every time one of the tasks finishes and also in the interval set by the
`options.maybeRunIntervalSecs` parameter.

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

---

<a name="autoscaledpool"></a>

## `new AutoscaledPool(options)`

**Parameters**:

-   **`options`**: [`AutoscaledPoolOptions`](../typedefs/autoscaled-pool-options) - All `AutoscaledPool` configuration options.

---

<a name="minconcurrency"></a>

## `autoscaledPool.minConcurrency`

Gets the minimum number of tasks running in parallel.

**Returns**:

`number`

---

<a name="minconcurrency"></a>

## `autoscaledPool.minConcurrency`

Sets the minimum number of tasks running in parallel.

_WARNING:_ If you set this value too high with respect to the available system memory and CPU, your code might run extremely slow or crash. If you're
not sure, just keep the default value and the concurrency will scale up automatically.

**Parameters**:

-   **`value`**: `number`

---

<a name="maxconcurrency"></a>

## `autoscaledPool.maxConcurrency`

Gets the maximum number of tasks running in parallel.

**Returns**:

`number`

---

<a name="maxconcurrency"></a>

## `autoscaledPool.maxConcurrency`

Sets the maximum number of tasks running in parallel.

**Parameters**:

-   **`value`**: `number`

---

<a name="desiredconcurrency"></a>

## `autoscaledPool.desiredConcurrency`

Gets the desired concurrency for the pool, which is an estimated number of parallel tasks that the system can currently support.

**Returns**:

`number`

---

<a name="desiredconcurrency"></a>

## `autoscaledPool.desiredConcurrency`

Sets the desired concurrency for the pool, i.e. the number of tasks that should be running in parallel if there's large enough supply of tasks.

**Parameters**:

-   **`value`**: `number`

---

<a name="currentconcurrency"></a>

## `autoscaledPool.currentConcurrency`

Gets the the number of parallel tasks currently running in the pool.

**Returns**:

`number`

---

<a name="run"></a>

## `autoscaledPool.run()`

Runs the auto-scaled pool. Returns a promise that gets resolved or rejected once all the tasks are finished or one of them fails.

**Returns**:

`Promise<void>`

---

<a name="abort"></a>

## `autoscaledPool.abort()`

Aborts the run of the auto-scaled pool and destroys it. The promise returned from the [`AutoscaledPool.run()`](../api/autoscaled-pool#run) function
will immediately resolve, no more new tasks will be spawned and all running tasks will be left in their current state.

Due to the nature of the tasks, auto-scaled pool cannot reliably guarantee abortion of all the running tasks, therefore, no abortion is attempted and
some of the tasks may finish, while others may not. Essentially, auto-scaled pool doesn't care about their state after the invocation of `.abort()`,
but that does not mean that some parts of their asynchronous chains of commands will not execute.

**Returns**:

`Promise<void>`

---

<a name="pause"></a>

## `autoscaledPool.pause([timeoutSecs])`

Prevents the auto-scaled pool from starting new tasks, but allows the running ones to finish (unlike abort, which terminates them). Used together with
[`AutoscaledPool.resume()`](../api/autoscaled-pool#resume)

The function's promise will resolve once all running tasks have completed and the pool is effectively idle. If the `timeoutSecs` argument is provided,
the promise will reject with a timeout error after the `timeoutSecs` seconds.

The promise returned from the [`AutoscaledPool.run()`](../api/autoscaled-pool#run) function will not resolve when `.pause()` is invoked (unlike abort,
which resolves it).

**Parameters**:

-   **`[timeoutSecs]`**: `number`

**Returns**:

`Promise<void>`

---

<a name="resume"></a>

## `autoscaledPool.resume()`

Resumes the operation of the autoscaled-pool by allowing more tasks to be run. Used together with
[`AutoscaledPool.pause()`](../api/autoscaled-pool#pause)

Tasks will automatically start running again in `options.maybeRunIntervalSecs`.

---
