import { weightedAvg } from '@crawlee/utils';

import type { BetterIntervalID } from '@apify/utilities';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';

import type { EventManager, EventTypeName } from '../events/event_manager';
import type { ClientInfo } from './system_status';

/**
 * A snapshot of a resource's overload state at a point in time.
 */
export interface LoadSnapshot {
    createdAt: Date;
    isOverloaded: boolean;
}

/**
 * A signal that reports whether a particular resource is overloaded.
 *
 * `SystemStatus` aggregates multiple `LoadSignal` instances to determine
 * overall system health. The built-in signals cover memory, CPU, event loop,
 * and API client rate limits. You can implement this interface to add
 * custom overload signals (e.g. navigation timeouts, proxy health).
 */
export interface LoadSignal {
    /** Human-readable name used in logging and `SystemInfo` keys. */
    readonly name: string;

    /**
     * Maximum ratio of overloaded snapshots in a sample before the signal
     * is considered overloaded. For example, `0.2` means the signal fires
     * when more than 20% of the sample window is overloaded.
     */
    readonly overloadedRatio: number;

    /** Start collecting snapshots. Called when the pool starts. */
    start(): Promise<void>;

    /** Stop collecting snapshots. Called when the pool shuts down. */
    stop(): Promise<void>;

    /**
     * Return snapshots for a recent time window (used for "current" status).
     * @param sampleDurationMillis How far back to look, in milliseconds.
     */
    getSample(sampleDurationMillis?: number): LoadSnapshot[];
}

/**
 * A time-pruning, time-windowed store for `LoadSnapshot` values.
 * Signals compose with this instead of inheriting from a base class.
 */
export class SnapshotStore<T extends LoadSnapshot = LoadSnapshot> {
    private snapshots: T[] = [];
    private readonly historyMillis: number;

    constructor(historyMillis = 30_000) {
        this.historyMillis = historyMillis;
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
     * Direct access to the underlying array (for backward-compat getters).
     */
    getAll(): T[] {
        return this.snapshots;
    }

    /**
     * Create a `LoadSignal` that snapshots on a `betterSetInterval` tick.
     *
     * The `handler` receives the store (to read previous snapshots) and the
     * interval callback (which it **must** call when done). It should call
     * `store.push()` to record a snapshot.
     */
    static fromInterval<T extends LoadSnapshot>(options: {
        name: string;
        overloadedRatio: number;
        intervalMillis: number;
        snapshotHistoryMillis?: number;
        handler: (store: SnapshotStore<T>, intervalCallback: () => unknown) => void;
    }): LoadSignal & { store: SnapshotStore<T>; handle: (cb: () => unknown) => void } {
        const store = new SnapshotStore<T>(options.snapshotHistoryMillis);
        let interval: BetterIntervalID = null!;

        const handle = (cb: () => unknown) => options.handler(store, cb);

        return {
            name: options.name,
            overloadedRatio: options.overloadedRatio,
            store,
            handle,
            getSample: (ms) => store.getSample(ms),
            async start() {
                interval = betterSetInterval(handle, options.intervalMillis);
            },
            async stop() {
                betterClearInterval(interval);
            },
        };
    }

    /**
     * Create a `LoadSignal` that snapshots in response to an `EventManager` event.
     *
     * The `handler` receives the event payload and the store. It should call
     * `store.push()` to record a snapshot.
     */
    static fromEvent<T extends LoadSnapshot, E>(options: {
        name: string;
        overloadedRatio: number;
        events: EventManager;
        event: EventTypeName;
        snapshotHistoryMillis?: number;
        handler: (store: SnapshotStore<T>, payload: E) => void;
    }): LoadSignal & { store: SnapshotStore<T>; handle: (payload: E) => void } {
        const store = new SnapshotStore<T>(options.snapshotHistoryMillis);

        const handle = (payload: E) => options.handler(store, payload);

        return {
            name: options.name,
            overloadedRatio: options.overloadedRatio,
            store,
            handle,
            getSample: (ms) => store.getSample(ms),
            async start() {
                options.events.on(options.event, handle);
            },
            async stop() {
                options.events.off(options.event, handle);
            },
        };
    }
}

/**
 * Evaluate whether a sample of `LoadSnapshot` values exceeds the given
 * overloaded ratio, using a time-weighted average. This is the shared
 * evaluation logic used by `SystemStatus` for all signal types.
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
