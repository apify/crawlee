import { checkParamOrThrow } from 'apify-client/build/utils';
import { openKeyValueStore } from '../key_value_store';
import { ACTOR_EVENT_NAMES_EX } from '../constants';
import defaultLog from '../utils_log';
import events from '../events';

class Job {
    constructor() {
        this.lastRunAt = null;
        this.runs = 0;
    }

    run() {
        this.lastRunAt = new Date();
        return ++this.runs;
    }

    finish() {
        this.durationMillis = new Date() - this.lastRunAt;
        return this.durationMillis;
    }

    retryCount() {
        return Math.max(0, this.runs - 1);
    }
}

/**
 * The statistics class provides an interface to collecting and logging run
 * statistics of arbitrary jobs. Currently it provides the following information:
 *
 *  - Average run time of successful jobs
 *  - Number of successful jobs per minute
 *  - Total number of successful jobs
 *  - Total number of failed jobs
 *  - A histogram of retry counts = Number of jobs that finished after N retries.
 *
 * @hideconstructor
 */
class Statistics {
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
        this.persistStateKey = `STATISTICS_STATE_${this.id}`;
        this.listener = this.persistState.bind(this);

        // initialize by "resetting"
        this.reset();
    }

    /**
     * Set the current statistic instance to pristine values
     */
    reset() {
        if (!this.jobRetryHistogram) {
            this.jobRetryHistogram = [];
        } else {
            this.jobRetryHistogram.length = 0;
        }

        this.finishedJobs = 0;
        this.failedJobs = 0;

        if (!this.jobsInProgress) {
            this.jobsInProgress = new Map();
        } else {
            this.jobsInProgress.clear();
        }

        this.minJobDurationMillis = Infinity;
        this.maxJobDurationMillis = 0;
        this.totalJobDurationMillis = 0;
        this.startedAt = null;

        this._teardown();
    }

    /**
     * Starts a job
     *
     * @param {number|string} id
     */
    startJob(id) {
        if (!this.startedAt) this.startedAt = new Date();
        let job = this.jobsInProgress.get(id);
        if (!job) job = new Job();
        job.run();
        this.jobsInProgress.set(id, job);
    }

    /**
     * Mark job as finished and sets the state
     *
     * @param {number|string} id
     */
    finishJob(id) {
        const job = this.jobsInProgress.get(id);
        if (!job) return;
        const jobDurationMillis = job.finish();
        this.finishedJobs++;
        this.totalJobDurationMillis += jobDurationMillis;
        this._saveRetryCountForJob(job);
        if (jobDurationMillis < this.minJobDurationMillis) this.minJobDurationMillis = jobDurationMillis;
        if (jobDurationMillis > this.maxJobDurationMillis) this.maxJobDurationMillis = jobDurationMillis;
        this.jobsInProgress.delete(id);
    }

    /**
     * Mark job as failed and sets the state
     *
     * @param {number|string} id
     */
    failJob(id) {
        const job = this.jobsInProgress.get(id);
        if (!job) return;
        this.failedJobs++;
        this._saveRetryCountForJob(job);
        this.jobsInProgress.delete(id);
    }

    /**
     * Calculate and get the current state
     */
    getCurrent() {
        const totalMillis = new Date() - this.startedAt;
        const totalMinutes = totalMillis / 1000 / 60;

        return {
            avgDurationMillis: Math.round(this.totalJobDurationMillis / this.finishedJobs) || Infinity,
            perMinute: Math.round(this.finishedJobs / totalMinutes),
            finished: this.finishedJobs,
            failed: this.failedJobs,
            retryHistogram: [...this.jobRetryHistogram],
        };
    }

    /**
     * Initializes the key value store for persisting the statistics,
     * displaying the current state in predefined intervals
     */
    async startCapturing() {
        this.keyValueStore = await openKeyValueStore();

        await this._maybeLoadStatistics();

        events.on(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, this.listener);

        this.logInterval = setInterval(() => {
            this.log.info(this.logMessage, this.getCurrent());
        }, this.logIntervalMillis);
    }

    /**
     * Stops logging and remove event listeners, then persist
     */
    async stopCapturing() {
        this._teardown();

        await this.persistState();
    }

    /**
     * @private
     */
    _saveRetryCountForJob(job) {
        const retryCount = job.retryCount();
        this.jobRetryHistogram[retryCount] = this.jobRetryHistogram[retryCount]
            ? this.jobRetryHistogram[retryCount] + 1
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

        // safe to reassign here, since this can only happen once upon calling startCapturing()
        this.jobRetryHistogram = [...savedState.jobRetryHistogram];
        this.finishedJobs = savedState.finishedJobs;
        this.failedJobs = savedState.failedJobs;
        this.totalJobDurationMillis = savedState.totalJobDurationMillis;
        // persisted state uses ISO date strings
        const [persistedAt, startedAt] = ['persistedAt', 'startedAt'].map(key => new Date(savedState[key]).getTime());
        this.startedAt = new Date(Date.now() - (persistedAt - startedAt));

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
     * Make this class persistable when called with JSON.stringify(stats), seletively
     * persisting only what matters
     *
     * @private
     */
    toJSON() {
        return {
            jobRetryHistogram: this.jobRetryHistogram,
            finishedJobs: this.finishedJobs,
            failedJobs: this.failedJobs,
            totalJobDurationMillis: this.totalJobDurationMillis,
            startedAt: this.startedAt ? this.startedAt.toISOString() : null,
            // used for adjusting time between runs recreating from state
            persistedAt: new Date().toISOString(),
        };
    }
}

Statistics.id = 0;

export default Statistics;
