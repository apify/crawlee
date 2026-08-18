import { betterClearInterval, betterSetInterval } from '@apify/utilities';
import { SnapshotStore } from './load_signal.js';
/**
 * Periodically measures event loop delay and reports overload when the delay exceeds a configured threshold.
 *
 * Built by default; construct one yourself only to wrap or adapt it — see {@apilink LoadSignal}.
 *
 * @category Scaling
 */
export class EventLoopLoadSignal {
    name = 'eventLoopInfo';
    overloadedRatio;
    #store = new SnapshotStore();
    #intervalMillis;
    #maxBlockedMillis;
    #interval;
    constructor(options = {}) {
        this.overloadedRatio = options.overloadedRatio ?? 0.6;
        this.#intervalMillis = (options.snapshotIntervalSecs ?? 0.5) * 1000;
        this.#maxBlockedMillis = options.maxBlockedMillis ?? 50;
        this.handle = this.handle.bind(this);
    }
    async start(context) {
        this.#store.useSampleWindow(context.maxSampleWindowMillis);
        // A new session starts from a clean slate, or the downtime gets charged to the event loop: `handle()` measures
        // the gap since the previous snapshot, which across a restart is however long the system was stopped.
        this.#store.clear();
        this.#interval = betterSetInterval(this.handle, this.#intervalMillis);
    }
    async stop() {
        if (this.#interval)
            betterClearInterval(this.#interval);
        this.#interval = undefined;
    }
    getSample(sampleDurationMillis) {
        return this.#store.getSample(sampleDurationMillis);
    }
    /**
     * Records one snapshot: how much later than scheduled this tick ran is how long the loop was blocked.
     * @internal Also lets tests drive the measurement without waiting on a timer.
     */
    handle(intervalCallback) {
        const now = new Date();
        const snapshot = {
            createdAt: now,
            isOverloaded: false,
            exceededMillis: 0,
        };
        const all = this.#store.getAll();
        const previousSnapshot = all[all.length - 1];
        if (previousSnapshot) {
            const delta = now.getTime() - +previousSnapshot.createdAt - this.#intervalMillis;
            if (delta > this.#maxBlockedMillis)
                snapshot.isOverloaded = true;
            snapshot.exceededMillis = Math.max(delta - this.#maxBlockedMillis, 0);
        }
        this.#store.push(snapshot, now);
        intervalCallback();
    }
}
