import { ErrorTracker } from '@crawlee/utils';
import { KeyValueStore } from '../storages/key_value_store';
import { Configuration } from '../configuration';
/**
 * @ignore
 */
declare class Job {
    private lastRunAt;
    private runs;
    private durationMillis?;
    run(): number;
    finish(): number;
    retryCount(): number;
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
export declare class Statistics {
    private static id;
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
    readonly id: number;
    /**
     * Current statistic state used for doing calculations on {@apilink Statistics.calculate} calls
     */
    state: StatisticState;
    /**
     * Contains the current retries histogram. Index 0 means 0 retries, index 2, 2 retries, and so on
     */
    readonly requestRetryHistogram: number[];
    private keyValueStore?;
    private persistStateKey;
    private logIntervalMillis;
    private logMessage;
    private listener;
    private requestsInProgress;
    private readonly log;
    private instanceStart;
    private logInterval;
    private events;
    /**
     * @internal
     */
    constructor(options?: StatisticsOptions);
    /**
     * Set the current statistic instance to pristine values
     */
    reset(): void;
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
    finishJob(id: number | string): void;
    /**
     * Mark job as failed and sets the state
     * @ignore
     */
    failJob(id: number | string): void;
    /**
     * Calculate the current statistics
     */
    calculate(): {
        requestAvgFailedDurationMillis: number;
        requestAvgFinishedDurationMillis: number;
        requestsFinishedPerMinute: number;
        requestsFailedPerMinute: number;
        requestTotalDurationMillis: number;
        requestsTotal: number;
        crawlerRuntimeMillis: number;
    };
    /**
     * Initializes the key value store for persisting the statistics,
     * displaying the current state in predefined intervals
     */
    startCapturing(): Promise<void>;
    /**
     * Stops logging and remove event listeners, then persist
     */
    stopCapturing(): Promise<void>;
    protected _saveRetryCountForJob(job: Job): void;
    /**
     * Persist internal state to the key value store
     */
    persistState(): Promise<void>;
    /**
     * Loads the current statistic from the key value store if any
     */
    protected _maybeLoadStatistics(): Promise<void>;
    protected _teardown(): void;
    /**
     * Make this class serializable when called with `JSON.stringify(statsInstance)` directly
     * or through `keyValueStore.setValue('KEY', statsInstance)`
     */
    toJSON(): StatisticPersistedState;
}
interface StatisticsOptions {
    logIntervalSecs?: number;
    logMessage?: string;
    keyValueStore?: KeyValueStore;
    config?: Configuration;
}
/**
 * Format of the persisted stats
 */
export interface StatisticPersistedState extends Omit<StatisticState, 'statsPersistedAt'> {
    requestRetryHistogram: number[];
    statsId: number;
    requestAvgFailedDurationMillis: number;
    requestAvgFinishedDurationMillis: number;
    requestsFinishedPerMinute: number;
    requestsFailedPerMinute: number;
    requestTotalDurationMillis: number;
    requestsTotal: number;
    crawlerRuntimeMillis: number;
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
export {};
//# sourceMappingURL=statistics.d.ts.map