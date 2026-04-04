# Monitor Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in `monitor: true` option to `BasicCrawler` that prints a compact real-time status block to `process.stderr` during a crawl run.

**Architecture:** A new `Monitor` class in `packages/core` reads from the `Statistics` instance (for progress/speed) and uses Node.js `os` and `process` built-ins (for CPU/memory). It writes a fixed-height block to `process.stderr` using ANSI escape codes to overwrite itself in TTY mode, falling back to plain newlines in non-TTY mode. `BasicCrawler.run()` instantiates `Monitor` (after `_init()`) when `monitor: true`, starts it, and stops it in the `finally` block.

**Tech Stack:** TypeScript, Node.js built-ins (`os`, `process`), Vitest (tests), `@crawlee/core`, `@crawlee/basic`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/core/src/crawlers/monitor.ts` | **Create** | `Monitor` class — renders status block to stderr |
| `packages/core/src/crawlers/index.ts` | **Modify** | Export `Monitor` |
| `packages/core/src/index.ts` | No change needed | Already re-exports `./crawlers` with `export *` |
| `packages/basic-crawler/src/internals/basic-crawler.ts` | **Modify** | Add `monitor` option, instantiate `Monitor` in `run()` |
| `test/core/crawlers/monitor.test.ts` | **Create** | Unit tests for `Monitor` class |
| `test/core/crawlers/basic_crawler.test.ts` | **Modify** | Integration tests: crawler with `monitor: true` completes ok |

---

## Task 1: Create the `Monitor` class

**Files:**
- Create: `packages/core/src/crawlers/monitor.ts`

### Background

`Statistics.state` has:
- `requestsFinished: number`
- `requestsFailed: number`
- `crawlerStartedAt: Date | string | null`

`Statistics.calculate()` returns:
- `requestsFinishedPerMinute: number`

`requestManager` lives on `BasicCrawler`, not on `Statistics`. To display `total`, we pass it as a separate parameter.

For CPU/Mem we use Node.js built-ins only — no dependency on `AutoscaledPool` internals.

`AutoscaledPool` exposes:
- `currentConcurrency: number` (getter)
- `desiredConcurrency: number` (getter)
- `maxConcurrency: number` (getter)

- [ ] **Step 1: Create `packages/core/src/crawlers/monitor.ts` with this exact content:**

```typescript
import os from 'node:os';

import type { AutoscaledPool } from '../autoscaling/autoscaled_pool';
import type { Statistics } from './statistics';

export interface MonitorOptions {
    /**
     * How often to refresh the monitor display, in seconds.
     * @default 5
     */
    intervalSecs?: number;
}

const MONITOR_LINE_COUNT = 5;

function padStart(n: number, width = 2): string {
    return String(n).padStart(width, '0');
}

