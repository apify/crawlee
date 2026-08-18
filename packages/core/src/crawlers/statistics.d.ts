import type { CrawleeLogger } from '../log.js';
import type { SyncStateConversion } from '../recoverable_state.js';
import { KeyValueStore } from '../storages/key_value_store.js';
import { ErrorTracker } from './error_tracker.js';
/**
 * Persistence-related options to control how and when crawler's data gets persisted.
 */
export interface PersistenceOptions {
    /**
     * Use this flag to disable or enable periodic persistence to key value store.
     * @default true
     */
    enable?: boolean;
}
/**
 * The statistics surface a crawler depends on: recording per-request outcomes, tracking errors, and driving the
 * capture lifecycle for a run. Injected via the crawler's `statistics` option, so a custom implementation can be
 * plugged in without subclassing the crawler.
 *
 * `StateExtension` describes the custom fields tracked alongside the built-in {@apilink StatisticState} ones - see
 * {@apilink StatisticsOptions.stateExtension}.
 *
 * The owned-only mutators the crawler uses to *own* a default it built - `reset()`/`resetStore()` - are deliberately
 * absent: an injected instance is borrowed, and the crawler never wipes it. Those live on the concrete
 * {@apilink Statistics} only.
 *
 * @category Crawlers
 */
export interface IStatistics<StateExtension extends object = {}> {
    /** Tracker for errors on the final retry of a request. */
    readonly errorTracker: ErrorTracker;
    /** Tracker for errors on retries prior to the final one. */
    readonly errorTrackerRetry: ErrorTracker;
    /** The live statistics state the crawler reads for status messages and the final summary. */
    readonly state: StatisticState & StateExtension;
    /** Retries histogram - index `i` holds the number of requests that finished after `i` retries. */
    readonly requestRetryHistogram: number[];
    /** Marks a request as started, so its duration can be measured on finish/fail. */
    startJob(id: number | string): void;
    /** Marks a started request as finished, updating the finished counters and durations. */
    finishJob(id: number | string, retryCount: number): void;
    /** Marks a started request as failed, updating the failed counters and durations. */
    failJob(id: number | string, retryCount: number): void;
    /** Drops a started request without counting it as finished or failed (e.g. skipped by robots.txt). */
    discardJob(id: number | string): void;
    /** Increments the counter for the given HTTP status code. */
    registerStatusCode(code: number): void;
    /** Computes the derived aggregates (averages, per-minute rates, totals) from the current state. */
    calculate(): CalculatedStatistics;
    /** Begins a capture window: loads any persisted state, subscribes to persistence events, starts periodic logging. */
    startCapturing(): Promise<void>;
    /** Ends the capture window: stops logging, unsubscribes, and persists the final state. */
    stopCapturing(): Promise<void>;
    /**
     * Persists the current state to the key-value store. Optional - the crawler calls it on migration, but a backend
     * with no persistence of its own can omit it.
     */
    persistState?(): Promise<void>;
}
/** The derived aggregates computed by {@apilink IStatistics.calculate} from the current {@apilink StatisticState}. */
export interface CalculatedStatistics {
    /** Mean duration of a failed request, in milliseconds; `Infinity` when nothing has failed. */
    requestAvgFailedDurationMillis: number;
    /** Mean duration of a finished request, in milliseconds; `Infinity` when nothing has finished. */
    requestAvgFinishedDurationMillis: number;
    /** Requests finished per minute over the run so far. */
    requestsFinishedPerMinute: number;
    /** Requests failed per minute over the run so far. */
    requestsFailedPerMinute: number;
    /** Combined duration of all finished and failed requests, in milliseconds. */
    requestTotalDurationMillis: number;
    /** Total number of settled requests (finished plus failed). */
    requestsTotal: number;
    /** Wall-clock runtime since capturing started, in milliseconds. */
    crawlerRuntimeMillis: number;
}
/**
 * The statistics class provides an interface to collecting and logging run
 * statistics for requests.
 *
 * All statistic information is saved on key value store
 * under the key `CRAWLEE_CRAWLER_STATISTICS_*`, persists between
 * migrations and abort/resurrect
 *
 * Custom fields are tracked by passing {@apilink StatisticsOptions.stateExtension|`stateExtension`} - the extra fields are then part
 * of {@apilink Statistics.state|`state`}, persisted and restored along with the built-in ones.
 *
 * @category Crawlers
 */
