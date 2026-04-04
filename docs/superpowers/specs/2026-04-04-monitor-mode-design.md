# Monitor Mode for BasicCrawler — Design Spec

**Date:** 2026-04-04
**Issue:** [#2680](https://github.com/apify/crawlee/issues/2680)
**Related PR:** [#2692](https://github.com/apify/crawlee/pull/2692) (reference only — implementation is fresh)

---

## Problem

When running a crawler locally, there is no real-time progress overview. Developers have to read scattered log lines to understand how fast the crawl is going, how much is left, and what the system load looks like. The `puppeteer-cluster` library had a monitor feature that was widely used and is missed after migrating to Crawlee.

---

## Goal

Add an opt-in `monitor` option to `BasicCrawler` that prints a compact, real-time status block to the terminal while crawling. It must not interfere with the existing logger output.

---

## Architecture

### New file: `packages/core/src/crawlers/monitor.ts`

A standalone `Monitor` class. It receives a `Statistics` instance and an optional `AutoscaledPool` instance, then on a configurable interval renders a status block to `process.stderr`.

Using `process.stderr` keeps it separate from the `@apify/log` output, which writes to `process.stdout` by default. This prevents the monitor from overwriting log lines.

When `process.stderr.isTTY` is `true` (interactive terminal), the monitor uses ANSI escape codes (`\x1b[{N}A\x1b[2K`) to overwrite its own previous output in-place. When not a TTY (CI, piped output), it falls back to plain newline-delimited prints so the output stays readable in logs.

**Class interface:**

```ts
export interface MonitorOptions {
    /** How often to refresh the monitor display. Default: 5 seconds. */
    intervalSecs?: number;
}

export class Monitor {
    constructor(
        private readonly stats: Statistics,
        private readonly autoscaledPool?: AutoscaledPool,
        private readonly options: MonitorOptions = {},
    ) {}

    start(): void;   // starts setInterval
    stop(): void;    // clears interval, erases last monitor block from terminal
}
```

**Rendered output format** (5 lines):

```
⏱  Start: 2024-01-01 10:00:00 | Running for 00:03:24
📊 Progress: 145/500 (29.0%) | Failed: 3 (2.1%) | Speed: 42 req/min
⏳ ETA: ~00:08:27
💻 CPU: 34% | Mem: 512 MB / 1.8 GB
🔀 Concurrency: 8/10 (desired: 10)
```

- **Total** is read from `requestManager.getTotalCount()` passed in via constructor (optional — shown as `?` when unknown)
- **Speed** is `requestsFinishedPerMinute` from `stats.calculate()`
- **ETA** is `(total - finished) / speed` in minutes, formatted as `HH:MM:SS`; shows `N/A` when total is unknown
- **CPU/Mem** is read from `autoscaledPool.systemStatus.getCurrentStatus()` when pool is available; shows `N/A` otherwise
- **Concurrency** reads `autoscaledPool.currentConcurrency` and `autoscaledPool.desiredConcurrency`

---

### Changes to `packages/basic-crawler/src/internals/basic-crawler.ts`

**1. Add option to `BasicCrawlerOptions`:**

```ts
/**
 * Enables monitor mode: a real-time status block printed to stderr during the crawl.
 * Only active when stderr is a TTY or when output is plain (CI-friendly fallback).
 * @default false
 */
monitor?: boolean;
```

This is a top-level option, not inside `experiments`. The feature is stable enough to warrant a direct option.

**2. Store it on the crawler:**

```ts
protected monitor: boolean;
// in constructor:
this.monitor = options.monitor ?? false;
```

**3. In `run()`**, alongside the existing `periodicLogger`:

```ts
const monitorInstance = this.monitor
    ? new Monitor(this.stats, this.autoscaledPool, { intervalSecs: 5 })
    : null;
monitorInstance?.start();

try {
    await this.autoscaledPool!.run();
} finally {
    monitorInstance?.stop();
    // ... existing teardown
}
```

**4. Export `Monitor` from `packages/core/src/crawlers/index.ts` and `packages/core/src/index.ts`.**

---

## Testing Strategy

### Unit tests — `test/core/crawlers/monitor.test.ts`

| Test | What it checks |
|---|---|
| Constructs without throwing | Basic instantiation |
| `start()` + `stop()` without error | Lifecycle works |
| Renders correct output with known stats | Format string correctness |
| Non-TTY mode prints plain lines (no ANSI) | CI-safe fallback |
| TTY mode uses ANSI overwrite codes | In-place refresh |
| ETA shows `N/A` when total is unknown | Edge case |
| Stop clears the interval | No memory leak |

Use `vitest.useFakeTimers()` to control the interval without real waiting.
Mock `process.stderr` with a writable stub to capture output without printing to real terminal.

### Integration tests — added to `test/core/crawlers/basic_crawler.test.ts`

| Test | What it checks |
|---|---|
| Crawler with `monitor: true` completes successfully | No crash, correct final stats returned |
| Crawler with `monitor: false` behaves identically | Option is inert when disabled |

---

## Non-goals

- No interactive keyboard controls (pause/resume via keypress) — out of scope
- No color themes or custom format strings — keep it simple for v1
- No new npm dependencies — implement with Node.js built-ins only

---

## Files Changed

| File | Change |
|---|---|
| `packages/core/src/crawlers/monitor.ts` | **New** — `Monitor` class |
| `packages/core/src/crawlers/index.ts` | Export `Monitor` |
| `packages/core/src/index.ts` | Re-export `Monitor` |
| `packages/basic-crawler/src/internals/basic-crawler.ts` | Add `monitor` option, instantiate `Monitor` in `run()` |
| `test/core/crawlers/monitor.test.ts` | **New** — unit tests |
| `test/core/crawlers/basic_crawler.test.ts` | Add integration tests |
