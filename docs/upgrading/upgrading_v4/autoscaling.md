---
id: autoscaling
title: 'Upgrading to v4: autoscaling'
sidebar_label: Autoscaling
sidebar_position: 8
slug: /upgrading/upgrading-to-v4/autoscaling
---

The `minConcurrency` / `maxConcurrency` / `maxRequestsPerMinute` crawler options work as before. This section matters when you used `autoscaledPoolOptions`, drove an `AutoscaledPool` directly, or configured snapshotting and system status. This page is part of the [Upgrading to v4](./upgrading_v4.md) guide.

## Autoscaling moved to `ConcurrencySystem`

Everything that decides whether there is free compute for one more task — snapshotting, the system-status evaluation, the concurrency budget and the scaling logic — moved out of `AutoscaledPool` into a new `ConcurrencySystem`. What is left of the pool is a bare task loop, which is now **internal**: crawlers build and drive one for themselves, and `ConcurrencySystem` is the only part of this you configure.

The point is sharing: inject one instance into several crawlers to cap their **combined** concurrency against a single budget, instead of letting each scale independently and oversubscribe the host. The option is typed as `IConcurrencySystem`, a minimal read-only contract, so an alternative governor can be substituted; `ConcurrencySystem` is the canonical implementation and the one crawlers build by default.

:::info Who starts and stops it

Whoever *builds* a `ConcurrencySystem` owns its lifecycle. Crawlers do that for the default system they build per run. One **you** supply is yours to `start()` and `stop()`, because no crawler can know when the last borrower has finished. Forgetting to start it makes `run()` **throw**; stopping it while a crawler is still running only **warns**. Read `isRunning` to check whether a system handed to you was already started by its owner.

:::

Every migration below has the same shape — build, start, run, stop:

```typescript
import { CheerioCrawler, ConcurrencySystem } from 'crawlee';

const concurrencySystem = new ConcurrencySystem({ maxConcurrency: 20 });
await concurrencySystem.start();

// One crawler, or several: a shared instance caps their combined concurrency.
const a = new CheerioCrawler({ concurrencySystem, requestHandler });
const b = new CheerioCrawler({ concurrencySystem, requestHandler });

try {
    await Promise.all([a.run(), b.run()]);
} finally {
    await concurrencySystem.stop();
}
```

