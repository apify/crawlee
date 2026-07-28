import type { LoadSnapshot } from './load_signal.js';
import { SnapshotStore } from './load_signal.js';

/**
 * A snapshot produced by the built-in event loop signal.
 * @internal
 */
export interface EventLoopSnapshot extends LoadSnapshot {
    exceededMillis: number;
}

/**
 * Configured through the {@apilink SnapshotterOptions.eventLoop|`eventLoop`} bag on {@apilink SnapshotterOptions}.
 * @internal
 */
export interface EventLoopLoadSignalOptions {
    eventLoopSnapshotIntervalSecs?: number;
    maxBlockedMillis?: number;
    overloadedRatio?: number;
}

/**
 * Periodically measures event loop delay and reports overload when the
 * delay exceeds a configured threshold.
 * @internal
 */
export function createEventLoopLoadSignal(options: EventLoopLoadSignalOptions = {}) {
    const intervalMillis = (options.eventLoopSnapshotIntervalSecs ?? 0.5) * 1000;
    const maxBlockedMillis = options.maxBlockedMillis ?? 50;

    const signal = SnapshotStore.fromInterval<EventLoopSnapshot>({
        name: 'eventLoopInfo',
        overloadedRatio: options.overloadedRatio ?? 0.6,
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