function formatDuration(ms: number): string {
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${padStart(h)}:${padStart(m)}:${padStart(s)}`;
}

function formatBytes(bytes: number): string {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
}

/**
 * Renders a compact real-time status block to `process.stderr` during a crawl.
 *
 * Enable via the `monitor` option on `BasicCrawler`:
 * ```ts
 * const crawler = new BasicCrawler({ monitor: true, ... });
 * ```
 *
 * In TTY mode the block overwrites itself in-place. In non-TTY mode (CI, pipes)
 * it prints plain lines so the output remains readable in logs.
 */
export class Monitor {
    private intervalId?: ReturnType<typeof setInterval>;
    private readonly intervalMs: number;
    private rendered = false;

    constructor(
        private readonly stats: Statistics,
        private readonly autoscaledPool?: AutoscaledPool,
        private readonly options: MonitorOptions = {},
        private readonly totalRequests?: () => number | undefined,
    ) {
        this.intervalMs = (options.intervalSecs ?? 5) * 1000;
    }

    /** Starts the periodic display. */
    start(): void {
        this.intervalId = setInterval(() => this.render(), this.intervalMs);
    }

    /** Stops the periodic display and clears the last rendered block from the terminal. */
    stop(): void {
        if (this.intervalId !== undefined) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        if (this.rendered && process.stderr.isTTY) {
            // Move up MONITOR_LINE_COUNT lines and clear each one
            for (let i = 0; i < MONITOR_LINE_COUNT; i++) {
                process.stderr.write('\x1b[1A\x1b[2K');
            }
            this.rendered = false;
        }
    }

    /** Builds and returns the status block as an array of lines. Exposed for testing. */
    buildLines(): string[] {
        const { state } = this.stats;
        const calculated = this.stats.calculate();

        const startedAt = state.crawlerStartedAt ? new Date(state.crawlerStartedAt) : new Date();
        const now = new Date();
        const elapsed = now.getTime() - startedAt.getTime();

        const finished = state.requestsFinished;
        const failed = state.requestsFailed;
        const total = this.totalRequests?.();
        const speed = calculated.requestsFinishedPerMinute;

        const progressStr = total != null
            ? `${finished}/${total} (${((finished / total) * 100).toFixed(1)}%)`
            : `${finished}/? (?%)`;

        const failedPct = finished + failed > 0
            ? ` | Failed: ${failed} (${((failed / (finished + failed)) * 100).toFixed(1)}%)`
            : '';

        let etaStr = 'N/A';
        if (total != null && speed > 0) {
            const remaining = total - finished;
            const etaMs = (remaining / speed) * 60 * 1000;
            etaStr = `~${formatDuration(etaMs)}`;
        }

        const memInfo = process.memoryUsage();
        const totalMem = os.totalmem();
        const usedMem = totalMem - os.freemem();
        const cpus = os.cpus();
        const cpuLoad = os.loadavg()[0];
        const cpuPct = cpus.length > 0 ? Math.min(100, (cpuLoad / cpus.length) * 100).toFixed(0) : '?';

        const concurrency = this.autoscaledPool
            ? `${this.autoscaledPool.currentConcurrency}/${this.autoscaledPool.maxConcurrency} (desired: ${this.autoscaledPool.desiredConcurrency})`
            : 'N/A';

        return [
            `\u23F1  Start: ${startedAt.toLocaleTimeString()} | Running for ${formatDuration(elapsed)}`,
            `\uD83D\uDCCA Progress: ${progressStr}${failedPct} | Speed: ${speed} req/min`,
            `\u23F3 ETA: ${etaStr}`,
            `\uD83D\uDCBB CPU: ${cpuPct}% | Mem: ${formatBytes(memInfo.rss)} process / ${formatBytes(usedMem)} / ${formatBytes(totalMem)} total`,
            `\uD83D\uDD00 Concurrency: ${concurrency}`,
        ];
    }

    private render(): void {
        const lines = this.buildLines();

        if (process.stderr.isTTY && this.rendered) {
            // Move cursor up to overwrite previous block
            process.stderr.write(`\x1b[${MONITOR_LINE_COUNT}A`);
        }

        for (const line of lines) {
            if (process.stderr.isTTY) {
                // Clear line then write
                process.stderr.write(`\x1b[2K${line}\n`);
            } else {
                process.stderr.write(`${line}\n`);
            }
        }

        this.rendered = true;
    }
}
```

- [ ] **Step 2: Run TypeScript check to verify the file compiles**

```bash
cd packages/core && yarn tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing unrelated errors).

---

## Task 2: Export `Monitor` from `@crawlee/core`

**Files:**
- Modify: `packages/core/src/crawlers/index.ts`

- [ ] **Step 1: Add export to `packages/core/src/crawlers/index.ts`**

Current content of file:
```typescript
export * from './crawler_commons';
export * from './crawler_extension';
export * from './crawler_utils';
export * from './statistics';
export * from './error_tracker';
export * from './error_snapshotter';
```

Add one line at the end:
```typescript
export * from './crawler_commons';
export * from './crawler_extension';
export * from './crawler_utils';
export * from './statistics';
export * from './error_tracker';
export * from './error_snapshotter';
export * from './monitor';
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd packages/core && yarn tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/crawlers/monitor.ts packages/core/src/crawlers/index.ts
git commit -m "feat: add Monitor class to @crawlee/core"
```

---

## Task 3: Write unit tests for `Monitor`

**Files:**
- Create: `test/core/crawlers/monitor.test.ts`

### Background

- `Statistics` is imported from `@crawlee/core`
- We use `vitest.useFakeTimers()` to control `setInterval` without real waiting
- We mock `process.stderr` by replacing `process.stderr.write` with a `vi.fn()` stub
- We mock `process.stderr.isTTY` using `Object.defineProperty`

- [ ] **Step 1: Write the failing tests in `test/core/crawlers/monitor.test.ts`**

```typescript
import os from 'node:os';

import { Configuration, Statistics } from '@crawlee/core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { Monitor } from '../../../packages/core/src/crawlers/monitor';
import { MemoryStorageEmulator } from '../../shared/MemoryStorageEmulator';

describe('Monitor', () => {
    const localStorageEmulator = new MemoryStorageEmulator();

    beforeEach(async () => {
        await localStorageEmulator.init();
        vi.useFakeTimers();
    });

    afterEach(async () => {
        await localStorageEmulator.destroy();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('constructs without throwing', () => {
        const stats = new Statistics();
        expect(() => new Monitor(stats)).not.toThrow();
    });

    test('start() and stop() do not throw', () => {
        const stats = new Statistics();
        const monitor = new Monitor(stats);
        expect(() => monitor.start()).not.toThrow();
        expect(() => monitor.stop()).not.toThrow();
    });

    test('stop() before start() does not throw', () => {
        const stats = new Statistics();
        const monitor = new Monitor(stats);
        expect(() => monitor.stop()).not.toThrow();
    });

    test('buildLines() returns 5 lines', () => {
        const stats = new Statistics();
        const monitor = new Monitor(stats);
        const lines = monitor.buildLines();
        expect(lines).toHaveLength(5);
    });

    test('buildLines() shows finished/total and percentage when total is known', () => {
        const stats = new Statistics();
        stats.startJob('r1');
        stats.finishJob('r1', 0);

        const monitor = new Monitor(stats, undefined, {}, () => 10);
        const lines = monitor.buildLines();

        expect(lines[1]).toContain('1/10');
        expect(lines[1]).toContain('10.0%');
    });

    test('buildLines() shows ? when total is unknown', () => {
        const stats = new Statistics();
        const monitor = new Monitor(stats);
        const lines = monitor.buildLines();

        expect(lines[1]).toContain('/?');
    });

    test('buildLines() shows ETA as N/A when total is unknown', () => {
        const stats = new Statistics();
        const monitor = new Monitor(stats);
        const lines = monitor.buildLines();

        expect(lines[2]).toContain('N/A');
    });

    test('buildLines() shows concurrency info when autoscaledPool is provided', () => {
        const stats = new Statistics();
        const fakePool = {
            currentConcurrency: 3,
            desiredConcurrency: 5,
            maxConcurrency: 10,
        } as any;

        const monitor = new Monitor(stats, fakePool);
        const lines = monitor.buildLines();

        expect(lines[4]).toContain('3/10');
        expect(lines[4]).toContain('desired: 5');
    });

    test('buildLines() shows N/A for concurrency when autoscaledPool is not provided', () => {
        const stats = new Statistics();
        const monitor = new Monitor(stats);
        const lines = monitor.buildLines();

        expect(lines[4]).toContain('N/A');
    });

    test('renders to stderr when interval fires', () => {
        const writeStub = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const stats = new Statistics();
        const monitor = new Monitor(stats, undefined, { intervalSecs: 1 });

        monitor.start();
        vi.advanceTimersByTime(1000);
        monitor.stop();

        expect(writeStub).toHaveBeenCalled();
    });

    test('in non-TTY mode, does not write ANSI overwrite codes', () => {
        const writes: string[] = [];
        vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
            writes.push(String(chunk));
            return true;
        });
        Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true });

        const stats = new Statistics();
        const monitor = new Monitor(stats, undefined, { intervalSecs: 1 });

        monitor.start();
        vi.advanceTimersByTime(1000);
        monitor.stop();

        const combined = writes.join('');
        // Should not contain ANSI cursor-up code
        expect(combined).not.toContain('\x1b[5A');
        expect(combined).not.toContain('\x1b[2K');
    });

    test('in TTY mode, second render writes ANSI cursor-up to overwrite', () => {
        const writes: string[] = [];
        vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
            writes.push(String(chunk));
            return true;
        });
        Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });

        const stats = new Statistics();
        const monitor = new Monitor(stats, undefined, { intervalSecs: 1 });

        monitor.start();
        vi.advanceTimersByTime(1000); // first render
        vi.advanceTimersByTime(1000); // second render — should have cursor-up
        monitor.stop();

        const combined = writes.join('');
        expect(combined).toContain('\x1b[5A');
    });
});
```

- [ ] **Step 2: Run the tests to verify they FAIL (Monitor doesn't exist yet relative to test path)**

```bash
cd "$(git rev-parse --show-toplevel)" && yarn vitest run test/core/crawlers/monitor.test.ts 2>&1 | tail -20
```

Expected: tests fail because `Monitor` import path may need adjustment, or type errors.

> **Note:** If the import `from '../../../packages/core/src/crawlers/monitor'` resolves correctly (check tsconfig paths in `test/tsconfig.json`), the tests may pass after Task 1. If not, adjust the import to `from '@crawlee/core'` after the build.

- [ ] **Step 3: Check test tsconfig to see how other core internals are imported in tests**

```bash
cat test/core/crawlers/statistics.test.ts | head -5
```

If statistics is imported from `'@crawlee/core'`, change the monitor import similarly:

```typescript
import { Monitor } from '@crawlee/core';
```

Then re-run:

```bash
yarn vitest run test/core/crawlers/monitor.test.ts 2>&1 | tail -20
```

Expected: tests PASS (after Task 1 and Task 2 are done).

- [ ] **Step 4: Commit**

```bash
git add test/core/crawlers/monitor.test.ts
git commit -m "test: add unit tests for Monitor class"
```

---

## Task 4: Integrate `Monitor` into `BasicCrawler`

**Files:**
- Modify: `packages/basic-crawler/src/internals/basic-crawler.ts`

### Background

The `run()` function is around line 979 in `basic-crawler.ts`. The structure is:

```typescript
async run(...) {
    // ...setup...
    await this._init();
    await this.stats.startCapturing();
    const periodicLogger = this.getPeriodicLogger();
    // ...
    try {
        await this.autoscaledPool!.run();
    } finally {
        await this.teardown();
        // ...
        periodicLogger.stop();
        // ...
    }
}
```

`this.autoscaledPool` is assigned inside `this._init()`, so it's available after `_init()`.

`this.requestManager` is also available after `_init()`.

- [ ] **Step 1: Add `monitor` to imports from `@crawlee/core`**

In `packages/basic-crawler/src/internals/basic-crawler.ts`, find the import block from `@crawlee/core` (around line 31). Add `Monitor` and `MonitorOptions` to it:

```typescript
import {
    AutoscaledPool,
    Configuration,
    CriticalError,
    Dataset,
    enqueueLinks,
    EnqueueStrategy,
    EventType,
    GotScrapingHttpClient,
    KeyValueStore,
    mergeCookies,
    Monitor,
    NonRetryableError,
    purgeDefaultStorages,
    RequestListAdapter,
    RequestManagerTandem,
    RequestProvider,
    RequestQueue,
    // ... rest of existing imports
} from '@crawlee/core';
```

- [ ] **Step 2: Add `monitor` option to `BasicCrawlerOptions` interface**

Find the `BasicCrawlerOptions` interface. It ends around the `statisticsOptions` and `httpClient` properties. Add after `httpClient`:

```typescript
/**
 * Enables monitor mode: a compact real-time status block printed to `process.stderr` during the crawl.
 *
 * In interactive terminals (TTY), the block overwrites itself in-place.
 * In non-TTY environments (CI, piped output), plain lines are printed instead.
 *
 * @default false
 * @example
 * ```ts
 * const crawler = new BasicCrawler({ monitor: true });
 * ```
 */
