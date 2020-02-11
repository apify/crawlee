import os from 'os';
import _ from 'underscore';
import { betterSetInterval, betterClearInterval } from 'apify-shared/utilities';
import log from 'apify-shared/log';
import { ACTOR_EVENT_NAMES, ENV_VARS } from 'apify-shared/consts';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { getMemoryInfo, isAtHome, apifyClient } from '../utils';
import events from '../events';

const DEFAULT_OPTIONS = {
    eventLoopSnapshotIntervalSecs: 0.5,
    maxBlockedMillis: 50, // 0.05
    memorySnapshotIntervalSecs: 1,
    clientSnapshotIntervalSecs: 1,
    cpuSnapshotIntervalSecs: 1,
    maxUsedMemoryRatio: 0.7,
    maxUsedCpuRatio: 0.95,
    snapshotHistorySecs: 30,
    maxClientErrors: 3,
};
const RESERVE_MEMORY_RATIO = 0.5;
const CLIENT_RATE_LIMIT_ERROR_RETRY_COUNT = 2;
const CRITICAL_OVERLOAD_RATE_LIMIT_MILLIS = 10000;

/**
 * @typedef SnapshotterOptions
 * @property {Number} [eventLoopSnapshotIntervalSecs=0.5]
 *   Defines the interval of measuring the event loop response time.
 * @property {Number} [clientSnapshotIntervalSecs=1]
 *   Defines the interval of checking the current state
 *   of the remote API client.
 * @property {Number} [maxBlockedMillis=50]
 *   Maximum allowed delay of the event loop in milliseconds.
 *   Exceeding this limit overloads the event loop.
 * @property {Number} [cpuSnapshotIntervalSecs=1]
 *   Defines the interval of measuring CPU usage.
 *   This is only used when running locally. On the Apify platform,
 *   the statistics are provided externally at a fixed interval.
 * @property {Number} [maxUsedCpuRatio=0.95]
 *   Defines the maximum usage of CPU.
 *   Exceeding this limit overloads the CPU.
 * @property {Number} [memorySnapshotIntervalSecs=1]
 *   Defines the interval of measuring memory consumption.
 *   This is only used when running locally. On the Apify platform,
 *   the statistics are provided externally at a fixed interval.
 *   The measurement itself is resource intensive (25 - 50ms async).
 *   Therefore, setting this interval below 1 second is not recommended.
 * @property {Number} [maxUsedMemoryRatio=0.7]
 *   Defines the maximum ratio of total memory that can be used.
 *   Exceeding this limit overloads the memory.
 * @property {Number} [maxClientErrors=1]
 *   Defines the maximum number of new rate limit errors within
 *   the given interval.
 * @property {Number} [snapshotHistorySecs=60]
 *   Sets the interval in seconds for which a history of resource snapshots
 *   will be kept. Increasing this to very high numbers will affect performance.
 */

/**
 * Creates snapshots of system resources at given intervals and marks the resource
 * as either overloaded or not during the last interval. Keeps a history of the snapshots.
 * It tracks the following resources: Memory, EventLoop, API and CPU.
 * The class is used by the {@link AutoscaledPool} class.
 *
 * When running on the Apify platform, the CPU and memory statistics are provided by the platform,
 * as collected from the running Docker container. When running locally, `Snapshotter`
 * makes its own statistics by querying the OS.
 *
 * CPU becomes overloaded locally when its current use exceeds the `maxUsedCpuRatio` option or
 * when Apify platform marks it as overloaded.
 *
 * Memory becomes overloaded if its current use exceeds the `maxUsedMemoryRatio` option.
 * It's computed using the total memory available to the container when running on
 * the Apify platform and a quarter of total system memory when running locally.
 * Max total memory when running locally may be overridden by using the `APIFY_MEMORY_MBYTES`
 * environment variable.
 *
 * Event loop becomes overloaded if it slows down by more than the `maxBlockedMillis` option.
 *
 * Client becomes overloaded when rate limit errors (429 - Too Many Requests),
 * typically received from the request queue, exceed the set limit within the set interval.
 */
