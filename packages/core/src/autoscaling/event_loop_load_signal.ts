import type { LoadSnapshot } from './load_signal';
import { SnapshotStore } from './load_signal';

export interface EventLoopSnapshot extends LoadSnapshot {
    /** Event-loop delay above the configured threshold, in milliseconds. */
    exceededMillis: number;
}

export interface EventLoopLoadSignalOptions {
    /** Interval between event-loop measurements, in seconds. */
    eventLoopSnapshotIntervalSecs?: number;
    /** Delay threshold that marks a measurement as overloaded, in milliseconds. */
    maxBlockedMillis?: number;
    /** Fraction of overloaded snapshots required to mark the signal overloaded. */
    overloadedRatio?: number;
    /** Duration for which snapshots are retained, in milliseconds. */
    snapshotHistoryMillis?: number;
}

/**
 * Periodically measures event loop delay and reports overload when the
 * delay exceeds a configured threshold.
 */
export function createEventLoopLoadSignal(options: EventLoopLoadSignalOptions = {}) {
    const intervalMillis = (options.eventLoopSnapshotIntervalSecs ?? 0.5) * 1000;
    const maxBlockedMillis = options.maxBlockedMillis ?? 50;

    const signal = SnapshotStore.fromInterval<EventLoopSnapshot>({
        name: 'eventLoopInfo',
        overloadedRatio: options.overloadedRatio ?? 0.6,
        intervalMillis,
        snapshotHistoryMillis: options.snapshotHistoryMillis,
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
                const { createdAt } = previousSnapshot;
                const delta = now.getTime() - +createdAt - intervalMillis;

                if (delta > maxBlockedMillis) snapshot.isOverloaded = true;
                snapshot.exceededMillis = Math.max(delta - maxBlockedMillis, 0);
            }

            store.push(snapshot, now);
            intervalCallback();
        },
    });

    return signal;
}

/** @internal Return type for backward compat in Snapshotter facade */
export type EventLoopLoadSignal = ReturnType<typeof createEventLoopLoadSignal>;
