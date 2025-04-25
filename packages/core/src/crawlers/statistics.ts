import ow from 'ow';

import type { Log } from '@apify/log';

import { Configuration } from '../configuration';
import type { EventManager } from '../events/event_manager';
import { EventType } from '../events/event_manager';
import { log as defaultLog } from '../log';
import { KeyValueStore } from '../storages/key_value_store';
import { ErrorTracker } from './error_tracker';

/**
 * @ignore
 */
class Job {
    private lastRunAt: number | null = null;
    private durationMillis?: number;

    run() {
        this.lastRunAt = Date.now();
    }

    finish() {
        this.durationMillis = Date.now() - this.lastRunAt!;
        return this.durationMillis;
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
 * The statistics class provides an interface to collecting and logging run
 * statistics for requests.
 *
 * All statistic information is saved on key value store
 * under the key `SDK_CRAWLER_STATISTICS_*`, persists between
 * migrations and abort/resurrect
 *
 * @category Crawlers
 */
export class Statistics {
    private static id = 0;

    /**
     * An error tracker for final retry errors.
     */
    errorTracker: ErrorTracker;

    /**
     * An error tracker for retry errors prior to the final retry.
     */
    errorTrackerRetry: ErrorTracker;

    /**
     * Statistic instance id.
     */
    readonly id = Statistics.id++; // assign an id while incrementing so it can be saved/restored from KV

    /**
     * Current statistic state used for doing calculations on {@apilink Statistics.calculate} calls
     */
    state!: StatisticState;

    /**
     * Contains the current retries histogram. Index 0 means 0 retries, index 2, 2 retries, and so on
     */
    readonly requestRetryHistogram: number[] = [];

    /**
     * Contains the associated Configuration instance
     */
    private readonly config: Configuration;

    protected keyValueStore?: KeyValueStore = undefined;
    protected persistStateKey = `SDK_CRAWLER_STATISTICS_${this.id}`;
    private logIntervalMillis: number;
    private logMessage: string;
    private listener: () => Promise<void>;
    private requestsInProgress = new Map<number | string, Job>();
    private readonly log: Log;
    private instanceStart!: number;
    private logInterval: unknown;
    private events: EventManager;
    private persistenceOptions: PersistenceOptions;

    /**
     * @internal
     */
    constructor(options: StatisticsOptions = {}) {
        ow(
            options,
            ow.object.exactShape({
                logIntervalSecs: ow.optional.number,
                logMessage: ow.optional.string,
                log: ow.optional.object,
                keyValueStore: ow.optional.object,
                config: ow.optional.object,
                persistenceOptions: ow.optional.object,
                saveErrorSnapshots: ow.optional.boolean,
            }),
        );

        const {
            logIntervalSecs = 60,
            logMessage = 'Statistics',
            keyValueStore,
            config = Configuration.getGlobalConfig(),
            persistenceOptions = {
                enable: true,
            },
            saveErrorSnapshots = false,
        } = options;

        this.log = (options.log ?? defaultLog).child({ prefix: 'Statistics' });
        this.errorTracker = new ErrorTracker({ ...errorTrackerConfig, saveErrorSnapshots });
        this.errorTrackerRetry = new ErrorTracker({ ...errorTrackerConfig, saveErrorSnapshots });
        this.logIntervalMillis = logIntervalSecs * 1000;
        this.logMessage = logMessage;
        this.keyValueStore = keyValueStore;
        this.listener = this.persistState.bind(this);
        this.events = config.getEventManager();
        this.config = config;
        this.persistenceOptions = persistenceOptions;

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
        };

        this.requestRetryHistogram.length = 0;
        this.requestsInProgress.clear();
        this.instanceStart = Date.now();

        this._teardown();
    }

    /**
     * @param options - Override the persistence options provided in the constructor
     */
    async resetStore(options?: PersistenceOptions) {
        if (!this.persistenceOptions.enable && !options?.enable) {
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
        let job = this.requestsInProgress.get(id);
        if (!job) job = new Job();
        job.run();
        this.requestsInProgress.set(id, job);
    }

    /**
     * Mark job as finished and sets the state
     * @ignore
     */
    finishJob(id: number | string, retryCount: number) {
        const job = this.requestsInProgress.get(id);
        if (!job) return;
        const jobDurationMillis = job.finish();
        this.state.requestsFinished++;
        this.state.requestTotalFinishedDurationMillis += jobDurationMillis;
        this._saveRetryCountForJob(retryCount);
        if (jobDurationMillis < this.state.requestMinDurationMillis)
            this.state.requestMinDurationMillis = jobDurationMillis;
        if (jobDurationMillis > this.state.requestMaxDurationMillis)
            this.state.requestMaxDurationMillis = jobDurationMillis;
        this.requestsInProgress.delete(id);
    }

    /**
     * Mark job as failed and sets the state
     * @ignore
     */
    failJob(id: number | string, retryCount: number) {
        const job = this.requestsInProgress.get(id);
        if (!job) return;
        this.state.requestTotalFailedDurationMillis += job.finish();
        this.state.requestsFailed++;
        this._saveRetryCountForJob(retryCount);
        this.requestsInProgress.delete(id);
    }

    /**
     * Calculate the current statistics
     */
    calculate() {
        const {
            requestsFailed,
            requestsFinished,
            requestTotalFailedDurationMillis,
            requestTotalFinishedDurationMillis,
        } = this.state;
        const totalMillis = Date.now() - this.instanceStart;
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
        this.keyValueStore ??= await KeyValueStore.open(null, { config: this.config });

        if (this.state.crawlerStartedAt === null) {
            this.state.crawlerStartedAt = new Date();
        }

        if (this.persistenceOptions.enable) {
            await this._maybeLoadStatistics();
            this.events.on(EventType.PERSIST_STATE, this.listener);
        }

        this.logInterval = setInterval(() => {
            this.log.info(this.logMessage, {
                ...this.calculate(),
                retryHistogram: this.requestRetryHistogram,
            });
        }, this.logIntervalMillis);
    }

    /**
     * Stops logging and remove event listeners, then persist
     */
    async stopCapturing() {
        this._teardown();

        this.state.crawlerFinishedAt = new Date();

        await this.persistState();
    }

    protected _saveRetryCountForJob(retryCount: number) {
        if (retryCount > 0) this.state.requestsRetries++;
        this.requestRetryHistogram[retryCount] ??= 0;
        this.requestRetryHistogram[retryCount]++;
    }

    /**
     * Persist internal state to the key value store
     * @param options - Override the persistence options provided in the constructor
     */
    async persistState(options?: PersistenceOptions) {
        if (!this.persistenceOptions.enable && !options?.enable) {
            return;
        }

        // this might be called before startCapturing was called without using await, should not crash
        if (!this.keyValueStore) {
            return;
        }

        this.log.debug('Persisting state', { persistStateKey: this.persistStateKey });

        await this.keyValueStore.setValue(this.persistStateKey, this.toJSON());
    }

    /**
     * Loads the current statistic from the key value store if any
     */
    protected async _maybeLoadStatistics() {
        // this might be called before startCapturing was called without using await, should not crash
        if (!this.keyValueStore) {
            return;
        }

        const savedState = await this.keyValueStore.getValue<StatisticPersistedState>(this.persistStateKey);

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
        this.instanceStart = Date.now() - (+this.state.statsPersistedAt! - savedState.crawlerLastStartTimestamp);

        this.log.debug('Loaded from KeyValueStore');
    }

    protected _teardown(): void {
        // this can be called before a call to startCapturing happens (or in a 'finally' block)
        this.events.off(EventType.PERSIST_STATE, this.listener);

        if (this.logInterval) {
            clearInterval(this.logInterval as number);
            this.logInterval = null;
        }
    }

    /**
     * Make this class serializable when called with `JSON.stringify(statsInstance)` directly
     * or through `keyValueStore.setValue('KEY', statsInstance)`
     */
    toJSON(): StatisticPersistedState {
        // merge all the current state information that can be used from the outside
        // without the need to reconstruct for the sake of stats.calculate()
        // omit duplicated information
        const result = {
            ...this.state,
            crawlerLastStartTimestamp: this.instanceStart,
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
export interface StatisticsOptions {
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
    log?: Log;

    /**
     * Key value store instance to persist the statistics.
     * If not provided, the default one will be used when capturing starts
     */
    keyValueStore?: KeyValueStore;

    /**
     * Configuration instance to use
     * @default Configuration.getGlobalConfig()
     */
    config?: Configuration;

    /**
     * Control how and when to persist the statistics.
     */
    persistenceOptions?: PersistenceOptions;

    /**
     * Save HTML snapshot (and a screenshot if possible) when an error occurs.
     * @default false
     */
    saveErrorSnapshots?: boolean;
}

/**
 * Format of the persisted stats
 */
export interface StatisticPersistedState extends Omit<StatisticState, 'statsPersistedAt'> {
    requestRetryHistogram: number[];
    statsId: number;
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