On Node.js 24, `await using` replaces the `try`/`finally` — see [collaborators you own are disposable](./upgrading_v4.md#collaborators-you-own-are-disposable).

### `AutoscaledPool` is no longer public API

`AutoscaledPool` is `@internal` in v4, along with `AutoscaledPoolOptions`. It is still exported from `@crawlee/basic` (and re-exported by `crawlee`), so nothing breaks at import time — but with all the configuration moved to the `ConcurrencySystem`, what remains is a bare parallel task runner. It can change without a major bump, so avoid depending on it; if you only wanted bounded parallelism, a `p-limit`-style helper is a better fit than an internal Crawlee class.

The crawler's `autoscaledPool` property is **private** as a result. Everything it was reached for has a crawler-level counterpart:

| Before | After |
|---|---|
| `await crawler.autoscaledPool.pause(secs)` | `await crawler.pause(secs)` |
| `crawler.autoscaledPool.resume()` | `crawler.resume()` |
| `await crawler.autoscaledPool.abort()` | `await crawler.teardown()` — or `crawler.stop()`, to let in-flight requests finish |
| `crawler.autoscaledPool.system` | `crawler.concurrencySystem` |
| `crawler.autoscaledPool.desiredConcurrency` | `crawler.concurrencySystem?.desiredConcurrency` |
| `crawler.autoscaledPool.currentConcurrency` | `crawler.concurrencySystem?.currentConcurrency` |

```typescript
const crawler = new CheerioCrawler({
    async requestHandler({ log }) {
        log.info(`Currently running ${crawler.concurrencySystem?.currentConcurrency} requests in parallel.`);
    },
});
```

`crawler.concurrencySystem` is `undefined` until `run()` has resolved it, and a crawler-owned default is rebuilt for every run — so read it during a run rather than caching it across runs. A system *you* injected is simply the instance you passed in.

The getter is typed as the read-only `IConcurrencySystem` and has no setters, so retuning concurrency mid-crawl means owning the instance:

```typescript
const concurrencySystem = new ConcurrencySystem({ maxConcurrency: 50 });

const crawler = new CheerioCrawler({
    concurrencySystem,
    requestHandler,
    errorHandler: async ({ response }) => {
        if (response?.status === 429) concurrencySystem.maxConcurrency = 10;
    },
});
```

`crawler.pause()` resolves once the requests already in flight have settled, and leaves `run()` pending until you `resume()` — unlike `crawler.stop()`, which ends the run gracefully. One behavioral consequence of the split: pausing no longer suspends autoscaling, because the autoscaling interval belongs to the `ConcurrencySystem`, which knows nothing about its borrowers' pause state — deliberately, since other crawlers sharing it may still need scaling. A paused crawler's system keeps evaluating (and possibly scaling down) the desired concurrency and keeps emitting its periodic state log. Scaling *up* stays effectively blocked, as the current concurrency drains below the ratio required for a scale-up. To silence the system during a long pause, `stop()` it (if you own it) and `start()` it again before resuming; a restart discards the snapshots taken before it, so the pause is not mistaken for load.

#### If you were driving an `AutoscaledPool` directly

All scaling and load-monitoring options were **removed** from `AutoscaledPoolOptions` and now live on `ConcurrencySystemOptions`: `minConcurrency`, `maxConcurrency`, `desiredConcurrency`, `desiredConcurrencyRatio`, `scaleUpStepRatio`, `scaleDownStepRatio`, `loggingIntervalSecs`, `autoscaleIntervalSecs`, and `maxTasksPerMinute`, plus the load-signal configuration described [below](#load-signal-options-restructured). The `snapshotterOptions` and `systemStatusOptions` bags are both gone, as are the `minConcurrency`/`maxConcurrency` accessors and every setter (`desiredConcurrency`, `currentConcurrency` and `system` remain as read-only getters). In their place, `AutoscaledPoolOptions` gained a **required** `concurrencySystem`, plus a **required** `consumer` — the pool's identity (`{ id }`), which it presents to the governor on every capacity query and booking so that a shared one can tell several pools' tasks apart.

**Before:**
```typescript
const pool = new AutoscaledPool({
    minConcurrency: 5,
    maxConcurrency: 50,
    maxTasksPerMinute: 120,
    runTaskFunction: async () => { /* ... */ },
    isTaskReadyFunction: async () => true,
    isFinishedFunction: async () => false,
});
await pool.run();
```

**After:**
```typescript
import { AutoscaledPool, ConcurrencySystem } from '@crawlee/basic';

const concurrencySystem = new ConcurrencySystem({
    minConcurrency: 5,
    maxConcurrency: 50,
    maxTasksPerMinute: 120,
});
await concurrencySystem.start();

const pool = new AutoscaledPool({
    concurrencySystem,
    consumer: { id: 'my-pool' },
    runTaskFunction: async () => { /* ... */ },
    isTaskReadyFunction: async () => true,
    isFinishedFunction: async () => false,
});

try {
    await pool.run();
} finally {
    await concurrencySystem.stop();
}
```

### `autoscaledPoolOptions` is now `taskLoopOptions`, and no longer carries concurrency config

The crawler option was renamed — it was named after a class that is now internal — and narrowed to **only** the task-loop predicates `isFinishedFunction` and `isTaskReadyFunction`. Its type changed from `AutoscaledPoolOptions` to `TaskLoopPredicates`. Concurrency configuration goes through either the `minConcurrency` / `maxConcurrency` / `maxRequestsPerMinute` shortcuts (which configure the crawler's default `ConcurrencySystem`), or — for anything finer — a supplied `concurrencySystem`.

Three options that used to live here — `maybeRunIntervalSecs`, `taskTimeoutSecs` and `log` — did *not* move to the `ConcurrencySystem` and have no replacement: the crawler's task-loop cadence is no longer configurable.

**Before:**
```typescript
const crawler = new CheerioCrawler({
    autoscaledPoolOptions: {
        desiredConcurrency: 10,
        maxTasksPerMinute: 120,
        systemStatusOptions: { currentHistorySecs: 10 },
    },
    requestHandler,
});
```

**After:**
```typescript
const concurrencySystem = new ConcurrencySystem({
    desiredConcurrency: 10,
    maxTasksPerMinute: 120,
    currentHistorySecs: 10,
});

const crawler = new CheerioCrawler({ concurrencySystem, requestHandler });
```

The shortcuts cannot be combined with a supplied `concurrencySystem` — they configure the default system that a supplied one replaces, so the crawler constructor **throws** rather than dropping a limit you asked for. For the common case, the shortcuts are all you need and no `ConcurrencySystem` is involved:

```typescript
const crawler = new CheerioCrawler({
    minConcurrency: 5,
    maxConcurrency: 50,
    maxRequestsPerMinute: 120,
    requestHandler,
});
```

A supplied system also replaces the default *wholesale*, including any crawler-specific tuning that default carried. `HttpCrawler` and its subclasses (`CheerioCrawler`, `JSDOMCrawler`, …) ship a preset — a higher `desiredConcurrency` and a relaxed event loop signal — exported as `HTTP_OPTIMIZED_CONCURRENCY_SYSTEM_OPTIONS`; spread it in to keep it:

```typescript
import { ConcurrencySystem, HTTP_OPTIMIZED_CONCURRENCY_SYSTEM_OPTIONS } from 'crawlee';

const concurrencySystem = new ConcurrencySystem({
    ...HTTP_OPTIMIZED_CONCURRENCY_SYSTEM_OPTIONS,
    maxConcurrency: 50,
});
```

## Load-signal options restructured

The per-resource load-signal configuration was consolidated. It used to be spread across flat `SnapshotterOptions` fields, the `max*OverloadedRatio` options on `SystemStatusOptions`, and a separate `loadSignals` array — three places, two of them named after classes that are now internal. All of it now lives in a single `loadSignals` bag on `ConcurrencySystemOptions`: one options bag per built-in signal (each carrying its own limits *and* its `overloadedRatio`), plus `custom` for your own implementations.

**Before:**
```typescript
new AutoscaledPool({
    snapshotterOptions: {
        maxUsedMemoryRatio: 0.8,
        eventLoopSnapshotIntervalSecs: 2,
        maxBlockedMillis: 100,
        clientSnapshotIntervalSecs: 1,
        maxClientErrors: 3,
        snapshotHistorySecs: 60,
    },
    systemStatusOptions: {
        maxMemoryOverloadedRatio: 0.2,
        maxEventLoopOverloadedRatio: 0.7,
        maxCpuOverloadedRatio: 0.4,
        maxClientOverloadedRatio: 0.3,
        currentHistorySecs: 10,
        loadSignals: [myProxyHealthSignal],
    },
    // ...
});
```

**After:**
```typescript
new ConcurrencySystem({
    loadSignals: {
        memory: { maxUsedRatio: 0.8, overloadedRatio: 0.2 },
        eventLoop: { snapshotIntervalSecs: 2, maxBlockedMillis: 100, overloadedRatio: 0.7 },
        cpu: { overloadedRatio: 0.4 },
        storageBackend: { snapshotIntervalSecs: 1, maxErrors: 3, overloadedRatio: 0.3 },
        custom: [myProxyHealthSignal],
    },
    // the two evaluation windows are policy, alongside the scaling options
    snapshotHistorySecs: 60,
    currentHistorySecs: 10,
});
```

The signal that watches storage rate-limit errors follows the [`StorageClient` → `StorageBackend` rename](./storage_backends.md#storagebackend-interface-simplified): the option is `loadSignals.storageBackend`, the class `StorageBackendLoadSignal`, and its verdict is reported as `SystemInfo.storageBackendInfo`. The type of that verdict, `ClientInfo`, is now `LoadSignalInfo` — it backs every signal's entry, not just this one.

In detail: the four `max*OverloadedRatio` options of `SystemStatusOptions` were **removed** (each signal now owns its overload ratio, set in its own bag), custom signals moved from `systemStatusOptions.loadSignals` to `loadSignals.custom`, and the two evaluation windows — `snapshotHistorySecs` (autoscaling) and `currentHistorySecs` (task gating) — are plain options on `ConcurrencySystemOptions`, since they apply to every signal alike rather than to any one of them.

Two related capabilities are new, and covered in the [scaling guide](../../guides/scaling_crawlers.mdx#load-signals): a built-in signal can be switched **off** with `false`, and each built-in is also a public class (`MemoryLoadSignal`, `EventLoopLoadSignal`, `CpuLoadSignal`, `StorageBackendLoadSignal`) you can construct to wrap or adapt.

A duplicate signal name now **throws**, where naming a custom signal after a built-in (`memInfo`, `eventLoopInfo`, `cpuInfo`, `storageBackendInfo`) used to look like an override but never was one: the built-in kept running and kept holding concurrency down, while your signal only overwrote its field in the reported `SystemInfo`. To take a built-in's place, switch it off:

```typescript
new ConcurrencySystem({
    loadSignals: {
        // Without `memory: false`, this throws — the built-in memory signal is still enabled.
        memory: false,
        custom: [myMemorySignal], // free to take over the vacated `memInfo` field
    },
});
```

`Snapshotter` and `SystemStatus` are no longer public API, along with `SnapshotterOptions` and `SystemStatusOptions` — they are implementation details of the `ConcurrencySystem`, which is now the only supported entry point to load monitoring; read the resulting `SystemInfo` through `ConcurrencySystem.getCurrentStatus()`. Still public: the configuration types, the four built-in signal classes, and the extension surface (`LoadSignal`, `SnapshotStore`, `LoadSignalStartContext`). The concrete snapshot types the built-ins produce are *not* — `getSample()` returns plain `LoadSnapshot` values.

### Both evaluation windows are now requested from every signal

Overload is evaluated over two windows: `currentHistorySecs` (default 5s) gates whether another task may start, and `snapshotHistorySecs` (default 30s) drives autoscaling. The long one used to be implicit — `getHistoricalStatus()` asked each signal for *everything it had retained*, so a custom signal keeping five minutes of snapshots silently made autoscaling reason over five minutes of history for that resource while the built-ins used 30 seconds. Both are now requested explicitly from every signal, and `LoadSignal.start()` receives the wider of the two as `maxSampleWindowMillis` so retention can be sized to match.

You are affected if a custom signal retains **more** history than `snapshotHistorySecs` (its stale snapshots no longer influence scaling), or if its `getSample()` ignores the `sampleDurationMillis` argument, in which case it still contributes everything it has. On the API side, `snapshotHistoryMillis` was removed from the per-signal option types and `SnapshotStore` lost both its constructor argument and the `fromInterval`/`fromEvent` factories; call `useSampleWindow(maxSampleWindowMillis)` and `clear()` from your `start()` instead, as a store that is never given a window retains everything. The [scaling guide](../../guides/scaling_crawlers.mdx#load-signals) has a worked example.