export declare class Statistics<StateExtension extends object = {}, PersistedStateExtension extends object = StateExtension> implements IStatistics<StateExtension> {
    #private;
    /** @internal Reset static counter for test isolation. */
    static resetId(): void;
    /**
     * An error tracker for final retry errors.
     */
    readonly errorTracker: ErrorTracker;
    /**
     * An error tracker for retry errors prior to the final retry.
     */
    readonly errorTrackerRetry: ErrorTracker;
    /**
     * Statistic instance id.
     */
    readonly id: string;
    private readonly log;
    /**
     * Current statistic state used for doing calculations on {@apilink Statistics.calculate} calls
     */
    get state(): StatisticState & StateExtension;
    /**
     * Contains the current retries histogram. Index 0 means 0 retries, index 2, 2 retries, and so on
     */
    get requestRetryHistogram(): number[];
    /**
     * Construct a statistics instance to pass to a crawler via its `statistics` option, e.g. to preconfigure
     * persistence or error snapshots, share it across sequential runs, or track extra fields via `state`.
     */
    constructor(options?: StatisticsOptions<StateExtension, PersistedStateExtension>);
    /**
     * Set the current statistic instance to pristine values.
     *
     * The persisted record is left alone - use {@apilink Statistics.resetStore} to clear that as well.
     */
    reset(): void;
    /**
     * Clear the persisted statistics record, leaving the in-memory state alone.
     *
     * Throws while capturing - the next PERSIST_STATE event would write the record straight back.
     */
    resetStore(): Promise<void>;
    /**
     * Increments the status code counter.
     */
    registerStatusCode(code: number): void;
    /**
     * Starts a job
     * @ignore
     */
    startJob(id: number | string): void;
    /**
     * Mark job as finished and sets the state
     * @ignore
     */
    finishJob(id: number | string, retryCount: number): void;
    /**
     * Mark job as failed and sets the state
     * @ignore
     */
    failJob(id: number | string, retryCount: number): void;
    /**
     * Discards a started job without affecting the finished/failed counters, e.g. when a request
     * turns out to be skipped (robots.txt, enqueue strategy) after `startJob` was already called for it.
     * @ignore
     */
    discardJob(id: number | string): void;
    /**
     * Calculate the current statistics
     */
    calculate(): CalculatedStatistics;
    /**
     * Initializes the key value store for persisting the statistics,
     * displaying the current state in predefined intervals
     */
    startCapturing(): Promise<void>;
    /**
     * Stops logging and remove event listeners, then persist
     */
    stopCapturing(): Promise<void>;
    private saveRetryCountForJob;
    /**
     * Persist internal state to the key value store.
     *
     * Statistics are bookkeeping - a store that refuses the write is worth a warning, not a failed crawl. The
     * crawler calls this from its migration handler, where a rejection would go unhandled.
     */
    persistState(): Promise<void>;
    /**
     * Make this class serializable when called with `JSON.stringify(statsInstance)` directly
     * or through `keyValueStore.setValue('KEY', statsInstance)`
     */
    toJSON(): StatisticPersistedState & PersistedStateExtension;
}
/**
 * Configuration for the {@apilink Statistics} instance used by the crawler
 */
export interface StatisticsOptions<StateExtension extends object = {}, PersistedStateExtension extends object = StateExtension> {
    /**
     * Interval in seconds to log the current statistics
     * @default 60
     */
    logIntervalSecs?: number;
    /**
     * Message to log with the current statistics
     * @default 'Statistics'
     */
    logMessage?: string;
    /**
     * Parent logger instance, the statistics will create a child logger from this.
     * @default crawler.log
     */
    log?: CrawleeLogger;
    /**
     * Key value store instance to persist the statistics.
     * If not provided, the default one will be used when capturing starts
     */
    keyValueStore?: KeyValueStore;
    /**
     * Control how and when to persist the statistics.
     */
    persistenceOptions?: PersistenceOptions;
    /**
     * Save HTML snapshot (and a screenshot if possible) when an error occurs.
     * @default false
     */
    saveErrorSnapshots?: boolean;
    /**
     * A unique identifier for this statistics instance. This ID is used for persistence
     * to the key value store, ensuring the same statistics can be loaded after script restarts.
     *
     * If not provided, an auto-incremented ID will be used for backward compatibility.
     * This means statistics may not persist correctly across script restarts
     * if crawler creation order changes.
     */
    id?: string;
    /**
     * Custom fields to track alongside the built-in {@apilink StatisticState} ones. They become part of
     * {@apilink Statistics.state|`state`} (typed as such), are persisted with the rest of the state, and are
     * restored on migration or resurrect.
     *
     * ```ts
     * const statistics = new Statistics({ stateExtension: { defaultState: { productsFound: 0 } } });
     * statistics.state.productsFound++;
     * ```
     */
    stateExtension?: StatisticStateExtensionOptions<StateExtension, PersistedStateExtension>;
}
/**
 * How the custom fields of {@apilink StatisticsOptions.stateExtension} are initialized and converted to and from the
 * persisted record - the same three things {@apilink RecoverableStateOptions} asks for, scoped to the custom half
 * of the statistics state.
 */
