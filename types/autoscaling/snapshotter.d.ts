export default Snapshotter;
export type SnapshotterOptions = {
    /**
     * Defines the interval of measuring the event loop response time.
     */
    eventLoopSnapshotIntervalSecs?: number;
    /**
     * Defines the interval of checking the current state
     * of the remote API client.
     */
    clientSnapshotIntervalSecs?: number;
    /**
     * Maximum allowed delay of the event loop in milliseconds.
     * Exceeding this limit overloads the event loop.
     */
    maxBlockedMillis?: number;
    /**
     * Defines the interval of measuring CPU usage.
     * This is only used when running locally. On the Apify platform,
     * the statistics are provided externally at a fixed interval.
     */
    cpuSnapshotIntervalSecs?: number;
    /**
     * Defines the maximum usage of CPU.
     * Exceeding this limit overloads the CPU.
     */
    maxUsedCpuRatio?: number;
    /**
     * Defines the interval of measuring memory consumption.
     * This is only used when running locally. On the Apify platform,
     * the statistics are provided externally at a fixed interval.
     * The measurement itself is resource intensive (25 - 50ms async).
     * Therefore, setting this interval below 1 second is not recommended.
     */
    memorySnapshotIntervalSecs?: number;
    /**
     * Defines the maximum ratio of total memory that can be used.
     * Exceeding this limit overloads the memory.
     */
    maxUsedMemoryRatio?: number;
    /**
     * Defines the maximum number of new rate limit errors within
     * the given interval.
     */
    maxClientErrors?: number;
    /**
     * Sets the interval in seconds for which a history of resource snapshots
     * will be kept. Increasing this to very high numbers will affect performance.
     */
    snapshotHistorySecs?: number;
};
/**
 * @typedef SnapshotterOptions
 * @property {number} [eventLoopSnapshotIntervalSecs=0.5]
 *   Defines the interval of measuring the event loop response time.
 * @property {number} [clientSnapshotIntervalSecs=1]
 *   Defines the interval of checking the current state
 *   of the remote API client.
 * @property {number} [maxBlockedMillis=50]
 *   Maximum allowed delay of the event loop in milliseconds.
 *   Exceeding this limit overloads the event loop.
 * @property {number} [cpuSnapshotIntervalSecs=1]
 *   Defines the interval of measuring CPU usage.
 *   This is only used when running locally. On the Apify platform,
 *   the statistics are provided externally at a fixed interval.
 * @property {number} [maxUsedCpuRatio=0.95]
 *   Defines the maximum usage of CPU.
 *   Exceeding this limit overloads the CPU.
 * @property {number} [memorySnapshotIntervalSecs=1]
 *   Defines the interval of measuring memory consumption.
 *   This is only used when running locally. On the Apify platform,
 *   the statistics are provided externally at a fixed interval.
 *   The measurement itself is resource intensive (25 - 50ms async).
 *   Therefore, setting this interval below 1 second is not recommended.
 * @property {number} [maxUsedMemoryRatio=0.7]
 *   Defines the maximum ratio of total memory that can be used.
 *   Exceeding this limit overloads the memory.
 * @property {number} [maxClientErrors=1]
 *   Defines the maximum number of new rate limit errors within
 *   the given interval.
 * @property {number} [snapshotHistorySecs=60]
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
declare class Snapshotter {
    /**
     * @param {SnapshotterOptions} [options] All `Snapshotter` configuration options.
     */
    constructor(options?: SnapshotterOptions | undefined);
    eventLoopSnapshotIntervalMillis: number;
    memorySnapshotIntervalMillis: number;
    clientSnapshotIntervalMillis: number;
    cpuSnapshotIntervalMillis: number;
    snapshotHistoryMillis: number;
    maxBlockedMillis: any;
    maxUsedMemoryRatio: any;
    maxUsedCpuRatio: any;
    maxClientErrors: any;
    maxMemoryBytes: number | null;
    cpuSnapshots: any[];
    eventLoopSnapshots: any[];
    memorySnapshots: any[];
    clientSnapshots: any[];
    eventLoopInterval: any;
    memoryInterval: any;
    clientInterval: any;
    cpuInterval: any;
    lastLoggedCriticalMemoryOverloadAt: Date | null;
    /**
     * Creates a snapshot of current CPU usage
     * using the Apify platform `systemInfo` event.
     * @param {Object} systemInfo
     * @ignore
     */
    _snapshotCpuOnPlatform(systemInfo: Object): void;
    /**
     * Creates a snapshot of current memory usage
     * using the Apify platform `systemInfo` event.
     * @param {*} systemInfo
     * @ignore
     */
    _snapshotMemoryOnPlatform(systemInfo: any): void;
    /**
     * Starts capturing snapshots at configured intervals.
     * @return {Promise<void>}
     */
    start(): Promise<void>;
    /**
     * Stops all resource capturing.
     * @return {Promise<void>}
     */
    stop(): Promise<void>;
    /**
     * Returns a sample of latest memory snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     * @param {number} [sampleDurationMillis]
     * @return {Array<*>}
     */
    getMemorySample(sampleDurationMillis?: number | undefined): any[];
    /**
     * Returns a sample of latest event loop snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     * @param {number} [sampleDurationMillis]
     * @return {Array<*>}
     */
    getEventLoopSample(sampleDurationMillis?: number | undefined): any[];
    /**
     * Returns a sample of latest CPU snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     * @param {number} [sampleDurationMillis]
     * @return {Array<*>}
     */
    getCpuSample(sampleDurationMillis?: number | undefined): any[];
    /**
     * Returns a sample of latest Client snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     * @param {number} sampleDurationMillis
     * @return {Array<*>}
     */
    getClientSample(sampleDurationMillis: number): any[];
    /**
     * Finds the latest snapshots by sampleDurationMillis in the provided array.
     * @param {Array<*>} snapshots
     * @param {number} [sampleDurationMillis]
     * @return {Array<*>}
     * @ignore
     */
    _getSample(snapshots: any[], sampleDurationMillis?: number | undefined): any[];
    /**
     * Creates a snapshot of current memory usage
     * using the Apify platform `systemInfo` event.
     * @param {Function} intervalCallback
     * @return {Promise<void>}
     * @ignore
     */
    _snapshotMemoryOnLocal(intervalCallback: Function): Promise<void>;
    /**
     * Checks for critical memory overload and logs it to the console.
     * @param {*} systemInfo
     * @ignore
     */
    _memoryOverloadWarning({ memCurrentBytes }: any): void;
    /**
     * Creates a snapshot of current event loop delay.
     * @param {Function} intervalCallback
     * @ignore
     */
    _snapshotEventLoop(intervalCallback: Function): void;
    /**
     * Creates a snapshot of current CPU usage
     * using OS provided metrics.
     * @param {Function} intervalCallback
     * @ignore
     */
    _snapshotCpuOnLocal(intervalCallback: Function): void;
    _getCurrentCpuTicks(): {
        idle: number;
        total: number;
    };
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
    _snapshotClient(intervalCallback: any): void;
    /**
     * Removes snapshots that are older than the snapshotHistorySecs option
     * from the array (destructively - in place).
     * @param {Array<*>} snapshots
     * @param {Date} now
     * @ignore
     */
    _pruneSnapshots(snapshots: any[], now: Date): void;
    /**
     * Calculate max memory for platform or local usage.
     * @ignore
     */
    _ensureCorrectMaxMemory(): Promise<void>;
}
