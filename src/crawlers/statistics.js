import { checkParamOrThrow } from 'apify-client/build/utils';
import { openKeyValueStore } from '../key_value_store';
import { ACTOR_EVENT_NAMES_EX } from '../constants';
import defaultLog from '../utils_log';
import events from '../events';

/**
 * @private
 */
class Job {
    constructor() {
        this.lastRunAt = null;
        this.runs = 0;
    }

    run() {
        this.lastRunAt = Date.now();
        return ++this.runs;
    }

    finish() {
        this.durationMillis = Date.now() - this.lastRunAt;
        return this.durationMillis;
    }

    retryCount() {
        return Math.max(0, this.runs - 1);
    }
}

/**
 * The statistics class provides an interface to collecting and logging run
 * statistics for requests.
 *
 * All statistic information is saved on key value store
 * under the key SDK_CRAWLER_STATISTICS_*, persists between
 * migrations and abort/resurrect
 *
 * @property {StatisticState} state
 *   Current statistic state used for doing calculations on {@link Statistics#calculate} calls
 * @property {number} id
 *   Statistic instance id
 * @property {number[]} requestRetryHistogram
 *   Contains the current retries histogram.
 *   Index 0 means 0 retries, index 2, 2 retries,
 *   and so on
 */
class Statistics {
    /**
     * @param {StatisticsOptions} options
     * @hideconstructor
     */
    constructor(options = {}) {
        const {
            logIntervalSecs = 60,
            logMessage = 'Statistics',
        } = options;

        checkParamOrThrow(logIntervalSecs, 'options.logIntervalSecs', 'Number');
        checkParamOrThrow(logMessage, 'options.logMessage', 'String');

        this.log = defaultLog.child({ prefix: 'Statistics' });
        this.logIntervalMillis = logIntervalSecs * 1000;
        this.logMessage = logMessage;
        this.keyValueStore = null;
        // assign an id while incrementing so it can be saved/restored from KV
        this.id = Statistics.id++;
        this.persistStateKey = `SDK_CRAWLER_STATISTICS_${this.id}`;
        this.listener = this.persistState.bind(this);
        this.requestRetryHistogram = [];

        /**
         * @private
         * @type {Map<string | number, Job>}
         */
        this.requestsInProgress = new Map();

        // initialize by "resetting"
        this.reset();
    }

    /**
     * Set the current statistic instance to pristine values
     */
    reset() {
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
        };

        this.requestRetryHistogram.length = 0;
        this.requestsInProgress.clear();
        this.instanceStart = Date.now();

