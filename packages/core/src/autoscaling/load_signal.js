import { weightedAvg } from './weighted_avg.js';
/**
 * A time-pruning, time-windowed store for `LoadSnapshot` values. All four built-in signals compose with one of these,
 * and so can yours — it is the only part of their machinery worth reusing.
 */
export class SnapshotStore {
    #snapshots = [];
    #historyMillis = Infinity;
    /** Retention window in milliseconds. Unbounded until {@apilink SnapshotStore.useSampleWindow|`useSampleWindow()`}. */
    get historyMillis() {
        return this.#historyMillis;
    }
    /**
     * Sizes retention to the window the signal will be sampled over, as handed to it in
     * {@apilink LoadSignal.start|`start()`}. Until this is called nothing is pruned at all, so a signal that ignores
     * its start context grows unboundedly.
     */
    useSampleWindow(maxSampleWindowMillis) {
        this.#historyMillis = maxSampleWindowMillis;
    }
    /**
     * Add a snapshot and prune entries older than the history window.
     */
    push(snapshot, now = snapshot.createdAt) {
        // Inline pruning to avoid private-method transpilation issues
        let oldCount = 0;
        for (let i = 0; i < this.#snapshots.length; i++) {
            const { createdAt } = this.#snapshots[i];
            if (now.getTime() - new Date(createdAt).getTime() > this.#historyMillis)
                oldCount++;
            else
                break;
        }
        if (oldCount)
            this.#snapshots.splice(0, oldCount);
        this.#snapshots.push(snapshot);
    }
    /**
     * Return all snapshots, or only those within the given time window.
     */
    getSample(sampleDurationMillis) {
        if (!sampleDurationMillis)
            return this.#snapshots;
        const sample = [];
        let idx = this.#snapshots.length;
        if (!idx)
            return sample;
        const latestTime = this.#snapshots[idx - 1].createdAt;
        while (idx--) {
            const snapshot = this.#snapshots[idx];
            if (+latestTime - +snapshot.createdAt <= sampleDurationMillis) {
                sample.unshift(snapshot);
            }
            else {
                break;
            }
        }
        return sample;
    }
    /**
     * Direct, unwindowed access to the underlying array — used by signals whose handler needs the previous snapshot
     * to compute a delta (e.g. the event loop and storage backend signals read the last entry to measure change since
     * it).
     */
    getAll() {
        return this.#snapshots;
    }
    /**
     * Discards every retained snapshot. The built-in signals do this when they *start*, so that a session neither
     * samples nor diffs against measurements from before the preceding downtime — pruning is relative to the newest
     * snapshot rather than the wall clock, so stale entries would otherwise survive indefinitely. Clearing on start
     * rather than on stop leaves a finished session readable.
     */
    clear() {
        this.#snapshots = [];
    }
}
/**
 * Evaluate whether a sample of `LoadSnapshot` values exceeds the given
 * overloaded ratio, using a time-weighted average. This is the shared
 * evaluation logic used by `SystemStatus` for all signal types.
 * @internal
 */
export function evaluateLoadSignalSample(sample, overloadedRatio) {
    if (sample.length === 0) {
        return {
            isOverloaded: false,
            limitRatio: overloadedRatio,
            actualRatio: 0,
        };
    }
    const weights = [];
    const values = [];
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
