import { z } from 'zod';
import { convertStateSync, RecoverableState } from '../recoverable_state.js';
import { serviceLocator } from '../service_locator.js';
import { KeyValueStore } from '../storages/key_value_store.js';
import { parseArgument, schemas, validators } from '../validators.js';
import { ErrorTracker } from './error_tracker.js';
/**
 * @ignore
 */
class Job {
    #lastRunAt = null;
    #durationMillis;
    run() {
        this.#lastRunAt = Date.now();
    }
    finish() {
        this.#durationMillis = Date.now() - this.#lastRunAt;
        return this.#durationMillis;
    }
}
const statisticsOptionsSchema = z.strictObject({
    logIntervalSecs: schemas.anyNumber.default(60),
    logMessage: z.string().default('Statistics'),
    log: validators.logger.optional(),
    keyValueStore: z.instanceof(KeyValueStore).optional(),
    // `schemas.anyObject` passes values through by reference (object schemas return a pruned plain copy).
    persistenceOptions: schemas.anyObject.default(() => ({ enable: true })),
    saveErrorSnapshots: z.boolean().default(false),
    id: z.union([schemas.anyNumber, z.string()]).optional(),
    stateExtension: schemas.anyObject.default(() => ({})),
});
const errorTrackerConfig = {
    showErrorCode: true,
    showErrorName: true,
    showStackTrace: true,
    showFullStack: false,
    showErrorMessage: true,
    showFullMessage: false,
};
/**
 * The persisted record, in the order it is written - the schema rebuilds the object on the way out, so the field
 * order here *is* the record's field order (guarded by a test).
 *
 * JSON has no infinity, so the three fields that are `Infinity` until the first request settles are written as
 * `null`. Both {@apilink Statistics.serializeState} and {@apilink Statistics.deserializeState} run through this,
 * which is what keeps them describing the same record.
 *
 * Nothing is optional on purpose: the record has always carried every field, so one missing a field is not one of
 * ours and is discarded whole rather than partially trusted - a counter restored as a string would poison every
 * later increment.
 *
 * Custom fields are not this schema's business either way: they are added to the record after the encode and
 * validated by their own conversion on the way back, so the keys it does not know about are simply dropped here.
 */
const persistedStatisticState = z.object({
    requestsFinished: z.number(),
    requestsFailed: z.number(),
    requestsRetries: z.number(),
    requestsFailedPerMinute: z.number().nullable(),
    requestsFinishedPerMinute: z.number().nullable(),
    requestMinDurationMillis: z.number().nullable(),
    requestMaxDurationMillis: z.number(),
    requestTotalFailedDurationMillis: z.number(),
    requestTotalFinishedDurationMillis: z.number(),
    crawlerStartedAt: z.string().nullable(),
    crawlerFinishedAt: z.string().nullable(),
    statsPersistedAt: z.string(),
    crawlerRuntimeMillis: z.number(),
    crawlerLastStartTimestamp: z.number(),
    // A retry count that never occurred leaves a hole in the live histogram, written out as a `null`. We
    // once saw a record whose histogram was not an array at all and crashed the crawler on load.
    requestRetryHistogram: z.array(z.number().nullable()),
    statsId: z.string(),
    requestAvgFailedDurationMillis: z.number().nullable(),
    requestAvgFinishedDurationMillis: z.number().nullable(),
    requestTotalDurationMillis: z.number(),
    requestsTotal: z.number(),
    requestsWithStatusCode: z.record(z.string(), z.number()),
    errors: z.record(z.string(), z.unknown()),
    retryErrors: z.record(z.string(), z.unknown()),
});
/** `Infinity` is what the statistics use for "nothing to average yet"; JSON has only `null` for it. */
function finiteOrNull(value) {
    return Number.isFinite(value) ? value : null;
}
/**
 * The conversion between the live state and the record above, in both directions.
 *
 * Built per instance rather than kept as a constant because a record carries three things the state does not: the
 * instance `id`, the derived aggregates of the overridable {@apilink Statistics.calculate}, and - on the way back -
 * the fields that are rebuilt from the instance's default state rather than restored, the error trackers among them.
 *
 * The model side is deliberately opaque: zod rebuilds what it validates, and `state.errors` has to stay the very
 * object the error trackers write into, not a copy of it.
 */
