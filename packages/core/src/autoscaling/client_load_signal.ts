import type { StorageBackend } from '@crawlee/types';

import type { BetterIntervalID } from '@apify/utilities';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';

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

    private readonly store = new SnapshotStore<ClientSnapshot>();
    private readonly intervalMillis: number;
    private readonly maxErrors: number;
    private interval?: BetterIntervalID;
    private client?: StorageBackend;

    constructor(options: ClientLoadSignalOptions = {}) {
        this.overloadedRatio = options.overloadedRatio ?? 0.3;
        this.intervalMillis = (options.snapshotIntervalSecs ?? 1) * 1000;
        this.maxErrors = options.maxErrors ?? 3;
        this.handle = this.handle.bind(this);
    }

    async start({ maxSampleWindowMillis }: LoadSignalStartContext): Promise<void> {
        this.store.useSampleWindow(maxSampleWindowMillis);

        // Resolved here rather than in the constructor, where asking for the backend would instantiate a default one
        // as a side effect - long before the crawler that owns the run has had a chance to register its own.
        this.client = serviceLocator.getStorageBackend();
        this.interval = betterSetInterval(this.handle, this.intervalMillis);
    }

    async stop(): Promise<void> {
        if (this.interval) betterClearInterval(this.interval);
        this.interval = undefined;
        this.client = undefined;
    }

    getSample(sampleDurationMillis?: number): LoadSnapshot[] {
        return this.store.getSample(sampleDurationMillis);
    }

    /**
     * Records one snapshot, overloaded when rate-limit errors grew by more than the configured limit since the
     * previous one.
     * @internal Also lets tests drive the measurement without waiting on a timer.
     */
    handle(intervalCallback: () => unknown): void {
        const now = new Date();

        const allErrorCounts = this.client?.stats?.rateLimitErrors ?? [];
        const currentErrCount = allErrorCounts[CLIENT_RATE_LIMIT_ERROR_RETRY_COUNT] || 0;

        const snapshot: ClientSnapshot = {
            createdAt: now,
            isOverloaded: false,
            rateLimitErrorCount: currentErrCount,
        };

        const all = this.store.getAll();
        const previousSnapshot = all[all.length - 1];

        if (previousSnapshot) {
            const delta = currentErrCount - previousSnapshot.rateLimitErrorCount;
            if (delta > this.maxErrors) snapshot.isOverloaded = true;
        }

        this.store.push(snapshot, now);
        intervalCallback();
    }
}
