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
 * The {@apilink ConcurrencySystem} builds one of these by default, so you only need to construct it yourself to wrap
 * or otherwise adapt it — in which case switch the default off with
 * {@apilink LoadSignalsOptions.eventLoop|`eventLoop: false`}, since two signals cannot share a name.
 *
 * @category Scaling
 */
export class EventLoopLoadSignal implements LoadSignal {
    readonly name = 'eventLoopInfo';
    readonly overloadedRatio: number;

    private readonly signal: ReturnType<typeof SnapshotStore.fromInterval<EventLoopSnapshot>>;

    constructor(options: EventLoopLoadSignalOptions = {}) {
        this.overloadedRatio = options.overloadedRatio ?? 0.6;

        const intervalMillis = (options.snapshotIntervalSecs ?? 0.5) * 1000;
        const maxBlockedMillis = options.maxBlockedMillis ?? 50;

        this.signal = SnapshotStore.fromInterval<EventLoopSnapshot>({
            name: this.name,
            overloadedRatio: this.overloadedRatio,
            intervalMillis,
            handler(store, intervalCallback) {
                const now = new Date();

                const snapshot: EventLoopSnapshot = {
                    createdAt: now,
                    isOverloaded: false,
                    exceededMillis: 0,
                };

                const all = store.getAll();
                const previousSnapshot = all[all.length - 1];

                if (previousSnapshot) {
                    // How much later than scheduled this tick ran is how long the loop was blocked.
                    const delta = now.getTime() - +previousSnapshot.createdAt - intervalMillis;

                    if (delta > maxBlockedMillis) snapshot.isOverloaded = true;
                    snapshot.exceededMillis = Math.max(delta - maxBlockedMillis, 0);
                }

                store.push(snapshot, now);
                intervalCallback();
            },
        });
    }

    async start(context: LoadSignalStartContext): Promise<void> {
        await this.signal.start(context);
    }

    async stop(): Promise<void> {
        await this.signal.stop();
    }

    getSample(sampleDurationMillis?: number): LoadSnapshot[] {
        return this.signal.getSample(sampleDurationMillis);
    }

    /**
     * @internal Records one snapshot. Exposed so tests can drive the measurement without waiting on a timer.
     */
    handle(intervalCallback: () => unknown): void {
        this.signal.handle(intervalCallback);
    }
}