monitor?: boolean;
```

- [ ] **Step 3: Store `monitor` option in the constructor and add `ow` validation**

Find the `ow` validation block in the constructor (around line 590–630). Add:

```typescript
monitor: ow.optional.boolean,
```

Find the destructuring of constructor options (around line 637–700). Add `monitor = false`:

```typescript
const {
    // ... existing destructuring ...
    monitor = false,
} = options;
```

Add a protected field on the class (near other protected fields around line 566):

```typescript
protected monitorEnabled: boolean;
```

And in the constructor body, assign it:

```typescript
this.monitorEnabled = monitor;
```

- [ ] **Step 4: Instantiate and run `Monitor` inside `run()`**

Find the `run()` method. After `const periodicLogger = this.getPeriodicLogger();` (around line 1033), add:

```typescript
const monitorInstance = this.monitorEnabled
    ? new Monitor(
          this.stats,
          this.autoscaledPool,
          { intervalSecs: 5 },
          () => this.requestManager?.getTotalCount(),
      )
    : null;
monitorInstance?.start();
```

In the `finally` block, before `periodicLogger.stop()`, add:

```typescript
monitorInstance?.stop();
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd "$(git rev-parse --show-toplevel)" && yarn tsc-check-tests 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add packages/basic-crawler/src/internals/basic-crawler.ts
git commit -m "feat: add monitor option to BasicCrawler"
```

---

## Task 5: Add integration tests to `basic_crawler.test.ts`

**Files:**
- Modify: `test/core/crawlers/basic_crawler.test.ts`

- [ ] **Step 1: Find a good `describe` block to add the new tests**

The file has a top-level `describe('BasicCrawler', ...)`. Add a new nested `describe` block at the end (before the closing `}`), after all existing `describe` blocks.

- [ ] **Step 2: Add the integration tests**

Add this block inside `describe('BasicCrawler', ...)`:

```typescript
describe('monitor option', () => {
    test('crawler with monitor: true completes successfully and returns final stats', async () => {
        const requestList = await RequestList.open(null, [
            `http://${HOSTNAME}:${port}/`,
        ]);

        const crawler = new BasicCrawler({
            requestList,
            monitor: true,
            async requestHandler() {
                // no-op
            },
        });

        const stats = await crawler.run();

        expect(stats.requestsFinished).toBe(1);
        expect(stats.requestsFailed).toBe(0);
    });

    test('crawler with monitor: false behaves the same as without the option', async () => {
        const requestList = await RequestList.open(null, [
            `http://${HOSTNAME}:${port}/`,
        ]);

        const crawler = new BasicCrawler({
            requestList,
            monitor: false,
            async requestHandler() {
                // no-op
            },
        });

        const stats = await crawler.run();

        expect(stats.requestsFinished).toBe(1);
        expect(stats.requestsFailed).toBe(0);
    });
});
```

> **Note:** The `HOSTNAME`, `port`, and `server` variables are already defined in the outer `describe('BasicCrawler', ...)` scope, set up in `beforeAll`. The URL `http://${HOSTNAME}:${port}/` returns a valid response (`app.get('/', ...)` is already defined near the top of the file).

