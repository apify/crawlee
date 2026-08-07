import type { StandardSchemaV1 } from '@standard-schema/spec';
import ow from 'ow';

import type { EventManager } from '../events/event_manager.js';
import { EventType } from '../events/event_manager.js';
import type { CrawleeLogger } from '../log.js';
import { serviceLocator } from '../service_locator.js';
import { KeyValueStore } from '../storages/key_value_store.js';
import { ErrorTracker } from './error_tracker.js';

/**
 * @ignore
 */
class Job {
    #lastRunAt: number | null = null;
    #durationMillis?: number;

    run() {
        this.#lastRunAt = Date.now();
    }

    finish() {
        this.#durationMillis = Date.now() - this.#lastRunAt!;
        return this.#durationMillis;
    }
}

const errorTrackerConfig = {
    showErrorCode: true,
    showErrorName: true,
    showStackTrace: true,
    showFullStack: false,
    showErrorMessage: true,
    showFullMessage: false,
};

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
 * The owned-only mutators the crawler uses to *own* a default it built - `reset()`/`resetStore()` - are deliberately
 * absent: an injected instance is borrowed, and the crawler never wipes it. Those live on the concrete
 * {@apilink Statistics} only.
 *
 * `StateExtension` describes the custom fields tracked alongside the built-in {@apilink StatisticState} ones - see
 * {@apilink StatisticsOptions.defaultState}.
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
    persistState?(options?: PersistenceOptions): Promise<void>;
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
 * Custom fields are tracked by passing {@apilink StatisticsOptions.defaultState|`defaultState`} - the extra fields
 * are then part of {@apilink Statistics.state|`state`}, persisted and restored along with the built-in ones:
 *
 * ```ts
 * const statistics = new Statistics({ defaultState: { productsFound: 0 } });
 * const crawler = new CheerioCrawler({
 *     statistics,
 *     requestHandler: async () => {
 *         statistics.state.productsFound++;
 *     },
 * });
 * ```
 *
 * @category Crawlers
 */
export class Statistics<StateExtension extends object = {}> implements IStatistics<StateExtension> {
    // kept as TS-private: statistics tests read the static counter directly
    private static id = 0;

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

    /**
     * Current statistic state used for doing calculations on {@apilink Statistics.calculate} calls
     */
    state!: StatisticState & StateExtension;

    /**
     * Contains the current retries histogram. Index 0 means 0 retries, index 2, 2 retries, and so on
     */
    readonly requestRetryHistogram: number[] = [];

    protected keyValueStore?: KeyValueStore = undefined;
    protected readonly persistStateKey: string;
    readonly #defaultStateExtension: StateExtension;
    readonly #stateSchema?: StandardSchemaV1<unknown, StateExtension>;
    #logIntervalMillis: number;
    #logMessage: string;
    #listener: () => Promise<void>;
    #requestsInProgress = new Map<number | string, Job>();
    private readonly log: CrawleeLogger;
    #instanceStart!: number;
    #logInterval: unknown;
    #events?: EventManager;
    #persistenceOptions: PersistenceOptions;

    private get events(): EventManager {
        if (!this.#events) {
            this.#events = serviceLocator.getEventManager();
        }
        return this.#events;
    }

    /**
     * Construct a statistics instance to pass to a crawler via its `statistics` option, e.g. to preconfigure
     * persistence or error snapshots, share it across sequential runs, or track extra fields via `defaultState`.
     */
    constructor(options: StatisticsOptions<StateExtension> = {}) {
        ow(
            options,
            ow.object.exactShape({
                logIntervalSecs: ow.optional.number,
                logMessage: ow.optional.string,
                log: ow.optional.object,
                keyValueStore: ow.optional.object,
                persistenceOptions: ow.optional.object,
                saveErrorSnapshots: ow.optional.boolean,
                id: ow.optional.any(ow.number, ow.string),
                defaultState: ow.optional.object,
                stateSchema: ow.optional.object,
            }),
        );

        const {
            logIntervalSecs = 60,
            logMessage = 'Statistics',
            keyValueStore,
            persistenceOptions = {
                enable: true,
            },
            saveErrorSnapshots = false,
            id,
            defaultState = {} as StateExtension,
            stateSchema,
        } = options;

        this.id = id ?? String(Statistics.id++);
        this.persistStateKey = `CRAWLEE_CRAWLER_STATISTICS_${this.id}`;

        this.log = (options.log ?? serviceLocator.getLogger()).child({ prefix: 'Statistics' });
        this.errorTracker = new ErrorTracker({ ...errorTrackerConfig, saveErrorSnapshots });
        this.errorTrackerRetry = new ErrorTracker({ ...errorTrackerConfig, saveErrorSnapshots });
        this.#logIntervalMillis = logIntervalSecs * 1000;
        this.#logMessage = logMessage;
        this.keyValueStore = keyValueStore;
        this.#listener = this.persistState.bind(this);
        this.#persistenceOptions = persistenceOptions;
        this.#defaultStateExtension = defaultState;
        this.#stateSchema = stateSchema;

        // initialize by "resetting"
        this.reset();
    }

