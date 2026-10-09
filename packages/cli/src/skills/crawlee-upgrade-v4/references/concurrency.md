# Concurrency

Keep crawler `minConcurrency`, `maxConcurrency` and `maxRequestsPerMinute` for ordinary limits. Rename `autoscaledPoolOptions` to `taskLoopOptions`, retaining only `isFinishedFunction` / `isTaskReadyFunction`. Move scaling settings into `ConcurrencySystem`.

## Lifecycle and controls

A supplied system replaces the default, rejects crawler concurrency shortcuts, and requires owner-managed `start()` / `stop()`. Preserve HTTP tuning when needed:

```ts
const system = new ConcurrencySystem({
    ...HTTP_OPTIMIZED_CONCURRENCY_SYSTEM_OPTIONS,
    maxConcurrency: 50,
});
await system.start();
try {
    await new CheerioCrawler({ concurrencySystem: system, requestHandler }).run(urls);
} finally {
    await system.stop();
}
```

Move `desiredConcurrency`, `desiredConcurrencyRatio`, scaling ratios, logging/autoscale intervals and `maxTasksPerMinute` to the system. Task-loop `maybeRunIntervalSecs`, `taskTimeoutSecs` and `log` have no replacement.

Replace private `crawler.autoscaledPool` access with `crawler.pause(secs)`, `resume()`, `teardown()` or graceful `stop()`. Read concurrency through `crawler.concurrencySystem`, which is undefined outside a run and typed as read-only `IConcurrencySystem`. To retune it, retain your constructed instance. Do not cache crawler-owned systems across runs.

Pause drains requests but leaves `run()` pending and autoscaling active. Stop ends the run. If you stop an owned system during a pause, restart it before resuming.

`AutoscaledPool`, `Snapshotter` and `SystemStatus` remain exported but are internal. Use `ConcurrencySystem` for load monitoring. Direct internal pools now require `concurrencySystem` and `consumer: { id }`.

## Load signals

Move snapshotter/system-status options into `ConcurrencySystemOptions.loadSignals`:

| Signal | Settings |
| --- | --- |
| `memory` | `maxUsedRatio`, `overloadedRatio`, sampling options |
| `eventLoop` | `snapshotIntervalSecs`, `maxBlockedMillis`, `overloadedRatio` |
| `cpu` | Sampling options, `overloadedRatio` |
| `storageBackend` | Former client settings: `maxErrors`, sampling options, `overloadedRatio` |
| `custom` | Former custom signal array |

Keep `snapshotHistorySecs` / `currentHistorySecs` at system level. Rename `ClientInfo` to `LoadSignalInfo`, `SystemInfo.clientInfo` to `storageBackendInfo`, and the client signal class to `StorageBackendLoadSignal`. Duplicate names throw; disable a built-in with `false` before replacing it.

Custom signals must honor `getSample(sampleDurationMillis)`. In `start()`, use `maxSampleWindowMillis` with `SnapshotStore.useSampleWindow()` and `clear()`. Remove per-signal `snapshotHistoryMillis`, the store's constructor window and `fromInterval` / `fromEvent` factories. Use public `LoadSnapshot` and `ConcurrencySystem.getCurrentStatus()` instead of internal concrete snapshots.
