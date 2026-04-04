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
        options: MonitorOptions = {},
        private readonly totalRequests?: () => number | undefined,
    ) {
        this.intervalMs = (options.intervalSecs ?? 5) * 1000;
    }

    /** Starts the periodic display. Renders an initial frame immediately, then repeats on each interval. */
    start(): void {
        this.render(); // render immediately so short crawls always show output
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
        // getTotalCount() on RequestManagerTandem may be an approximate sum
        // of the underlying RequestList + RequestQueue. The plan treats this as a best-effort
        // estimate: progress % and ETA are shown when total > 0, hidden when total === 0.
        // This matches the existing behaviour in PR #2692 and is acceptable for a "monitor mode"
        // display (non-authoritative progress indicator). No special-casing per request-source mode.
        const speed = calculated.requestsFinishedPerMinute;

        const progressStr = total != null && total > 0
            ? `${finished}/${total} (${((finished / total) * 100).toFixed(1)}%)`
            : total === 0
              ? `${finished}/0 (N/A%)`
              : `${finished}/? (?%)`;

        const failedPct = finished + failed > 0
            ? ` | Failed: ${failed} (${((failed / (finished + failed)) * 100).toFixed(1)}%)`
            : '';

        let etaStr = 'N/A';
        if (total != null && total > 0 && speed > 0) {
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