    /**
     * Set the current statistic instance to pristine values
     */
    reset() {
        this.errorTracker.reset();
        this.errorTrackerRetry.reset();

        this.state = {
            requestsFinished: 0,
            requestsFailed: 0,
            requestsRetries: 0,
            requestsFailedPerMinute: 0,
            requestsFinishedPerMinute: 0,
            requestMinDurationMillis: Infinity,
            requestMaxDurationMillis: 0,
            requestTotalFailedDurationMillis: 0,
            requestTotalFinishedDurationMillis: 0,
            crawlerStartedAt: null,
            crawlerFinishedAt: null,
            statsPersistedAt: null,
            crawlerRuntimeMillis: 0,
            requestsWithStatusCode: {},
            errors: this.errorTracker.result,
            retryErrors: this.errorTrackerRetry.result,
            // Cloned so that mutating the state never writes through to the defaults of a later reset()
            ...structuredClone(this.#defaultStateExtension),
        };

        this.requestRetryHistogram.length = 0;
        this.#requestsInProgress.clear();
        this.#instanceStart = Date.now();

        this.teardown();
    }

    /**
     * @param options - Override the persistence options provided in the constructor
     */
    async resetStore(options?: PersistenceOptions) {
        if (!this.#persistenceOptions.enable && !options?.enable) {
            return;
        }

        if (!this.keyValueStore) {
            return;
        }

        await this.keyValueStore.setValue(this.persistStateKey, null);
    }

    /**
     * Increments the status code counter.
     */
    registerStatusCode(code: number) {
        const s = String(code);

        if (this.state.requestsWithStatusCode[s] === undefined) {
            this.state.requestsWithStatusCode[s] = 0;
        }

        this.state.requestsWithStatusCode[s]++;
    }

    /**
     * Starts a job
     * @ignore
     */
    startJob(id: number | string) {
        let job = this.#requestsInProgress.get(id);
        if (!job) job = new Job();
        job.run();
        this.#requestsInProgress.set(id, job);
    }

    /**
     * Mark job as finished and sets the state
     * @ignore
     */
    finishJob(id: number | string, retryCount: number) {
        const job = this.#requestsInProgress.get(id);
        if (!job) return;
        const jobDurationMillis = job.finish();
        this.state.requestsFinished++;
        this.state.requestTotalFinishedDurationMillis += jobDurationMillis;
        this.saveRetryCountForJob(retryCount);
        if (jobDurationMillis < this.state.requestMinDurationMillis)
            this.state.requestMinDurationMillis = jobDurationMillis;
        if (jobDurationMillis > this.state.requestMaxDurationMillis)
            this.state.requestMaxDurationMillis = jobDurationMillis;
        this.#requestsInProgress.delete(id);
    }

    /**
     * Mark job as failed and sets the state
     * @ignore
     */
    failJob(id: number | string, retryCount: number) {
        const job = this.#requestsInProgress.get(id);
        if (!job) return;
        this.state.requestTotalFailedDurationMillis += job.finish();
        this.state.requestsFailed++;
        this.saveRetryCountForJob(retryCount);
        this.#requestsInProgress.delete(id);
    }

    /**
     * Discards a started job without affecting the finished/failed counters, e.g. when a request
     * turns out to be skipped (robots.txt, enqueue strategy) after `startJob` was already called for it.
     * @ignore
     */
    discardJob(id: number | string) {
        this.#requestsInProgress.delete(id);
    }

    /**
     * Calculate the current statistics
     */
    calculate(): CalculatedStatistics {
        const {
            requestsFailed,
            requestsFinished,
            requestTotalFailedDurationMillis,
            requestTotalFinishedDurationMillis,
        } = this.state;
        const totalMillis = Date.now() - this.#instanceStart;
        const totalMinutes = totalMillis / 1000 / 60;

        return {
            requestAvgFailedDurationMillis: Math.round(requestTotalFailedDurationMillis / requestsFailed) || Infinity,
            requestAvgFinishedDurationMillis:
                Math.round(requestTotalFinishedDurationMillis / requestsFinished) || Infinity,
            requestsFinishedPerMinute: Math.round(requestsFinished / totalMinutes) || 0,
            requestsFailedPerMinute: Math.floor(requestsFailed / totalMinutes) || 0,
            requestTotalDurationMillis: requestTotalFinishedDurationMillis + requestTotalFailedDurationMillis,
            requestsTotal: requestsFailed + requestsFinished,
            crawlerRuntimeMillis: totalMillis,
        };
    }

    /**
     * Initializes the key value store for persisting the statistics,
     * displaying the current state in predefined intervals
     */
    async startCapturing() {
        // A single instance drives one logging interval and one PERSIST_STATE listener, so a second concurrent
        // capture (e.g. sharing one instance across crawlers running at once) would orphan the first. Fail loudly.
        if (this.#logInterval) {
            throw new Error('Statistics.startCapturing() was already called - this instance is already capturing.');
        }

        this.keyValueStore ??= await KeyValueStore.open(null, { configuration: serviceLocator.getConfiguration() });

        if (this.state.crawlerStartedAt === null) {
            this.state.crawlerStartedAt = new Date();
        }

        if (this.#persistenceOptions.enable) {
            await this.maybeLoadStatistics();
            this.events.on(EventType.PERSIST_STATE, this.#listener);
        }

        this.#logInterval = setInterval(() => {
            this.log.info(this.#logMessage, {
                ...this.calculate(),
                retryHistogram: this.requestRetryHistogram,
            });
        }, this.#logIntervalMillis);
    }

