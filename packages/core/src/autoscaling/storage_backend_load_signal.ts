import type { StorageBackend } from '@crawlee/types';

import type { BetterIntervalID } from '@apify/utilities';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';

import { serviceLocator } from '../service_locator.js';
import type { LoadSignal, LoadSignalStartContext, LoadSnapshot } from './load_signal.js';
import { SnapshotStore } from './load_signal.js';

const RATE_LIMIT_ERROR_RETRY_COUNT = 2;

/**
 * A snapshot produced by the built-in storage backend (rate-limit) signal.
 * @internal
 */
export interface StorageBackendSnapshot extends LoadSnapshot {
    rateLimitErrorCount: number;
}

/**
 * Tuning for the built-in **storage backend** (rate-limit) load signal, as accepted both by
 * {@apilink StorageBackendLoadSignal} and by the
 * {@apilink LoadSignalsOptions.storageBackend|`storageBackend`} shorthand on {@apilink LoadSignalsOptions}.
 */
export interface StorageBackendLoadSignalOptions {
    /**
     * Defines the interval of checking the current state of the storage backend, in seconds.
     * @default 1
     */
    snapshotIntervalSecs?: number;

    /**
     * Defines the maximum number of new rate limit errors within the given interval.
     * @default 3
     */
    maxErrors?: number;

    /**
     * Maximum ratio of overloaded snapshots in a sample before the storage backend counts as overloaded.
     * @default 0.3
     */
    overloadedRatio?: number;
}

/**
 * Periodically checks the storage backend for rate-limit errors (HTTP 429) and reports overload when the error delta
 * exceeds a threshold.
 *
 * Built by default; construct one yourself only to wrap or adapt it — see {@apilink LoadSignal}.
 *
 * Switch it off entirely ({@apilink LoadSignalsOptions.storageBackend|`storageBackend: false`}) if the storage backend
 * reports no rate-limit statistics, since it otherwise polls it every second to no purpose.
 *
 * @category Scaling
 */
export class StorageBackendLoadSignal implements LoadSignal {
    readonly name = 'storageBackendInfo';
    readonly overloadedRatio: number;

    readonly #store = new SnapshotStore<StorageBackendSnapshot>();
    readonly #intervalMillis: number;
    readonly #maxErrors: number;
    #interval?: BetterIntervalID;
    #storageBackend?: StorageBackend;

    constructor(options: StorageBackendLoadSignalOptions = {}) {
        this.overloadedRatio = options.overloadedRatio ?? 0.3;
        this.#intervalMillis = (options.snapshotIntervalSecs ?? 1) * 1000;
        this.#maxErrors = options.maxErrors ?? 3;
        this.handle = this.handle.bind(this);
    }

    async start(context: LoadSignalStartContext): Promise<void> {
        this.#store.useSampleWindow(context.maxSampleWindowMillis);
        // A new session starts from a clean slate, or its first measurement diffs the error count against the previous
        // session's — possibly against a different backend, since it is resolved afresh just below.
        this.#store.clear();

        // Resolved here rather than in the constructor, where asking for the backend would instantiate a default one
        // as a side effect - long before the crawler that owns the run has had a chance to register its own.
        this.#storageBackend = serviceLocator.getStorageBackend();
        this.#interval = betterSetInterval(this.handle, this.#intervalMillis);
    }

    async stop(): Promise<void> {
        if (this.#interval) betterClearInterval(this.#interval);
        this.#interval = undefined;
        this.#storageBackend = undefined;
    }

    getSample(sampleDurationMillis?: number): LoadSnapshot[] {
        return this.#store.getSample(sampleDurationMillis);
    }

    /**
     * Records one snapshot, overloaded when rate-limit errors grew by more than the configured limit since the
     * previous one.
     * @internal Also lets tests drive the measurement without waiting on a timer.
     */
    handle(intervalCallback: () => unknown): void {
        const now = new Date();

        const allErrorCounts = this.#storageBackend?.stats?.rateLimitErrors ?? [];
        const currentErrCount = allErrorCounts[RATE_LIMIT_ERROR_RETRY_COUNT] || 0;

        const snapshot: StorageBackendSnapshot = {
            createdAt: now,
            isOverloaded: false,
            rateLimitErrorCount: currentErrCount,
        };

        const all = this.#store.getAll();
        const previousSnapshot = all[all.length - 1];

        if (previousSnapshot) {
            const delta = currentErrCount - previousSnapshot.rateLimitErrorCount;
            if (delta > this.#maxErrors) snapshot.isOverloaded = true;
        }

        this.#store.push(snapshot, now);
        intervalCallback();
    }
}
