# Migration from 0.x.x to 0.8.0

## Breaking change 1: AutoscaledPool configuration changed

Originally, AutoscaledPool was just a single class that handled everything. Now it's split into 3 different classes.
As such, the configuration changed dramatically. The API is the same however.

If you were using any of the following options, you should see the current documentation and migrate accordingly:

1. `options.workerFunction`
   - REMOVED; see `options.isFinishedFunction` for similar functionality
2. `options.finishWhenEmpty`
   - REMOVED; see `options.isFinishedFunction` for similar functionality
3. `options.ignoreMainProcess`
   - REMOVED;
4. `options.maxMemoryMbytes`
   - MOVED; use `options.snapshotterOptions.maxMemoryMbytes`
5. `options.minFreeMemoryRatio`
   - MOVED AND CHANGED; use `options.snapshotterOptions.maxUsedMemoryRatio`
6. `options.maybeRunIntervalMillis`
   - CHANGED; use `options.maybeRunIntervalSecs`
7. `options.loggingIntervalMillis`
   - CHANGED; use `options.loggingIntervalSecs`
   
For more configuration options, see Snapshotter and SystemStatus documentation.

## Breaking change 2: Crawlers no longer support passing AutoscaledPool options directly

Previously, setting e.g. `options.isFinishedFunction` directly on the options object passed to
a Crawler constructor would configure the underlying AutoscaledPool. From v0.8.0,
the options are available under `options.autoscaledPoolOptions`. Setting a custom `isFinishedFunction`
is therefore done using `options.autoscaledPoolOptions.isFinishedFunction`.

Frequently used properties `minConcurrency` and `maxConcurrency` are exempted and can still be used
directly as `options.minConcurrency`.