    /**
     * Stops logging and remove event listeners, then persist
     */
    async stopCapturing() {
        this.teardown();

        this.state.crawlerFinishedAt = new Date();

        await this.persistState();
    }

    private saveRetryCountForJob(retryCount: number) {
        if (retryCount > 0) this.state.requestsRetries++;
        this.requestRetryHistogram[retryCount] ??= 0;
        this.requestRetryHistogram[retryCount]++;
    }

    /**
     * Persist internal state to the key value store
     * @param options - Override the persistence options provided in the constructor
     */
    async persistState(options?: PersistenceOptions) {
        if (!this.#persistenceOptions.enable && !options?.enable) {
            return;
        }

        // this might be called before startCapturing was called without using await, should not crash
        if (!this.keyValueStore) {
            return;
        }

        this.log.debug('Persisting state', { persistStateKey: this.persistStateKey });

        await this.keyValueStore
            .setValue(this.persistStateKey, this.toJSON())
            .catch((error) =>
                this.log.warning(`Failed to persist the statistics to ${this.persistStateKey}`, { error }),
            );
    }

    /**
     * Loads the current statistic from the key value store if any
     */
    protected async maybeLoadStatistics() {
        // this might be called before startCapturing was called without using await, should not crash
        if (!this.keyValueStore) {
            return;
        }

        // The custom fields are `Partial` - a record written before they were declared has none of them.
        const savedState = await this.keyValueStore.getValue<StatisticPersistedState & Partial<StateExtension>>(
            this.persistStateKey,
        );

        if (!savedState) return;

        // We saw a run where the requestRetryHistogram was not iterable and crashed
        // the crawler. Adding some logging to monitor this problem in the future.
        if (!Array.isArray(savedState.requestRetryHistogram)) {
            this.log.warning('Received invalid state from Key-value store.', {
                persistStateKey: this.persistStateKey,
                state: savedState,
            });
        }

        this.log.debug('Recreating state from KeyValueStore', { persistStateKey: this.persistStateKey });

        // the `requestRetryHistogram` array might be very large, we could end up with
        // `RangeError: Maximum call stack size exceeded` if we use `a.push(...b)`
        savedState.requestRetryHistogram.forEach((idx) => this.requestRetryHistogram.push(idx));
        this.state.requestsFinished = savedState.requestsFinished;
        this.state.requestsFailed = savedState.requestsFailed;
        this.state.requestsRetries = savedState.requestsRetries;

        this.state.requestTotalFailedDurationMillis = savedState.requestTotalFailedDurationMillis;
        this.state.requestTotalFinishedDurationMillis = savedState.requestTotalFinishedDurationMillis;
        this.state.requestMinDurationMillis = savedState.requestMinDurationMillis;
        this.state.requestMaxDurationMillis = savedState.requestMaxDurationMillis;
        // persisted state uses ISO date strings
        this.state.crawlerFinishedAt = savedState.crawlerFinishedAt ? new Date(savedState.crawlerFinishedAt) : null;
        this.state.crawlerStartedAt = savedState.crawlerStartedAt ? new Date(savedState.crawlerStartedAt) : null;
        this.state.statsPersistedAt = savedState.statsPersistedAt ? new Date(savedState.statsPersistedAt) : null;
        this.state.crawlerRuntimeMillis = savedState.crawlerRuntimeMillis;
        this.#instanceStart = Date.now() - (+this.state.statsPersistedAt! - savedState.crawlerLastStartTimestamp);

        await this.loadStateExtension(savedState);

        this.log.debug('Loaded from KeyValueStore');
    }