class Snapshotter {
    /**
     * @param {SnapshotterOptions} [options] All `Snapshotter` configuration options.
     */
    constructor(options = {}) {
        const {
            eventLoopSnapshotIntervalSecs,
            cpuSnapshotIntervalSecs,
            memorySnapshotIntervalSecs,
            clientSnapshotIntervalSecs,
            snapshotHistorySecs,
            maxBlockedMillis,
            maxUsedMemoryRatio,
            maxUsedCpuRatio,
            maxClientErrors,
        } = _.defaults({}, options, DEFAULT_OPTIONS);

        checkParamOrThrow(eventLoopSnapshotIntervalSecs, 'options.eventLoopSnapshotIntervalSecs', 'Number');
        checkParamOrThrow(memorySnapshotIntervalSecs, 'options.memorySnapshotIntervalSecs', 'Number');
        checkParamOrThrow(cpuSnapshotIntervalSecs, 'options.cpuSnapshotIntervalSecs', 'Number');
        checkParamOrThrow(snapshotHistorySecs, 'options.snapshotHistorySecs', 'Number');
        checkParamOrThrow(clientSnapshotIntervalSecs, 'options.clientSnapshotIntervalSecs', 'Number');
        checkParamOrThrow(maxBlockedMillis, 'options.maxBlockedMillis', 'Number');
        checkParamOrThrow(maxUsedMemoryRatio, 'options.maxUsedMemoryRatio', 'Number');
        checkParamOrThrow(maxUsedCpuRatio, 'options.maxUsedCpuRatio', 'Number');
        checkParamOrThrow(maxClientErrors, 'options.maxClientErrors', 'Number');


        this.eventLoopSnapshotIntervalMillis = eventLoopSnapshotIntervalSecs * 1000;
        this.memorySnapshotIntervalMillis = memorySnapshotIntervalSecs * 1000;
        this.clientSnapshotIntervalMillis = clientSnapshotIntervalSecs * 1000;
        this.cpuSnapshotIntervalMillis = cpuSnapshotIntervalSecs * 1000;
        this.snapshotHistoryMillis = snapshotHistorySecs * 1000;
        this.maxBlockedMillis = maxBlockedMillis;
        this.maxUsedMemoryRatio = maxUsedMemoryRatio;
        this.maxUsedCpuRatio = maxUsedCpuRatio;
        this.maxClientErrors = maxClientErrors;
        this.maxMemoryBytes = (parseInt(process.env[ENV_VARS.MEMORY_MBYTES], 10) * 1024 * 1024) || null;

        this.cpuSnapshots = [];
        this.eventLoopSnapshots = [];
        this.memorySnapshots = [];
        this.clientSnapshots = [];

        this.eventLoopInterval = null;
        this.memoryInterval = null;
        this.clientInterval = null;
        this.cpuInterval = null;

        this.lastLoggedCriticalMemoryOverloadAt = null;

        // We need to pre-bind those functions to be able to successfully remove listeners.
        this._snapshotCpuOnPlatform = this._snapshotCpuOnPlatform.bind(this);
        this._snapshotMemoryOnPlatform = this._snapshotMemoryOnPlatform.bind(this);
    }

    /**
     * Starts capturing snapshots at configured intervals.
     * @return {Promise}
     */
    async start() {
        await this._ensureCorrectMaxMemory();

        // Start snapshotting.
        this.eventLoopInterval = betterSetInterval(this._snapshotEventLoop.bind(this), this.eventLoopSnapshotIntervalMillis);
        this.clientInterval = betterSetInterval(this._snapshotClient.bind(this), this.clientSnapshotIntervalMillis);
        if (isAtHome()) {
            events.on(ACTOR_EVENT_NAMES.SYSTEM_INFO, this._snapshotCpuOnPlatform);
            events.on(ACTOR_EVENT_NAMES.SYSTEM_INFO, this._snapshotMemoryOnPlatform);
        } else {
            this.cpuInterval = betterSetInterval(this._snapshotCpuOnLocal.bind(this), this.cpuSnapshotIntervalMillis);
            this.memoryInterval = betterSetInterval(this._snapshotMemoryOnLocal.bind(this), this.memorySnapshotIntervalMillis);
        }
    }

