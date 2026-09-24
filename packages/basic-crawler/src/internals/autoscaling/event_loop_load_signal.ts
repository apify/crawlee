import type { BetterIntervalID } from '@apify/utilities';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';

import type { LoadSignal, LoadSignalStartContext, LoadSnapshot } from './load_signal.js';
import { SnapshotStore } from './load_signal.js';

/**
 * A snapshot produced by the built-in event loop signal.
 * @internal
 */
export interface EventLoopSnapshot extends LoadSnapshot {
    exceededMillis: number;
}

/**
 * Tuning for the built-in **event loop** load signal, as accepted both by {@apilink EventLoopLoadSignal} and by the
 * {@apilink LoadSignalsOptions.eventLoop|`eventLoop`} shorthand on {@apilink LoadSignalsOptions}.
 */
export interface EventLoopLoadSignalOptions {
    /**
     * Defines the interval of measuring the event loop response time, in seconds.
     * @default 0.5
     */
    snapshotIntervalSecs?: number;

    /**
     * Maximum allowed delay of the event loop in milliseconds.
     * Exceeding this limit overloads the event loop.
     * @default 50
     */
    maxBlockedMillis?: number;

    /**
     * Maximum ratio of overloaded snapshots in a sample before the event loop counts as overloaded.
     * @default 0.6
     */
    overloadedRatio?: number;
}

/**
 * Periodically measures event loop delay and reports overload when the delay exceeds a configured threshold.
 *
 * Built by default; construct one yourself only to wrap or adapt it — see {@apilink LoadSignal}.
 *
 * @category Scaling
 */
export class EventLoopLoadSignal implements LoadSignal {
    readonly name = 'eventLoopInfo';
    readonly overloadedRatio: number;

    readonly #store = new SnapshotStore<EventLoopSnapshot>();
    readonly #intervalMillis: number;
    readonly #maxBlockedMillis: number;
    #interval?: BetterIntervalID;

    constructor(options: EventLoopLoadSignalOptions = {}) {
        this.overloadedRatio = options.overloadedRatio ?? 0.6;
        this.#intervalMillis = (options.snapshotIntervalSecs ?? 0.5) * 1000;
        this.#maxBlockedMillis = options.maxBlockedMillis ?? 50;
        this.handle = this.handle.bind(this);
    }

    async start(context: LoadSignalStartContext): Promise<void> {
        this.#store.useSampleWindow(context.maxSampleWindowMillis);
        // A new session starts from a clean slate, or the downtime gets charged to the event loop: `handle()` measures
        // the gap since the previous snapshot, which across a restart is however long the system was stopped.
        this.#store.clear();
        this.#interval = betterSetInterval(this.handle, this.#intervalMillis);
    }

    async stop(): Promise<void> {
        if (this.#interval) betterClearInterval(this.#interval);
        this.#interval = undefined;
    }

    getSample(sampleDurationMillis?: number): LoadSnapshot[] {
        return this.#store.getSample(sampleDurationMillis);
    }

    /**
     * Records one snapshot: how much later than scheduled this tick ran is how long the loop was blocked.
     * @internal Also lets tests drive the measurement without waiting on a timer.
     */
    handle(intervalCallback: () => unknown): void {
        const now = new Date();

        const snapshot: EventLoopSnapshot = {
            createdAt: now,
            isOverloaded: false,
            exceededMillis: 0,
        };

        const all = this.#store.getAll();
        const previousSnapshot = all[all.length - 1];

        if (previousSnapshot) {
            const delta = now.getTime() - +previousSnapshot.createdAt - this.#intervalMillis;

            if (delta > this.#maxBlockedMillis) snapshot.isOverloaded = true;
            snapshot.exceededMillis = Math.max(delta - this.#maxBlockedMillis, 0);
        }

        this.#store.push(snapshot, now);
        intervalCallback();
    }
}
