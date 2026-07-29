import type { StorageBackend } from '@crawlee/types';

import { serviceLocator } from '../service_locator.js';
import type { LoadSignal, LoadSignalStartContext, LoadSnapshot } from './load_signal.js';
import { SnapshotStore } from './load_signal.js';

const CLIENT_RATE_LIMIT_ERROR_RETRY_COUNT = 2;

/**
 * A snapshot produced by the built-in client (rate-limit) signal.
 * @internal
 */
export interface ClientSnapshot extends LoadSnapshot {
    rateLimitErrorCount: number;
}

/**
 * Tuning for the built-in **client** (rate-limit) load signal, as accepted both by {@apilink ClientLoadSignal} and by
 * the {@apilink LoadSignalsOptions.client|`client`} shorthand on {@apilink LoadSignalsOptions}.
 */
export interface ClientLoadSignalOptions {
    /**
     * Defines the interval of checking the current state of the remote API client, in seconds.
     * @default 1
     */
    snapshotIntervalSecs?: number;

    /**
     * Defines the maximum number of new rate limit errors within the given interval.
     * @default 3
     */
    maxErrors?: number;

    /**
     * Maximum ratio of overloaded snapshots in a sample before the client counts as overloaded.
     * @default 0.3
     */
    overloadedRatio?: number;
}

/**
 * Periodically checks the storage backend for rate-limit errors (HTTP 429) and reports overload when the error delta
 * exceeds a threshold.
 *
 * The {@apilink ConcurrencySystem} builds one of these by default, so you only need to construct it yourself to wrap
 * or otherwise adapt it — in which case switch the default off with
 * {@apilink LoadSignalsOptions.client|`client: false`}, since two signals cannot share a name. If your backend
 * reports no rate-limit statistics at all, switching this signal off (rather than replacing it) saves a poll per
 * second.
 *
 * @category Scaling
 */
export class ClientLoadSignal implements LoadSignal {
    readonly name = 'clientInfo';
    readonly overloadedRatio: number;

    private readonly signal: ReturnType<typeof SnapshotStore.fromInterval<ClientSnapshot>>;
    private client?: StorageBackend;

    constructor(options: ClientLoadSignalOptions = {}) {
        this.overloadedRatio = options.overloadedRatio ?? 0.3;

        const maxErrors = options.maxErrors ?? 3;

        this.signal = SnapshotStore.fromInterval<ClientSnapshot>({
            name: this.name,
            overloadedRatio: this.overloadedRatio,
            intervalMillis: (options.snapshotIntervalSecs ?? 1) * 1000,
            handler: (store, intervalCallback) => {
                const now = new Date();

                const allErrorCounts = this.client?.stats?.rateLimitErrors ?? [];
                const currentErrCount = allErrorCounts[CLIENT_RATE_LIMIT_ERROR_RETRY_COUNT] || 0;

                const snapshot: ClientSnapshot = {
                    createdAt: now,
                    isOverloaded: false,
                    rateLimitErrorCount: currentErrCount,
                };

                const all = store.getAll();
                const previousSnapshot = all[all.length - 1];

                if (previousSnapshot) {
                    const delta = currentErrCount - previousSnapshot.rateLimitErrorCount;
                    if (delta > maxErrors) snapshot.isOverloaded = true;
                }

                store.push(snapshot, now);
                intervalCallback();
            },
        });
    }

    async start(context: LoadSignalStartContext): Promise<void> {
        // Resolved here rather than in the constructor, where asking for the backend would instantiate a default one
        // as a side effect - long before the crawler that owns the run has had a chance to register its own.
        this.client = serviceLocator.getStorageBackend();
        await this.signal.start(context);
    }

    async stop(): Promise<void> {
        await this.signal.stop();
        this.client = undefined;
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