    /**
     * Stops all resource capturing.
     * @return {Promise}
     */
    async stop() {
        betterClearInterval(this.eventLoopInterval);
        betterClearInterval(this.memoryInterval);
        betterClearInterval(this.cpuInterval);
        betterClearInterval(this.clientInterval);
        events.removeListener(ACTOR_EVENT_NAMES.SYSTEM_INFO, this._snapshotCpuOnPlatform);
        events.removeListener(ACTOR_EVENT_NAMES.SYSTEM_INFO, this._snapshotMemoryOnPlatform);
        // Allow microtask queue to unwind before stop returns.
        await new Promise(resolve => setImmediate(resolve));
    }

    /**
     * Returns a sample of latest memory snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     * @param {Number} [sampleDurationMillis]
     * @return {Array}
     */
    getMemorySample(sampleDurationMillis) {
        return this._getSample(this.memorySnapshots, sampleDurationMillis);
    }

    /**
     * Returns a sample of latest event loop snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     * @param {Number} [sampleDurationMillis]
     * @return {Array}
     */
    getEventLoopSample(sampleDurationMillis) {
        return this._getSample(this.eventLoopSnapshots, sampleDurationMillis);
    }

    /**
     * Returns a sample of latest CPU snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     * @param {Number} [sampleDurationMillis]
     * @return {Array}
     */
    getCpuSample(sampleDurationMillis) {
        return this._getSample(this.cpuSnapshots, sampleDurationMillis);
    }

    /**
     * Returns a sample of latest Client snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     * @param {Number} sampleDurationMillis
     * @return {Array}
     */
    getClientSample(sampleDurationMillis) {
        return this._getSample(this.clientSnapshots, sampleDurationMillis);
    }

    /**
     * Finds the latest snapshots by sampleDurationMillis in the provided array.
     * @param {Array} snapshots
     * @param {Number} [sampleDurationMillis]
     * @return {Array}
     * @ignore
     */
    _getSample(snapshots, sampleDurationMillis) { // eslint-disable-line class-methods-use-this
        if (!sampleDurationMillis) return snapshots;

        const sample = [];
        let idx = snapshots.length;
        if (!idx) return sample;

        const latestTime = snapshots[idx - 1].createdAt;
        while (idx--) {
            const snapshot = snapshots[idx];
            if (latestTime - snapshot.createdAt <= sampleDurationMillis) sample.unshift(snapshot);
            else break;
        }
        return sample;
    }

    /**
     * Creates a snapshot of current memory usage
     * using the Apify platform `systemInfo` event.
     * @param {Object} systemInfo
     * @ignore
     */
    _snapshotMemoryOnPlatform(systemInfo) {
        const now = new Date();
        this._pruneSnapshots(this.memorySnapshots, now);
        const { memCurrentBytes } = systemInfo;
        const snapshot = {
            createdAt: now,
            isOverloaded: memCurrentBytes / this.maxMemoryBytes > this.maxUsedMemoryRatio,
            usedBytes: memCurrentBytes,
        };

        this.memorySnapshots.push(snapshot);
        this._memoryOverloadWarning(systemInfo);
    }

