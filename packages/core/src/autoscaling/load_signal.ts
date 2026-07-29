import { weightedAvg } from '@crawlee/utils';

import type { ClientInfo } from './system_status.js';

/**
 * A snapshot of a resource's overload state at a point in time.
 */
export interface LoadSnapshot {
    createdAt: Date;
    isOverloaded: boolean;
}

/**
 * Handed to a {@apilink LoadSignal} when it starts, so it can size its snapshot retention to what it will actually
 * be asked for — without having to know how the {@apilink ConcurrencySystem} that drives it is configured.
 */
export interface LoadSignalStartContext {
    /**
     * The longest sample window the signal will be queried with (the wider of the task-gating and autoscaling
     * windows). Keeping less history than this means contributing a narrower view of the resource than the other
     * signals; keeping more is wasted memory, as the extra snapshots are never sampled.
     *
     * Signals built on {@apilink SnapshotStore} get this applied automatically.
     */
    maxSampleWindowMillis: number;
}

/**
 * A signal that reports whether a particular resource is overloaded. The {@apilink ConcurrencySystem} aggregates
 * several of them — if any one reports overload, the system is overloaded.
 *
 * The built-in signals cover memory, CPU, event loop and storage-client rate limits. Implement this interface to add
 * your own (navigation timeouts, proxy health, …) and pass them via
 * {@apilink LoadSignalsOptions.custom|`loadSignals.custom`}; {@apilink SnapshotStore} does the time-windowed
 * bookkeeping if you want it. Each built-in is also a public class, so *wrapping* one — rather than reimplementing it
 * — means constructing it yourself and switching the default off ({@apilink LoadSignalsOptions.cpu|`cpu: false`} and
 * friends), since {@apilink LoadSignal.name|names} are unique.
 */
export interface LoadSignal {
    /**
     * Human-readable name used in logging and as this signal's key in the reported {@apilink SystemInfo} — so it must
     * be unique among the signals of one {@apilink ConcurrencySystem}, which throws on a duplicate. The four
     * built-in names (`memInfo`, `eventLoopInfo`, `cpuInfo`, `clientInfo`) map to the correspondingly named
     * `SystemInfo` fields instead of the `loadSignalInfo` bag; taking one over means switching that built-in off.
     */
    readonly name: string;

    /**
     * Maximum ratio of overloaded snapshots in a sample before the signal
     * is considered overloaded. For example, `0.2` means the signal fires
     * when more than 20% of the sample window is overloaded.
     */
    readonly overloadedRatio: number;

    /**
     * Start collecting snapshots. Called when the {@apilink ConcurrencySystem} starts, with the sample window the
     * signal should retain at least as much history as. Implementations that manage their own storage may ignore the
     * argument, at the cost of contributing a window that doesn't match the other signals.
     */
    start(context: LoadSignalStartContext): Promise<void>;

    /** Stop collecting snapshots. Called when the {@apilink ConcurrencySystem} shuts down. */
    stop(): Promise<void>;

    /**
     * Return snapshots for a recent time window (used for "current" status).
     * @param sampleDurationMillis How far back to look, in milliseconds.
     */
    getSample(sampleDurationMillis?: number): LoadSnapshot[];
}

/**
 * A time-pruning, time-windowed store for `LoadSnapshot` values. All four built-in signals compose with one of these,
 * and so can yours — it is the only part of their machinery worth reusing.
 */
export class SnapshotStore<T extends LoadSnapshot = LoadSnapshot> {
    private snapshots: T[] = [];

    /**
     * Retention window in milliseconds. Starts unbounded so nothing is pruned before the store learns the window it
     * will actually be sampled over; {@apilink SnapshotStore.useSampleWindow|`useSampleWindow()`} narrows it to that
     * window when the owning signal starts.
     */
    private historyMillis = Infinity;

    /**
     * Sizes retention to the window the signal will be sampled over, as handed to it in
     * {@apilink LoadSignal.start|`start()`} — keep exactly what will be asked for, no more.
     */
    useSampleWindow(maxSampleWindowMillis: number): void {
        this.historyMillis = maxSampleWindowMillis;
    }

    /**
     * Add a snapshot and prune entries older than the history window.
     */
    push(snapshot: T, now: Date = snapshot.createdAt): void {
        // Inline pruning to avoid private-method transpilation issues
        let oldCount = 0;
        for (let i = 0; i < this.snapshots.length; i++) {
            const { createdAt } = this.snapshots[i];
            if (now.getTime() - new Date(createdAt).getTime() > this.historyMillis) oldCount++;
            else break;
        }
        if (oldCount) this.snapshots.splice(0, oldCount);

        this.snapshots.push(snapshot);
    }

    /**
     * Return all snapshots, or only those within the given time window.
     */
    getSample(sampleDurationMillis?: number): T[] {
        if (!sampleDurationMillis) return this.snapshots;

        const sample: T[] = [];
        let idx = this.snapshots.length;
        if (!idx) return sample;

        const latestTime = this.snapshots[idx - 1].createdAt;
        while (idx--) {
            const snapshot = this.snapshots[idx];
            if (+latestTime - +snapshot.createdAt <= sampleDurationMillis) {
                sample.unshift(snapshot);
            } else {
                break;
            }
        }

        return sample;
    }

    /**
     * Direct, unwindowed access to the underlying array — used by signals whose handler needs the previous snapshot
     * to compute a delta (e.g. the event loop and client signals read the last entry to measure change since it).
     */
    getAll(): T[] {
        return this.snapshots;
    }
}

/**
 * Evaluate whether a sample of `LoadSnapshot` values exceeds the given
 * overloaded ratio, using a time-weighted average. This is the shared
 * evaluation logic used by `SystemStatus` for all signal types.
 * @internal
 */
export function evaluateLoadSignalSample(sample: LoadSnapshot[], overloadedRatio: number): ClientInfo {
    if (sample.length === 0) {
        return {
            isOverloaded: false,
            limitRatio: overloadedRatio,
            actualRatio: 0,
        };
    }

    const weights: number[] = [];
    const values: number[] = [];

    for (let i = 1; i < sample.length; i++) {
        const previous = sample[i - 1];
        const current = sample[i];
        const weight = +current.createdAt - +previous.createdAt;
        weights.push(weight || 1); // Prevent errors from 0ms long intervals (sync) between snapshots.
        values.push(+current.isOverloaded);
    }

    const wAvg = sample.length === 1 ? +sample[0].isOverloaded : weightedAvg(values, weights);

    return {
        isOverloaded: wAvg > overloadedRatio,
        limitRatio: overloadedRatio,
        actualRatio: Math.round(wAvg * 1000) / 1000,
    };
}
