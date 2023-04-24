"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Snapshotter = void 0;
const tslib_1 = require("tslib");
const utilities_1 = require("@apify/utilities");
const utils_1 = require("@crawlee/utils");
const ow_1 = tslib_1.__importDefault(require("ow"));
const configuration_1 = require("../configuration");
const log_1 = require("../log");
const RESERVE_MEMORY_RATIO = 0.5;
const CLIENT_RATE_LIMIT_ERROR_RETRY_COUNT = 2;
const CRITICAL_OVERLOAD_RATE_LIMIT_MILLIS = 10000;
/**
 * Creates snapshots of system resources at given intervals and marks the resource
 * as either overloaded or not during the last interval. Keeps a history of the snapshots.
 * It tracks the following resources: Memory, EventLoop, API and CPU.
 * The class is used by the {@apilink AutoscaledPool} class.
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
 * Max total memory when running locally may be overridden by using the `CRAWLEE_MEMORY_MBYTES`
 * environment variable.
 *
 * Event loop becomes overloaded if it slows down by more than the `maxBlockedMillis` option.
 *
 * Client becomes overloaded when rate limit errors (429 - Too Many Requests),
 * typically received from the request queue, exceed the set limit within the set interval.
 * @category Scaling
 */
class Snapshotter {
    /**
     * @param [options] All `Snapshotter` configuration options.
     */
    constructor(options = {}) {
        Object.defineProperty(this, "log", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "client", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "config", {
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
        Object.defineProperty(this, "eventLoopSnapshotIntervalMillis", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "clientSnapshotIntervalMillis", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "snapshotHistoryMillis", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxBlockedMillis", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxUsedMemoryRatio", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxClientErrors", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxMemoryBytes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "cpuSnapshots", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "eventLoopSnapshots", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "memorySnapshots", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "clientSnapshots", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "eventLoopInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "clientInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "lastLoggedCriticalMemoryOverloadAt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        (0, ow_1.default)(options, ow_1.default.object.exactShape({
            eventLoopSnapshotIntervalSecs: ow_1.default.optional.number,
            clientSnapshotIntervalSecs: ow_1.default.optional.number,
            snapshotHistorySecs: ow_1.default.optional.number,
            maxBlockedMillis: ow_1.default.optional.number,
            maxUsedMemoryRatio: ow_1.default.optional.number,
            maxClientErrors: ow_1.default.optional.number,
            log: ow_1.default.optional.object,
            client: ow_1.default.optional.object,
            config: ow_1.default.optional.object,
        }));
        const { eventLoopSnapshotIntervalSecs = 0.5, clientSnapshotIntervalSecs = 1, snapshotHistorySecs = 30, maxBlockedMillis = 50, maxUsedMemoryRatio = 0.7, maxClientErrors = 3, log = log_1.log, config = configuration_1.Configuration.getGlobalConfig(), client = config.getStorageClient(), } = options;
        this.log = log.child({ prefix: 'Snapshotter' });
        this.client = client;
        this.config = config;
        this.events = this.config.getEventManager();
        this.eventLoopSnapshotIntervalMillis = eventLoopSnapshotIntervalSecs * 1000;
        this.clientSnapshotIntervalMillis = clientSnapshotIntervalSecs * 1000;
        this.snapshotHistoryMillis = snapshotHistorySecs * 1000;
        this.maxBlockedMillis = maxBlockedMillis;
        this.maxUsedMemoryRatio = maxUsedMemoryRatio;
        this.maxClientErrors = maxClientErrors;
        // We need to pre-bind those functions to be able to successfully remove listeners.
        this._snapshotCpu = this._snapshotCpu.bind(this);
        this._snapshotMemory = this._snapshotMemory.bind(this);
    }
    /**
     * Starts capturing snapshots at configured intervals.
     */
    async start() {
        const memoryMbytes = this.config.get('memoryMbytes', 0);
        if (memoryMbytes > 0) {
            this.maxMemoryBytes = memoryMbytes * 1024 * 1024;
        }
        else {
            const { totalBytes } = await this._getMemoryInfo();
            this.maxMemoryBytes = Math.ceil(totalBytes * this.config.get('availableMemoryRatio'));
            this.log.debug(`Setting max memory of this run to ${Math.round(this.maxMemoryBytes / 1024 / 1024)} MB. `
                + 'Use the CRAWLEE_MEMORY_MBYTES or CRAWLEE_AVAILABLE_MEMORY_RATIO environment variable to override it.');
        }
        // Start snapshotting.
        this.eventLoopInterval = (0, utilities_1.betterSetInterval)(this._snapshotEventLoop.bind(this), this.eventLoopSnapshotIntervalMillis);
        this.clientInterval = (0, utilities_1.betterSetInterval)(this._snapshotClient.bind(this), this.clientSnapshotIntervalMillis);
        this.events.on("systemInfo" /* EventType.SYSTEM_INFO */, this._snapshotCpu);
        this.events.on("systemInfo" /* EventType.SYSTEM_INFO */, this._snapshotMemory);
    }
    /**
     * Stops all resource capturing.
     */
    async stop() {
        (0, utilities_1.betterClearInterval)(this.eventLoopInterval);
        (0, utilities_1.betterClearInterval)(this.clientInterval);
        this.events.off("systemInfo" /* EventType.SYSTEM_INFO */, this._snapshotCpu);
        this.events.off("systemInfo" /* EventType.SYSTEM_INFO */, this._snapshotMemory);
        // Allow microtask queue to unwind before stop returns.
        await new Promise((resolve) => setImmediate(resolve));
    }
    /**
     * Returns a sample of latest memory snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getMemorySample(sampleDurationMillis) {
        return this._getSample(this.memorySnapshots, sampleDurationMillis);
    }
    /**
     * Returns a sample of latest event loop snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getEventLoopSample(sampleDurationMillis) {
        return this._getSample(this.eventLoopSnapshots, sampleDurationMillis);
    }
    /**
     * Returns a sample of latest CPU snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getCpuSample(sampleDurationMillis) {
        return this._getSample(this.cpuSnapshots, sampleDurationMillis);
    }
    /**
     * Returns a sample of latest Client snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getClientSample(sampleDurationMillis) {
        return this._getSample(this.clientSnapshots, sampleDurationMillis);
    }
    /**
     * Finds the latest snapshots by sampleDurationMillis in the provided array.
     */
    _getSample(snapshots, sampleDurationMillis) {
        if (!sampleDurationMillis)
            return snapshots;
        const sample = [];
        let idx = snapshots.length;
        if (!idx)
            return sample;
        const latestTime = snapshots[idx - 1].createdAt;
        while (idx--) {
            const snapshot = snapshots[idx];
            if (+latestTime - +snapshot.createdAt <= sampleDurationMillis) {
                sample.unshift(snapshot);
            }
            else {
                break;
            }
        }
        return sample;
    }
    /**
     * Creates a snapshot of current memory usage
     * using the Apify platform `systemInfo` event.
     */
    _snapshotMemory(systemInfo) {
        const createdAt = systemInfo.createdAt ? new Date(systemInfo.createdAt) : new Date();
        this._pruneSnapshots(this.memorySnapshots, createdAt);
        const { memCurrentBytes } = systemInfo;
        const snapshot = {
            createdAt,
            isOverloaded: memCurrentBytes / this.maxMemoryBytes > this.maxUsedMemoryRatio,
            usedBytes: memCurrentBytes,
        };
        this.memorySnapshots.push(snapshot);
        this._memoryOverloadWarning(systemInfo);
    }
    /**
     * Checks for critical memory overload and logs it to the console.
     */
    _memoryOverloadWarning(systemInfo) {
        const { memCurrentBytes } = systemInfo;
        const createdAt = systemInfo.createdAt ? new Date(systemInfo.createdAt) : new Date();
        if (this.lastLoggedCriticalMemoryOverloadAt && +createdAt < +this.lastLoggedCriticalMemoryOverloadAt + CRITICAL_OVERLOAD_RATE_LIMIT_MILLIS)
            return;
        const maxDesiredMemoryBytes = this.maxUsedMemoryRatio * this.maxMemoryBytes;
        const reserveMemory = this.maxMemoryBytes * (1 - this.maxUsedMemoryRatio) * RESERVE_MEMORY_RATIO;
        const criticalOverloadBytes = maxDesiredMemoryBytes + reserveMemory;
        const isCriticalOverload = memCurrentBytes > criticalOverloadBytes;
        if (isCriticalOverload) {
            const usedPercentage = Math.round((memCurrentBytes / this.maxMemoryBytes) * 100);
            const toMb = (bytes) => Math.round(bytes / (1024 ** 2));
            this.log.warning('Memory is critically overloaded. '
                + `Using ${toMb(memCurrentBytes)} MB of ${toMb(this.maxMemoryBytes)} MB (${usedPercentage}%). Consider increasing available memory.`);
            this.lastLoggedCriticalMemoryOverloadAt = createdAt;
        }
    }
    /**
     * Creates a snapshot of current event loop delay.
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
            const delta = now.getTime() - +createdAt - this.eventLoopSnapshotIntervalMillis;
            if (delta > this.maxBlockedMillis)
                snapshot.isOverloaded = true;
            snapshot.exceededMillis = Math.max(delta - this.maxBlockedMillis, 0);
        }
        this.eventLoopSnapshots.push(snapshot);
        intervalCallback();
    }
    /**
     * Creates a snapshot of current CPU usage using the Apify platform `systemInfo` event.
     */
    _snapshotCpu(systemInfo) {
        const { cpuCurrentUsage, isCpuOverloaded } = systemInfo;
        const createdAt = systemInfo.createdAt ? new Date(systemInfo.createdAt) : new Date();
        this._pruneSnapshots(this.cpuSnapshots, createdAt);
        this.cpuSnapshots.push({
            createdAt,
            isOverloaded: isCpuOverloaded,
            usedRatio: Math.ceil(cpuCurrentUsage / 100),
        });
    }
    /**
     * Creates a snapshot of current API state by checking for
     * rate limit errors. Only errors produced by a 2nd retry
     * of the API call are considered for snapshotting since
     * earlier errors may just be caused by a random spike in
     * number of requests and do not necessarily signify API
     * overloading.
     */
    _snapshotClient(intervalCallback) {
        const now = new Date();
        this._pruneSnapshots(this.clientSnapshots, now);
        const allErrorCounts = this.client.stats?.rateLimitErrors ?? []; // storage client might not support this
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
            if (delta > this.maxClientErrors)
                snapshot.isOverloaded = true;
        }
        this.clientSnapshots.push(snapshot);
        intervalCallback();
    }
    /**
     * Removes snapshots that are older than the snapshotHistorySecs option
     * from the array (destructively - in place).
     */
    _pruneSnapshots(snapshots, now) {
        let oldCount = 0;
        for (let i = 0; i < snapshots.length; i++) {
            const { createdAt } = snapshots[i];
            if (now.getTime() - new Date(createdAt).getTime() > this.snapshotHistoryMillis)
                oldCount++;
            else
                break;
        }
        snapshots.splice(0, oldCount);
    }
    /**
     * Helper method for easier mocking.
     */
    async _getMemoryInfo() {
        return (0, utils_1.getMemoryInfo)();
    }
}
exports.Snapshotter = Snapshotter;
//# sourceMappingURL=snapshotter.js.map