export interface StatisticStateExtensionOptions<StateExtension extends object, PersistedStateExtension extends object = StateExtension> {
    /**
     * The values the fields start with, and the ones {@apilink Statistics.reset} restores. A plain value is
     * deep-copied with `structuredClone` each time it is used; pass a factory for a state `structuredClone` cannot
     * rebuild.
     *
     * Can be omitted when `deserialize` supplies its own defaults, which is then the single place the fields are
     * declared - see the example on {@apilink StatisticStateExtensionOptions.deserialize|`deserialize`}.
     */
    defaultState?: StateExtension | (() => StateExtension);
    /**
     * Rebuilds the custom fields from the persisted record, and the place to validate them before trusting them.
     * Receives the whole record, so it has to supply a value for every field - `.default()` in a schema, or
     * {@apilink StatisticStateExtensionOptions.defaultState|`defaultState`} alongside a conversion that copes with
     * a missing field itself.
     *
     * ```ts
     * const statistics = new Statistics({
     *     stateExtension: { deserialize: z.object({ productsFound: z.number().default(0) }) },
     * });
     * ```
     *
     * Without it, the declared fields are restored as they were persisted - which is a record off the key-value
     * store taken at its word, `productsFound` included in whatever type it happens to hold.
     *
     * A conversion that rejects the record costs the custom fields their persisted values (they start from the
     * defaults, with a warning) and nothing else.
     */
    deserialize?: SyncStateConversion<unknown, StateExtension>;
    /**
     * Converts the custom fields to the JSON-serializable form they are persisted in. Not needed for fields that
     * already are one - pair it with `deserialize` for the fields that are not.
     */
    serialize?: SyncStateConversion<StateExtension, PersistedStateExtension>;
}
/**
 * Format of the persisted stats.
 *
 * The `null`s are `Infinity` on the way out - JSON has no infinity, so a record written before anything
 * finished or failed carries a `null` in its place.
 */
export interface StatisticPersistedState extends Omit<StatisticState, 'statsPersistedAt' | 'crawlerStartedAt' | 'crawlerFinishedAt' | 'requestMinDurationMillis' | 'requestsFailedPerMinute' | 'requestsFinishedPerMinute' | 'requestRetryHistogram' | 'instanceStart'> {
    statsId: string;
    requestsFailedPerMinute: number | null;
    requestsFinishedPerMinute: number | null;
    /** ISO strings - the live state keeps these as `Date`s. */
    crawlerStartedAt: string | null;
    crawlerFinishedAt: string | null;
    statsPersistedAt: string;
    requestMinDurationMillis: number | null;
    /** A retry count that no request ever reached leaves a `null` here. */
    requestRetryHistogram: (number | null)[];
    requestAvgFailedDurationMillis: number | null;
    requestAvgFinishedDurationMillis: number | null;
    requestTotalDurationMillis: number;
    requestsTotal: number;
    /** {@apilink StatisticState.instanceStart} of the run that wrote the record. */
    crawlerLastStartTimestamp: number;
}
/**
 * Contains the statistics state
 */
export interface StatisticState {
    requestsFinished: number;
    requestsFailed: number;
    requestsRetries: number;
    requestsFailedPerMinute: number;
    requestsFinishedPerMinute: number;
    requestMinDurationMillis: number;
    requestMaxDurationMillis: number;
    requestTotalFailedDurationMillis: number;
    requestTotalFinishedDurationMillis: number;
    crawlerStartedAt: Date | string | null;
    crawlerFinishedAt: Date | string | null;
    crawlerRuntimeMillis: number;
    statsPersistedAt: Date | string | null;
    errors: Record<string, unknown>;
    retryErrors: Record<string, unknown>;
    requestsWithStatusCode: Record<string, number>;
    /** Retries histogram - index `i` holds the number of requests that finished after `i` retries. */
    requestRetryHistogram: number[];
    /**
     * When the current capture window started, as a `Date.now()` timestamp. Rebased on load so that the runtime
     * reported by {@apilink Statistics.calculate} spans a migration rather than restarting from zero.
     */
    instanceStart: number;
}