        this._teardown();
    }

    /**
     * Starts a job
     *
     * @param {number|string} id
     * @ignore
     */
    startJob(id) {
        let job = this.requestsInProgress.get(id);
        if (!job) job = new Job();
        job.run();
        this.requestsInProgress.set(id, job);
    }

    /**
     * Mark job as finished and sets the state
     *
     * @param {number|string} id
     * @ignore
     */
    finishJob(id) {
        const job = this.requestsInProgress.get(id);
        if (!job) return;
        const jobDurationMillis = job.finish();
        this.state.requestsFinished++;
        this.state.requestTotalFinishedDurationMillis += jobDurationMillis;
        this._saveRetryCountForJob(job);
        if (jobDurationMillis < this.state.requestMinDurationMillis) this.state.requestMinDurationMillis = jobDurationMillis;
        if (jobDurationMillis > this.state.requestMaxDurationMillis) this.state.requestMaxDurationMillis = jobDurationMillis;
        this.requestsInProgress.delete(id);
    }

    /**
     * Mark job as failed and sets the state
     *
     * @param {number|string} id
     * @ignore
     */
    failJob(id) {
        const job = this.requestsInProgress.get(id);
        if (!job) return;
        this.state.requestTotalFailedDurationMillis += job.finish();
        this.state.requestsFailed++;
        this._saveRetryCountForJob(job);
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
            requestAvgFinishedDurationMillis: Math.round(requestTotalFinishedDurationMillis / requestsFinished) || Infinity,
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
        this.keyValueStore = await openKeyValueStore();

        await this._maybeLoadStatistics();

        if (this.state.crawlerStartedAt === null) {
            this.state.crawlerStartedAt = new Date();
        }

        events.on(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, this.listener);

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

    /**
     * @private
     * @param {Job} job
     */
    _saveRetryCountForJob(job) {
        const retryCount = job.retryCount();
        if (retryCount > 0) this.state.requestsRetries++;
        this.requestRetryHistogram[retryCount] = this.requestRetryHistogram[retryCount]
            ? this.requestRetryHistogram[retryCount] + 1
            : 1;
    }

    /**
     * Persist internal state to the key value store
     */
    async persistState() {
        // this might be called before startCapturing was called without using await, should not crash
        if (!this.keyValueStore) {
            return;
        }

        this.log.debug('Persisting state', { persistStateKey: this.persistStateKey });

        await this.keyValueStore.setValue(this.persistStateKey, this.toJSON());
    }

    /**
     * Loads the current statistic from the key value store if any
     * @private
     */
    async _maybeLoadStatistics() {
        // this might be called before startCapturing was called without using await, should not crash
        if (!this.keyValueStore) {
            return;
        }

        const savedState = await this.keyValueStore.getValue(this.persistStateKey);

        if (!savedState) return;

        this.log.debug('Recreating state from KeyValueStore', { persistStateKey: this.persistStateKey });

        this.requestRetryHistogram.push(...savedState.requestRetryHistogram);
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
        this.instanceStart = Date.now() - (this.state.statsPersistedAt - savedState.crawlerLastStartTimestamp);

        this.log.debug('Loaded from KeyValueStore');
    }

    /**
     * @private
     */
    _teardown() {
        // this can be called before a call to startCapturing happens (or in a 'finally' block)
        events.removeListener(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, this.listener);

        if (this.logInterval) {
            clearInterval(this.logInterval);
            this.logInterval = null;
        }
    }

    /**
     * Make this class serializable when called with `JSON.stringify(statsInstance)` directly
     * or through `keyValueStore.setValue('KEY', statsInstance)`
     *
     * @returns {StatisticPersistedState | StatisticState}
     */
    toJSON() {
        // merge all the current state information that can be used from the outside
        // without the need to reconstruct for the sake of stats.calculate()
        // omit duplicated information
        return {
            ...this.state,
            crawlerLastStartTimestamp: this.instanceStart,
            crawlerFinishedAt: this.state.crawlerFinishedAt ? new Date(this.state.crawlerFinishedAt).toISOString() : null,
            crawlerStartedAt: this.state.crawlerStartedAt ? new Date(this.state.crawlerStartedAt).toISOString() : null,
            requestRetryHistogram: this.requestRetryHistogram,
            statsId: this.id,
            statsPersistedAt: new Date().toISOString(),
            ...this.calculate(),
        };
    }
}

Statistics.id = 0;

export default Statistics;

/**
 * @ignore
 * @typedef StatisticsOptions
 * @property {number} [logIntervalSecs]
 * @property {string} [logMessage]
 */

/**
 * Format of the persisted stats
 *
 * @typedef StatisticPersistedState
 * @property {number[]} requestRetryHistogram
 * @property {number} statsId
 * @property {number} requestAvgFailedDurationMillis
 * @property {number} requestAvgFinishedDurationMillis
 * @property {number} requestsFinishedPerMinute
 * @property {number} requestsFailedPerMinute
 * @property {number} requestTotalDurationMillis
 * @property {number} requestsTotal
 * @property {number} crawlerRuntimeMillis
 * @property {number} crawlerLastStartTimestamp
 * @property {string} statsPersistedAt
 */

/**
 * Contains the statistics state
 *
 * @typedef StatisticState
 * @property {number} requestsFinished
 * @property {number} requestsFailed
 * @property {number} requestsRetries
 * @property {number} requestsFailedPerMinute
 * @property {number} requestsFinishedPerMinute
 * @property {number} requestMinDurationMillis
 * @property {number} requestMaxDurationMillis
 * @property {number} requestTotalFailedDurationMillis
 * @property {number} requestTotalFinishedDurationMillis
 * @property {Date|string|null} crawlerStartedAt
 * @property {Date|string|null} crawlerFinishedAt
 * @property {number} crawlerRuntimeMillis
 * @property {Date|string|null} statsPersistedAt
 */