- [ ] **Step 3: Run the integration tests**

```bash
cd "$(git rev-parse --show-toplevel)" && yarn vitest run test/core/crawlers/basic_crawler.test.ts 2>&1 | tail -30
```

Expected: all tests pass (including the new ones).

- [ ] **Step 4: Run the full unit test suite for monitor**

```bash
cd "$(git rev-parse --show-toplevel)" && yarn vitest run test/core/crawlers/monitor.test.ts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Run the full TypeScript check one last time**

```bash
cd "$(git rev-parse --show-toplevel)" && yarn tsc-check-tests 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add test/core/crawlers/basic_crawler.test.ts
git commit -m "test: add integration tests for BasicCrawler monitor option"
```

---

## Self-Review Checklist

### Spec coverage

| Spec requirement | Task that covers it |
|---|---|
| New `Monitor` class in `packages/core/src/crawlers/monitor.ts` | Task 1 |
| Reads `Statistics` for progress/speed | Task 1 — `stats.state` + `stats.calculate()` |
| Shows start time, elapsed, progress, ETA, CPU, mem, concurrency | Task 1 — `buildLines()` |
| Writes to `process.stderr` | Task 1 — `render()` uses `process.stderr.write` |
| TTY: in-place overwrite with ANSI codes | Task 1 — `render()` |
| Non-TTY: plain newline fallback | Task 1 — `render()` checks `isTTY` |
| Export from `@crawlee/core` | Task 2 |
| `monitor?: boolean` option on `BasicCrawlerOptions` | Task 4 Step 2 |
| Instantiated in `run()` after `_init()` | Task 4 Step 4 |
| Stopped in `finally` block | Task 4 Step 4 |
| Unit tests for `Monitor` | Task 3 |
| Integration tests for `BasicCrawler` | Task 5 |

All requirements covered. ✅

### Placeholder scan

No TBD/TODO or vague instructions. All code steps contain complete implementations. ✅

### Type consistency

- `Monitor` constructor signature defined in Task 1 and referenced in Task 4 — parameters match (`stats`, `autoscaledPool`, `options`, `totalRequests`).
- `buildLines()` defined in Task 1 and tested in Task 3 — name matches.
- `MonitorOptions.intervalSecs` defined in Task 1, used in Task 4 — consistent.
- `autoscaledPool.currentConcurrency`, `.desiredConcurrency`, `.maxConcurrency` — verified as public getters from codebase exploration. ✅