function buildStatisticStateCodec(statistics) {
    return z.codec(persistedStatisticState, z.custom(), {
        decode: (record) => ({
            ...statistics.defaultState(),
            requestsFinished: record.requestsFinished,
            requestsFailed: record.requestsFailed,
            requestsRetries: record.requestsRetries,
            requestTotalFailedDurationMillis: record.requestTotalFailedDurationMillis,
            requestTotalFinishedDurationMillis: record.requestTotalFinishedDurationMillis,
            // Restoring the `null` as-is would make every later `duration < min` comparison fail, leaving the
            // minimum `null` for the rest of the run.
            requestMinDurationMillis: record.requestMinDurationMillis ?? Infinity,
            requestMaxDurationMillis: record.requestMaxDurationMillis,
            crawlerRuntimeMillis: record.crawlerRuntimeMillis,
            // A `null` stands for the zero requests that reached that retry count - restore it as such.
            requestRetryHistogram: record.requestRetryHistogram.map((count) => count ?? 0),
            // The record keeps ISO strings, the live state keeps `Date`s.
            crawlerStartedAt: record.crawlerStartedAt === null ? null : new Date(record.crawlerStartedAt),
            crawlerFinishedAt: record.crawlerFinishedAt === null ? null : new Date(record.crawlerFinishedAt),
            statsPersistedAt: new Date(record.statsPersistedAt),
            // Rebased so that the runtime reported by `calculate()` spans the migration instead of restarting.
            instanceStart: Date.now() - (new Date(record.statsPersistedAt).getTime() - record.crawlerLastStartTimestamp),
        }),
        encode: (state) => {
            const { requestsWithStatusCode, errors, retryErrors, requestRetryHistogram, instanceStart, ...counters } = state;
            // Every rate and average `calculate()` derives is `Infinity` until the run is long enough, or until
            // something has finished or failed, to divide by.
            const { requestAvgFailedDurationMillis, requestAvgFinishedDurationMillis, requestsFailedPerMinute, requestsFinishedPerMinute, ...aggregates } = statistics.calculate();
            return {
                ...counters,
                requestMinDurationMillis: finiteOrNull(state.requestMinDurationMillis),
                crawlerStartedAt: state.crawlerStartedAt ? new Date(state.crawlerStartedAt).toISOString() : null,
                crawlerFinishedAt: state.crawlerFinishedAt ? new Date(state.crawlerFinishedAt).toISOString() : null,
                statsPersistedAt: new Date().toISOString(),
                crawlerLastStartTimestamp: instanceStart,
                // `Array.from`, not `map` - a hole left by a retry count no request reached is skipped by `map`
                // and would stay a hole, which is not something the record can carry.
                requestRetryHistogram: Array.from(requestRetryHistogram, (count) => count ?? null),
                statsId: statistics.statsId,
                ...aggregates,
                requestAvgFailedDurationMillis: finiteOrNull(requestAvgFailedDurationMillis),
                requestAvgFinishedDurationMillis: finiteOrNull(requestAvgFinishedDurationMillis),
                requestsFailedPerMinute: finiteOrNull(requestsFailedPerMinute),
                requestsFinishedPerMinute: finiteOrNull(requestsFinishedPerMinute),
                requestsWithStatusCode,
                errors,
                retryErrors,
            };
        },
    });
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
export class Statistics {
    static #id = 0;
    /** @internal Reset static counter for test isolation. */
    static resetId() {
        Statistics.#id = 0;
    }
    /**
     * An error tracker for final retry errors.
     */
    errorTracker;
    /**
     * An error tracker for retry errors prior to the final retry.
     */
    errorTrackerRetry;
    /**
     * Statistic instance id.
     */
    id;
    #persistStateKey;
    #stateCodec;
    #recoverableState;
    #stateExtension;
    #defaultStateExtension;
    #stateExtensionKeys;
    #logIntervalMillis;
    #logMessage;
    #requestsInProgress = new Map();
    log;
    #logInterval;
    /**
     * Current statistic state used for doing calculations on {@apilink Statistics.calculate} calls
     */
    get state() {
        return this.#recoverableState.currentValue;
    }
    /**
     * Contains the current retries histogram. Index 0 means 0 retries, index 2, 2 retries, and so on
     */
    get requestRetryHistogram() {
        return this.state.requestRetryHistogram;
    }
    /**
     * Construct a statistics instance to pass to a crawler via its `statistics` option, e.g. to preconfigure
     * persistence or error snapshots, share it across sequential runs, or track extra fields via `state`.
     */
    constructor(options = {}) {
        const { logIntervalSecs, logMessage, log, keyValueStore, persistenceOptions, saveErrorSnapshots, id, stateExtension, } = parseArgument(options, statisticsOptionsSchema);
        this.id = id ?? String(Statistics.#id++);
        this.#persistStateKey = `CRAWLEE_CRAWLER_STATISTICS_${this.id}`;
        this.log = (log ?? serviceLocator.getLogger()).child({ prefix: 'Statistics' });
        this.errorTracker = new ErrorTracker({ ...errorTrackerConfig, saveErrorSnapshots });
        this.errorTrackerRetry = new ErrorTracker({ ...errorTrackerConfig, saveErrorSnapshots });
        this.#logIntervalMillis = logIntervalSecs * 1000;
        this.#logMessage = logMessage;
        this.#stateExtension = stateExtension;
        this.#defaultStateExtension = this.#resolveDefaultStateExtension(this.#stateExtension);
        this.#stateExtensionKeys = Object.keys(this.#defaultStateExtension());
        for (const key of this.#stateExtensionKeys) {
            if (key in this.#builtInDefaultState()) {
                throw new Error(`The custom statistics field \`${String(key)}\` collides with a built-in one - it would shadow ` +
                    'the value the crawler tracks. Rename it in `stateExtension`.');
            }
        }
        // `calculate()` is late-bound on purpose - it is an override point, and a subclass's must be the one that runs.
        this.#stateCodec = buildStatisticStateCodec({
            statsId: this.id,
            defaultState: () => this.#defaultState(),
            calculate: () => this.calculate(),
        });
        this.#recoverableState = new RecoverableState({
            persistStateKey: this.#persistStateKey,
            persistenceEnabled: persistenceOptions.enable,
            keyValueStore,
            logger: this.log,
            defaultState: () => this.#defaultState(),
            serialize: (state) => this.#serializeState(state),
            deserialize: (persistedState) => this.#deserializeState(persistedState),
        });
        // initialize by "resetting"
        this.reset();
    }
    /**
     * Set the current statistic instance to pristine values.
     *
     * The persisted record is left alone - use {@apilink Statistics.resetStore} to clear that as well.
     */
    reset() {
        this.errorTracker.reset();
        this.errorTrackerRetry.reset();
        this.#recoverableState.reset();
        this.#requestsInProgress.clear();
    }
    /** The pristine state a new instance starts with and {@apilink Statistics.reset} restores. */
    #defaultState() {
        return {
            ...this.#builtInDefaultState(),
            ...this.#defaultStateExtension(),
        };
    }
    /**
     * The factory behind the custom half of the default state - it has to hand out a fresh object every time, or a
     * `reset()` would write through to the defaults of the next one.
     *
     * With no `defaultState` given, the defaults are what `deserialize` makes of an empty record. That keeps a
     * single declaration of the custom fields - a schema with a `.default()` per field is enough - and the defaults
     * cannot then disagree with the conversion that has to accept them back.
     */
    #resolveDefaultStateExtension(options) {
        const { defaultState, deserialize } = options;
        if (typeof defaultState === 'function') {
            return defaultState;
        }
        if (defaultState !== undefined) {
            return () => structuredClone(defaultState);
        }
        if (deserialize === undefined) {
            return () => ({});
        }
        return () => {
            try {
                return convertStateSync(deserialize, {}, this.#persistStateKey);
            }
            catch (error) {
                throw new Error('Could not derive the default values of the custom statistics fields from `stateExtension.deserialize` - ' +
                    'give every field a default, or declare `stateExtension.defaultState` explicitly.', { cause: error });
            }
        };
    }
    /** The built-in half of {@apilink Statistics.defaultState}, before any custom fields are merged over it. */
    #builtInDefaultState() {
        return {
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
            // Aliases, not copies - the trackers keep writing into these objects.
            errors: this.errorTracker.result,
            retryErrors: this.errorTrackerRetry.result,
            requestRetryHistogram: [],
            instanceStart: Date.now(),
        };
    }
    /**
     * Clear the persisted statistics record, leaving the in-memory state alone.
     *
     * Throws while capturing - the next PERSIST_STATE event would write the record straight back.
     */
    async resetStore() {
        await this.#recoverableState.resetStore();
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
        let job = this.#requestsInProgress.get(id);
        if (!job)
            job = new Job();
        job.run();
        this.#requestsInProgress.set(id, job);
    }
    /**
     * Mark job as finished and sets the state
     * @ignore
     */
    finishJob(id, retryCount) {
        const job = this.#requestsInProgress.get(id);
        if (!job)
            return;
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
    failJob(id, retryCount) {
        const job = this.#requestsInProgress.get(id);
        if (!job)
            return;
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
    discardJob(id) {
        this.#requestsInProgress.delete(id);
    }
    /**
     * Calculate the current statistics
     */
    calculate() {
        const { requestsFailed, requestsFinished, requestTotalFailedDurationMillis, requestTotalFinishedDurationMillis, } = this.state;
        const totalMillis = Date.now() - this.state.instanceStart;
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
        // A single instance drives one logging interval and one PERSIST_STATE listener, so a second concurrent
        // capture (e.g. sharing one instance across crawlers running at once) would orphan the first. Fail loudly.
        if (this.#logInterval) {
            throw new Error('Statistics.startCapturing() was already called - this instance is already capturing.');
        }
        await this.#recoverableState.initialize();
        // After the load, so that a restored record keeps the timestamp of the run it belongs to.
        if (this.state.crawlerStartedAt === null) {
            this.state.crawlerStartedAt = new Date();
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
        this.#stopLogging();
        this.state.crawlerFinishedAt = new Date();
        await this.#recoverableState.teardown();
    }
    saveRetryCountForJob(retryCount) {
        if (retryCount > 0)
            this.state.requestsRetries++;
        this.requestRetryHistogram[retryCount] ??= 0;
        this.requestRetryHistogram[retryCount]++;
    }
    /**
     * Persist internal state to the key value store.
     *
     * Statistics are bookkeeping - a store that refuses the write is worth a warning, not a failed crawl. The
     * crawler calls this from its migration handler, where a rejection would go unhandled.
     */
    async persistState() {
        await this.#recoverableState
            .persistState()
            .catch((error) => this.log.warning(`Failed to persist the statistics to ${this.#persistStateKey}`, { error }));
    }
    /** Rebuilds the state from a persisted record. */
    #deserializeState(persistedState) {
        // The cast covers the custom fields, whose type is open here - and the record is an unvalidated blob off the
        // key-value store either way, which is what the decode is for. Their keys are not in the schema, so the
        // decode drops them; `#restoreStateExtension` is what brings them back.
        const restored = z.safeDecode(this.#stateCodec, persistedState);
        if (!restored.success) {
            // Statistics are bookkeeping - a record that cannot be made sense of is worth a warning and a fresh
            // start, not a failed crawl.
            this.log.warning('Received invalid state from Key-value store, starting the statistics from scratch.', {
                persistStateKey: this.#persistStateKey,
                issues: restored.error.issues,
            });
            return this.#defaultState();
        }
        this.log.debug('Recreating state from KeyValueStore', { persistStateKey: this.#persistStateKey });
        return { ...this.#defaultState(), ...restored.data, ...this.#restoreStateExtension(persistedState) };
    }
    /**
     * The custom {@apilink StatisticsOptions.stateExtension|`stateExtension`} fields as they were persisted - the codec only rebuilds
     * the built-in ones.
     *
     * Given a `deserialize`, the whole record goes through it, so a field the record does not carry - one declared
     * after the record was written - comes back as whatever default the conversion gives it. Without one, the
     * declared keys are copied over as they were persisted and a missing one keeps the default it already has.
     */
    #restoreStateExtension(persistedState) {
        const { deserialize } = this.#stateExtension;
        if (deserialize === undefined) {
            const restored = {};
            for (const key of this.#stateExtensionKeys) {
                // The record is an unvalidated blob and there is no conversion to check it with, so this is the
                // caller's word for it - the state ends up holding whatever was written. The two halves only line
                // up at all because the fields are persisted as they are without a `serialize`.
                const persistedValue = persistedState[key];
                if (persistedValue !== undefined) {
                    restored[key] = persistedValue;
                }
            }
            return restored;
        }
        try {
            return convertStateSync(deserialize, persistedState, this.#persistStateKey);
        }
        catch (error) {
            // Same policy as a built-in field that cannot be made sense of, but scoped to the custom ones - a
            // corrupt counter of your own is no reason to throw away the crawler's.
            this.log.warning('Received invalid custom statistics fields from Key-value store, starting those from scratch.', { persistStateKey: this.#persistStateKey, error });
            return {};
        }
    }
    #stopLogging() {
        if (this.#logInterval) {
            clearInterval(this.#logInterval);
            this.#logInterval = null;
        }
    }
    /**
     * Builds the record written to the key value store, merging in the derived aggregates so that a consumer
     * reading the record does not have to reconstruct them.
     */
    #serializeState(state) {
        const { builtIn, extension } = this.#splitState(state);
        return {
            ...z.encode(this.#stateCodec, builtIn),
            ...this.#serializeStateExtension(extension),
        };
    }
    /** The custom {@apilink StatisticsOptions.stateExtension|`stateExtension`} fields as they go into the record. */
    #serializeStateExtension(extension) {
        const { serialize } = this.#stateExtension;
        if (serialize === undefined) {
            return extension;
        }
        // Unlike the way back, a failure here throws: the value is the caller's own, and a record written from a
        // state that does not match its own declaration is not worth having.
        return convertStateSync(serialize, extension, this.#persistStateKey);
    }
    /** Separates the declared custom fields from the built-in ones, so that each half goes through its own conversion. */
    #splitState(state) {
        const builtIn = { ...state };
        const extension = {};
        for (const key of this.#stateExtensionKeys) {
            extension[key] = state[key];
            delete builtIn[key];
        }
        return { builtIn, extension };
    }
    /**
     * Make this class serializable when called with `JSON.stringify(statsInstance)` directly
     * or through `keyValueStore.setValue('KEY', statsInstance)`
     */
    toJSON() {
        return this.#serializeState(this.state);
    }
}
