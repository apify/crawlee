import { betterClearInterval, betterSetInterval } from '@apify/utilities';
import { serviceLocator } from '../service_locator.js';
import { SnapshotStore } from './load_signal.js';
const RATE_LIMIT_ERROR_RETRY_COUNT = 2;
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
export class StorageBackendLoadSignal {
    name = 'storageBackendInfo';
    overloadedRatio;
    #store = new SnapshotStore();
    #intervalMillis;
    #maxErrors;
    #interval;
    #storageBackend;
    constructor(options = {}) {
        this.overloadedRatio = options.overloadedRatio ?? 0.3;
        this.#intervalMillis = (options.snapshotIntervalSecs ?? 1) * 1000;
        this.#maxErrors = options.maxErrors ?? 3;
        this.handle = this.handle.bind(this);
    }
    async start(context) {
        this.#store.useSampleWindow(context.maxSampleWindowMillis);
        // A new session starts from a clean slate, or its first measurement diffs the error count against the previous
        // session's — possibly against a different backend, since it is resolved afresh just below.
        this.#store.clear();
        // Resolved here rather than in the constructor, where asking for the backend would instantiate a default one
        // as a side effect - long before the crawler that owns the run has had a chance to register its own.
        this.#storageBackend = serviceLocator.getStorageBackend();
        this.#interval = betterSetInterval(this.handle, this.#intervalMillis);
    }
    async stop() {
        if (this.#interval)
            betterClearInterval(this.#interval);
        this.#interval = undefined;
        this.#storageBackend = undefined;
    }
    getSample(sampleDurationMillis) {
        return this.#store.getSample(sampleDurationMillis);
    }
    /**
     * Records one snapshot, overloaded when rate-limit errors grew by more than the configured limit since the
     * previous one.
     * @internal Also lets tests drive the measurement without waiting on a timer.
     */
    handle(intervalCallback) {
        const now = new Date();
        const allErrorCounts = this.#storageBackend?.stats?.rateLimitErrors ?? [];
        const currentErrCount = allErrorCounts[RATE_LIMIT_ERROR_RETRY_COUNT] || 0;
        const snapshot = {
            createdAt: now,
            isOverloaded: false,
            rateLimitErrorCount: currentErrCount,
        };
        const all = this.#store.getAll();
        const previousSnapshot = all[all.length - 1];
        if (previousSnapshot) {
            const delta = currentErrCount - previousSnapshot.rateLimitErrorCount;
            if (delta > this.#maxErrors)
                snapshot.isOverloaded = true;
        }
        this.#store.push(snapshot, now);
        intervalCallback();
    }
}
