---
id: version-0.22.4-autoscaled-pool-options
title: AutoscaledPoolOptions
original_id: autoscaled-pool-options
---

<a name="autoscaledpooloptions"></a>

## Properties

### `runTaskFunction`

**Type**: `function`

A function that performs an asynchronous resource-intensive task. The function must either be labeled `async` or return a promise.

---

### `isTaskReadyFunction`

**Type**: `function`

A function that indicates whether `runTaskFunction` should be called. This function is called every time there is free capacity for a new task and it
should indicate whether it should start a new task or not by resolving to either `true` or `false`. Besides its obvious use, it is also useful for
task throttling to save resources.

---

### `isFinishedFunction`

**Type**: `function`

A function that is called only when there are no tasks to be processed. If it resolves to `true` then the pool's run finishes. Being called only when
there are no tasks being processed means that as long as `isTaskReadyFunction()` keeps resolving to `true`, `isFinishedFunction()` will never be
called. To abort a run, use the [`AutoscaledPool.abort()`](../api/autoscaled-pool#abort) method.

---

### `minConcurrency`

**Type**: `number` <code> = 1</code>

The minimum number of tasks running in parallel.

_WARNING:_ If you set this value too high with respect to the available system memory and CPU, your code might run extremely slow or crash. If you're
not sure, just keep the default value and the concurrency will scale up automatically.

---

### `maxConcurrency`

**Type**: `number` <code> = 1000</code>

The maximum number of tasks running in parallel.

---

### `desiredConcurrency`

**Type**: `number`

The desired number of tasks that should be running parallel on the start of the pool, if there is a large enough supply of them. By default, it is
`minConcurrency`.

---

### `desiredConcurrencyRatio`

**Type**: `number` <code> = 0.95</code>

Minimum level of desired concurrency to reach before more scaling up is allowed.

---

### `scaleUpStepRatio`

**Type**: `number` <code> = 0.05</code>

Defines the fractional amount of desired concurrency to be added with each scaling up. The minimum scaling step is one.

---

### `scaleDownStepRatio`

**Type**: `number` <code> = 0.05</code>

Defines the amount of desired concurrency to be subtracted with each scaling down. The minimum scaling step is one.

---

### `maybeRunIntervalSecs`

**Type**: `number` <code> = 0.5</code>

Indicates how often the pool should call the `runTaskFunction()` to start a new task, in seconds. This has no effect on starting new tasks immediately
after a task completes.

---

### `loggingIntervalSecs`

**Type**: `number` <code> = 60</code>

Specifies a period in which the instance logs its state, in seconds. Set to `null` to disable periodic logging.

---

### `autoscaleIntervalSecs`

**Type**: `number` <code> = 10</code>

Defines in seconds how often the pool should attempt to adjust the desired concurrency based on the latest system status. Setting it lower than 1
might have a severe impact on performance. We suggest using a value from 5 to 20.

---

### `snapshotterOptions`

**Type**: [`SnapshotterOptions`](../typedefs/snapshotter-options)

Options to be passed down to the [`Snapshotter`](../api/snapshotter) constructor. This is useful for fine-tuning the snapshot intervals and history.

---

### `systemStatusOptions`

**Type**: [`SystemStatusOptions`](../typedefs/system-status-options)

Options to be passed down to the [`SystemStatus`](../api/system-status) constructor. This is useful for fine-tuning the system status reports. If a
custom snapshotter is set in the options, it will be used by the pool.

---