    /**
     * Creates a snapshot of current memory usage
     * using the Apify platform `systemInfo` event.
     * @param {Function} intervalCallback
     * @return {Promise}
     * @ignore
     */
    async _snapshotMemoryOnLocal(intervalCallback) {
        try {
            const now = new Date();
            const memInfo = await getMemoryInfo();
            const { mainProcessBytes, childProcessesBytes } = memInfo;
            this._pruneSnapshots(this.memorySnapshots, now);

            const usedBytes = mainProcessBytes + childProcessesBytes;
            const snapshot = {
                createdAt: now,
                isOverloaded: usedBytes / this.maxMemoryBytes > this.maxUsedMemoryRatio,
                usedBytes,
            };

            this.memorySnapshots.push(snapshot);
        } catch (err) {
            log.exception(err, 'Snapshotter: Memory snapshot failed.');
        } finally {
            intervalCallback();
        }
    }

    /**
     * Checks for critical memory overload and logs it to the console.
     * @ignore
     * @param {Object} systemInfo
     */
    _memoryOverloadWarning({ memCurrentBytes }) {
        const now = new Date();
        if (this.lastLoggedCriticalMemoryOverloadAt && now.getTime() < this.lastLoggedCriticalMemoryOverloadAt.getTime()
            + CRITICAL_OVERLOAD_RATE_LIMIT_MILLIS) return;

        const maxDesiredMemoryBytes = this.maxUsedMemoryRatio * this.maxMemoryBytes;
        const reserveMemory = this.maxMemoryBytes * (1 - this.maxUsedMemoryRatio) * RESERVE_MEMORY_RATIO;
        const criticalOverloadBytes = maxDesiredMemoryBytes + reserveMemory;
        const isCriticalOverload = memCurrentBytes > criticalOverloadBytes;
        if (isCriticalOverload) {
            const usedPercentage = Math.round((memCurrentBytes / this.maxMemoryBytes) * 100);
            const toMb = bytes => Math.round(bytes / (1024 ** 2));
            log.warning('Memory is critically overloaded. '
                + `Using ${toMb(memCurrentBytes)} MB of ${toMb(this.maxMemoryBytes)} MB (${usedPercentage}%). Consider increasing the actor memory.`);
            this.lastLoggedCriticalMemoryOverloadAt = now;
        }
    }

    /**
     * Creates a snapshot of current event loop delay.
     * @param {Function} intervalCallback
     * @ignore
     */
    _snapshotEventLoop(intervalCallback) {
        const now = new Date();
        this._pruneSnapshots(this.eventLoopSnapshots, now);

        const snapshot = {
            createdAt: now,
            isOverloaded: false,
            exceededMillis: 0,
        };

        const previousSnapshot = this.eventLoopSnapshots[this.eventLoopSnapshots.length - 1];
        if (previousSnapshot) {
            const { createdAt } = previousSnapshot;
            const delta = now.getTime() - createdAt - this.eventLoopSnapshotIntervalMillis;

            if (delta > this.maxBlockedMillis) snapshot.isOverloaded = true;
            snapshot.exceededMillis = Math.max(delta - this.maxBlockedMillis, 0);
        }

        this.eventLoopSnapshots.push(snapshot);
        intervalCallback();
    }

    /**
     * Creates a snapshot of current CPU usage
     * using the Apify platform `systemInfo` event.
     * @param {Object} systemInfo
     * @ignore
     */
    _snapshotCpuOnPlatform(systemInfo) {
        const { cpuCurrentUsage, isCpuOverloaded } = systemInfo;
        const createdAt = (new Date(systemInfo.createdAt));
        this._pruneSnapshots(this.cpuSnapshots, createdAt);

        this.cpuSnapshots.push({
            createdAt,
            isOverloaded: isCpuOverloaded,
            usedRatio: Math.ceil(cpuCurrentUsage / 100),
        });
    }

