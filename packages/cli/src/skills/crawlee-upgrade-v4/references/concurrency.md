# Concurrency

Top-level crawler `minConcurrency`, `maxConcurrency` and `maxRequestsPerMinute` still work. Preserve them for ordinary limits. `autoscaledPoolOptions` becomes `taskLoopOptions`, narrowed to `isFinishedFunction` and `isTaskReadyFunction`. Scaling options belong in `ConcurrencySystem`; do not just rename the old options bag.

## Owned concurrency systems

A supplied system must be started by its owner, and cannot be combined with crawler concurrency shortcuts. Its configuration replaces the default wholesale. Preserve HTTP tuning by spreading `HTTP_OPTIMIZED_CONCURRENCY_SYSTEM_OPTIONS` where needed:

```ts
const concurrencySystem = new ConcurrencySystem({
    ...HTTP_OPTIMIZED_CONCURRENCY_SYSTEM_OPTIONS,
    maxConcurrency: 50,
});
await concurrencySystem.start();
const crawler = new CheerioCrawler({ concurrencySystem, requestHandler });
try {
    await crawler.run(urls);
} finally {
    await concurrencySystem.stop();
}
```

The system accepts scaling options formerly in AutoscaledPool, including `desiredConcurrency`, `desiredConcurrencyRatio`, scale-up/down step ratios, logging/autoscale intervals and `maxTasksPerMinute`. Task-loop `maybeRunIntervalSecs`, `taskTimeoutSecs` and `log` have no replacement.

`crawler.concurrencySystem` is a read-only `IConcurrencySystem`, undefined before the run resolves it. Crawler-owned defaults are rebuilt each run; do not cache them across runs. To tune during a run, keep a reference to a system you constructed. Multiple crawlers can share one combined budget.

## Crawler controls

`crawler.autoscaledPool` is private. Use `crawler.pause(secs)`, `resume()`, `teardown()` or graceful `stop()`, and read concurrency through `crawler.concurrencySystem`. Pausing waits for in-flight requests and leaves run pending; stopping ends the run. A paused crawler's shared system keeps evaluating and logging. Only the owner should stop it, and must restart before resuming.

`AutoscaledPool` remains exported but is internal, as are `Snapshotter` and `SystemStatus`. Use ConcurrencySystem for load monitoring, or ordinary bounded parallelism tools for non-crawler tasks. If maintaining a direct internal pool temporarily, it now needs both `concurrencySystem` and `consumer: { id }`; lifecycle still belongs to the system owner.

## Load signals

Merge old snapshotter/system-status options into `ConcurrencySystemOptions.loadSignals`:

- `memory`: `maxUsedRatio`, `overloadedRatio` and sampling options.
- `eventLoop`: `snapshotIntervalSecs`, `maxBlockedMillis`, `overloadedRatio`.
- `cpu`: its sampling options and `overloadedRatio`.
- `storageBackend`: old client signal settings, including `maxErrors` and `overloadedRatio`.
- `custom`: the old custom load-signal array.

`snapshotHistorySecs` and `currentHistorySecs` are top-level system options, not per-signal options. `ClientInfo` becomes `LoadSignalInfo`; `SystemInfo.clientInfo` becomes `storageBackendInfo`, and the corresponding class becomes `StorageBackendLoadSignal`. Duplicate signal names throw; disable a built-in with `false` before supplying its replacement.

Both evaluation windows are requested explicitly. Custom signals should honor `getSample(sampleDurationMillis)` and use `start()`'s `maxSampleWindowMillis` for retention. `SnapshotStore` loses its constructor window and `fromInterval` / `fromEvent` factories; call `useSampleWindow(maxSampleWindowMillis)` and `clear()` from start. Old per-signal `snapshotHistoryMillis` is removed. Concrete built-in snapshot types are internal; use the public `LoadSnapshot` contract and `ConcurrencySystem.getCurrentStatus()`.
