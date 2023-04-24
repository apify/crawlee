"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Statistics = void 0;
const tslib_1 = require("tslib");
const ow_1 = tslib_1.__importDefault(require("ow"));
const utils_1 = require("@crawlee/utils");
const log_1 = require("../log");
const key_value_store_1 = require("../storages/key_value_store");
const configuration_1 = require("../configuration");
/**
 * @ignore
 */
class Job {
    constructor() {
        Object.defineProperty(this, "lastRunAt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "runs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "durationMillis", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
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
const errorTrackerConfig = {
    showErrorCode: true,
    showErrorName: true,
    showStackTrace: true,
    showFullStack: false,
    showErrorMessage: true,
    showFullMessage: false,
};
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
class Statistics {
    /**
     * @internal
     */
    constructor(options = {}) {
        /**
         * An error tracker for final retry errors.
         */
        Object.defineProperty(this, "errorTracker", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new utils_1.ErrorTracker(errorTrackerConfig)
        });
        /**
         * An error tracker for retry errors prior to the final retry.
         */
        Object.defineProperty(this, "errorTrackerRetry", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new utils_1.ErrorTracker(errorTrackerConfig)
        });
        /**
         * Statistic instance id.
         */
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: Statistics.id++
        }); // assign an id while incrementing so it can be saved/restored from KV
        /**
         * Current statistic state used for doing calculations on {@apilink Statistics.calculate} calls
         */
        Object.defineProperty(this, "state", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * Contains the current retries histogram. Index 0 means 0 retries, index 2, 2 retries, and so on
         */
        Object.defineProperty(this, "requestRetryHistogram", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "keyValueStore", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: undefined
        });
        Object.defineProperty(this, "persistStateKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: `SDK_CRAWLER_STATISTICS_${this.id}`
        });
        Object.defineProperty(this, "logIntervalMillis", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "logMessage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "listener", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "requestsInProgress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "log", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: log_1.log.child({ prefix: 'Statistics' })
        });
        Object.defineProperty(this, "instanceStart", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "logInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "events", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        (0, ow_1.default)(options, ow_1.default.object.exactShape({
            logIntervalSecs: ow_1.default.optional.number,
            logMessage: ow_1.default.optional.string,
            keyValueStore: ow_1.default.optional.object,
            config: ow_1.default.optional.object,
        }));
        const { logIntervalSecs = 60, logMessage = 'Statistics', keyValueStore, config = configuration_1.Configuration.getGlobalConfig(), } = options;
        this.logIntervalMillis = logIntervalSecs * 1000;
        this.logMessage = logMessage;
        this.keyValueStore = keyValueStore;
        this.listener = this.persistState.bind(this);
        this.events = config.getEventManager();
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
     * Increments the status code counter.
     */
    registerStatusCode(code) {
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
    startJob(id) {
        let job = this.requestsInProgress.get(id);
        if (!job)
            job = new Job();
        job.run();
        this.requestsInProgress.set(id, job);
    }
    /**
     * Mark job as finished and sets the state
     * @ignore
     */
    finishJob(id) {
        const job = this.requestsInProgress.get(id);
        if (!job)
            return;
        const jobDurationMillis = job.finish();
        this.state.requestsFinished++;
        this.state.requestTotalFinishedDurationMillis += jobDurationMillis;
        this._saveRetryCountForJob(job);
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
    failJob(id) {
        const job = this.requestsInProgress.get(id);
        if (!job)
            return;
        this.state.requestTotalFailedDurationMillis += job.finish();
        this.state.requestsFailed++;
        this._saveRetryCountForJob(job);
        this.requestsInProgress.delete(id);
    }
    /**
     * Calculate the current statistics
     */
    calculate() {
        const { requestsFailed, requestsFinished, requestTotalFailedDurationMillis, requestTotalFinishedDurationMillis, } = this.state;
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
        this.keyValueStore ?? (this.keyValueStore = await key_value_store_1.KeyValueStore.open());
        await this._maybeLoadStatistics();
        if (this.state.crawlerStartedAt === null) {
            this.state.crawlerStartedAt = new Date();
        }
        this.events.on("persistState" /* EventType.PERSIST_STATE */, this.listener);
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
    _saveRetryCountForJob(job) {
        const retryCount = job.retryCount();
        if (retryCount > 0)
            this.state.requestsRetries++;
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
     */
    async _maybeLoadStatistics() {
        // this might be called before startCapturing was called without using await, should not crash
        if (!this.keyValueStore) {
            return;
        }
        const savedState = await this.keyValueStore.getValue(this.persistStateKey);
        if (!savedState)
            return;
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
        this.instanceStart = Date.now() - (+this.state.statsPersistedAt - savedState.crawlerLastStartTimestamp);
        this.log.debug('Loaded from KeyValueStore');
    }
    _teardown() {
        // this can be called before a call to startCapturing happens (or in a 'finally' block)
        this.events.off("persistState" /* EventType.PERSIST_STATE */, this.listener);
        if (this.logInterval) {
            clearInterval(this.logInterval);
            this.logInterval = null;
        }
    }
    /**
     * Make this class serializable when called with `JSON.stringify(statsInstance)` directly
     * or through `keyValueStore.setValue('KEY', statsInstance)`
     */
    toJSON() {
        // merge all the current state information that can be used from the outside
        // without the need to reconstruct for the sake of stats.calculate()
        // omit duplicated information
        const result = {
            ...this.state,
            crawlerLastStartTimestamp: this.instanceStart,
            crawlerFinishedAt: this.state.crawlerFinishedAt ? new Date(this.state.crawlerFinishedAt).toISOString() : null,
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
Object.defineProperty(Statistics, "id", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 0
});
exports.Statistics = Statistics;
//# sourceMappingURL=statistics.js.map