    /**
     * Creates a snapshot of current CPU usage
     * using OS provided metrics.
     * @param {Function} intervalCallback
     * @ignore
     */
    _snapshotCpuOnLocal(intervalCallback) {
        const now = new Date();
        this._pruneSnapshots(this.eventLoopSnapshots, now);

        const ticks = this._getCurrentCpuTicks();
        const snapshot = {
            createdAt: now,
            isOverloaded: false,
            ticks,
            usedRatio: 0,
        };

        const previousSnapshot = this.cpuSnapshots[this.cpuSnapshots.length - 1];
        if (previousSnapshot) {
            const { ticks: prevTicks } = previousSnapshot;
            const idleTicksDelta = ticks.idle - prevTicks.idle;
            const totalTicksDelta = ticks.total - prevTicks.total;
            const usedCpuRatio = 1 - (idleTicksDelta / totalTicksDelta);

            if (usedCpuRatio > this.maxUsedCpuRatio) snapshot.isOverloaded = true;
            snapshot.usedRatio = Math.ceil(usedCpuRatio);
        }

        this.cpuSnapshots.push(snapshot);
        intervalCallback();
    }

    _getCurrentCpuTicks() { // eslint-disable-line class-methods-use-this
        const cpus = os.cpus();
        return cpus.reduce((acc, cpu) => {
            const cpuTimes = Object.values(cpu.times);
            return {
                idle: acc.idle + cpu.times.idle,
                total: acc.total + cpuTimes.reduce((sum, num) => sum + num),
            };
        }, { idle: 0, total: 0 });
    }

    /**
     * Creates a snapshot of current API state by checking for
     * rate limit errors. Only errors produced by a 2nd retry
     * of the API call are considered for snapshotting since
     * earlier errors may just be caused by a random spike in
     * number of requests and do not necessarily signify API
     * overloading.
     *
     * @param intervalCallback
     * @private
     */
    _snapshotClient(intervalCallback) {
        const now = new Date();
        this._pruneSnapshots(this.clientSnapshots, now);

        const allErrorCounts = apifyClient.stats.rateLimitErrors;
        const currentErrCount = allErrorCounts[CLIENT_RATE_LIMIT_ERROR_RETRY_COUNT] || 0;

        // Handle empty snapshots array
        const snapshot = {
            createdAt: now,
            isOverloaded: false,
            rateLimitErrorCount: currentErrCount,
        };
        const previousSnapshot = this.clientSnapshots[this.clientSnapshots.length - 1];
        if (previousSnapshot) {
            const { rateLimitErrorCount } = previousSnapshot;
            const delta = currentErrCount - rateLimitErrorCount;
            if (delta > this.maxClientErrors) snapshot.isOverloaded = true;
        }

        this.clientSnapshots.push(snapshot);
        intervalCallback();
    }

    /**
     * Removes snapshots that are older than the snapshotHistorySecs option
     * from the array (destructively - in place).
     * @param {Array} snapshots
     * @param {Date} now
     * @ignore
     */
    _pruneSnapshots(snapshots, now) {
        let oldCount = 0;
        for (let i = 0; i < snapshots.length; i++) {
            const { createdAt } = snapshots[i];
            if (now.getTime() - createdAt > this.snapshotHistoryMillis) oldCount++;
            else break;
        }
        snapshots.splice(0, oldCount);
    }

    /**
     * Calculate max memory for platform or local usage.
     * @ignore
     */
    async _ensureCorrectMaxMemory() {
        if (this.maxMemoryBytes) return;
        const { totalBytes } = await getMemoryInfo();
        if (isAtHome()) {
            this.maxMemoryBytes = totalBytes;
        } else {
            this.maxMemoryBytes = Math.ceil(totalBytes / 4);
            // NOTE: Log as AutoscaledPool, so that users are not confused what "Snapshotter" is
            log.info(`AutoscaledPool: Setting max memory of this run to ${Math.round(this.maxMemoryBytes / 1024 / 1024)} MB. Use the ${ENV_VARS.MEMORY_MBYTES} environment variable to override it.`); // eslint-disable-line max-len
        }
    }
}

export default Snapshotter;