    /**
     * Restores the custom {@apilink StatisticsOptions.defaultState|`defaultState`} fields from the persisted state.
     *
     * A field missing from the persisted record keeps its default, so adding a field between runs does not leave it
     * `undefined`. When a {@apilink StatisticsOptions.stateSchema|`stateSchema`} is provided and the restored fields
     * fail validation, the whole extension falls back to the defaults - a schema change (or a hand-edited record)
     * degrades the custom fields instead of poisoning the run.
     */
    private async loadStateExtension(savedState: Partial<StateExtension>): Promise<void> {
        const keys = Object.keys(this.#defaultStateExtension) as (keyof StateExtension)[];

        if (keys.length === 0) {
            return;
        }

        const restored = structuredClone(this.#defaultStateExtension);

        for (const key of keys) {
            const savedValue = savedState[key];

            if (savedValue !== undefined) {
                restored[key] = savedValue;
            }
        }

        if (!this.#stateSchema) {
            Object.assign(this.state, restored);
            return;
        }

        const result = await this.#stateSchema['~standard'].validate(restored);

        if (result.issues) {
            this.log.warning('Persisted custom statistics state failed validation, falling back to the defaults.', {
                persistStateKey: this.persistStateKey,
                issues: result.issues,
            });
            return;
        }

        Object.assign(this.state, result.value);
    }

    private teardown(): void {
        // this can be called before a call to startCapturing happens (or in a 'finally' block)
        // Only unsubscribe if event manager was already resolved — avoid eagerly resolving it
        // (e.g. during the constructor's reset() call, which would capture the wrong context)
        this.#events?.off(EventType.PERSIST_STATE, this.#listener);

        if (this.#logInterval) {
            clearInterval(this.#logInterval as number);
            this.#logInterval = null;
        }
    }

    /**
     * Make this class serializable when called with `JSON.stringify(statsInstance)` directly
     * or through `keyValueStore.setValue('KEY', statsInstance)`
     */
    toJSON(): StatisticPersistedState & StateExtension {
        // merge all the current state information that can be used from the outside
        // without the need to reconstruct for the sake of stats.calculate()
        // omit duplicated information
        const result = {
            ...this.state,
            crawlerLastStartTimestamp: this.#instanceStart,
            crawlerFinishedAt: this.state.crawlerFinishedAt
                ? new Date(this.state.crawlerFinishedAt).toISOString()
                : null,
            crawlerStartedAt: this.state.crawlerStartedAt ? new Date(this.state.crawlerStartedAt).toISOString() : null,
            requestRetryHistogram: this.requestRetryHistogram,
            statsId: this.id,
            statsPersistedAt: new Date().toISOString(),
            ...this.calculate(),
        };

        Reflect.deleteProperty(result, 'requestsWithStatusCode');
        Reflect.deleteProperty(result, 'errors');
        Reflect.deleteProperty(result, 'retryErrors');

        result.requestsWithStatusCode = this.state.requestsWithStatusCode;
        result.errors = this.state.errors;
        result.retryErrors = this.state.retryErrors;

        return result;
    }
}

/**
 * Configuration for the {@apilink Statistics} instance used by the crawler
 */
export interface StatisticsOptions<StateExtension extends object = {}> {
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
     * Initial values of custom fields to track alongside the built-in {@apilink StatisticState} ones. The fields
     * become part of {@apilink Statistics.state|`state`} (typed as such), are persisted with the rest of the state,
     * and are restored on migration or resurrect. `reset()` returns them to these values.
     *
     * ```ts
     * const statistics = new Statistics({ defaultState: { productsFound: 0 } });
     * statistics.state.productsFound++;
     * ```
     */
    defaultState?: StateExtension;

    /**
     * An optional [Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType, …) describing the
     * `defaultState` fields. It validates them when they are restored from the key-value store - values that fail
     * validation fall back to `defaultState`, so a schema change between runs does not corrupt the statistics.
     *
     * The custom field *types* come from `defaultState`, so a schema is never required.
     */
    stateSchema?: StandardSchemaV1<unknown, NoInfer<StateExtension>>;
}

/**
 * Format of the persisted stats
 */
export interface StatisticPersistedState extends Omit<StatisticState, 'statsPersistedAt'> {
    requestRetryHistogram: number[];
    statsId: string;
    requestAvgFailedDurationMillis: number;
    requestAvgFinishedDurationMillis: number;
    requestTotalDurationMillis: number;
    requestsTotal: number;
    crawlerLastStartTimestamp: number;
    statsPersistedAt: string;
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
}
