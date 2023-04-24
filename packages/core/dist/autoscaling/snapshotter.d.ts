import type { Log } from '@apify/log';
import type { BetterIntervalID } from '@apify/utilities';
import type { StorageClient } from '@crawlee/types';
import { Configuration } from '../configuration';
import type { SystemInfo } from './system_status';
import type { EventManager } from '../events/event_manager';
export interface SnapshotterOptions {
    /**
     * Defines the interval of measuring the event loop response time.
     * @default 0.5
     */
    eventLoopSnapshotIntervalSecs?: number;
    /**
     * Defines the interval of checking the current state
     * of the remote API client.
     * @default 1
     */
    clientSnapshotIntervalSecs?: number;
    /**
     * Maximum allowed delay of the event loop in milliseconds.
     * Exceeding this limit overloads the event loop.
     * @default 50
     */
    maxBlockedMillis?: number;
    /**
     * Defines the maximum ratio of total memory that can be used.
     * Exceeding this limit overloads the memory.
     * @default 0.7
     */
    maxUsedMemoryRatio?: number;
    /**
     * Defines the maximum number of new rate limit errors within
     * the given interval.
     * @default 1
     */
    maxClientErrors?: number;
    /**
     * Sets the interval in seconds for which a history of resource snapshots
     * will be kept. Increasing this to very high numbers will affect performance.
     * @default 60
     */
    snapshotHistorySecs?: number;
    /** @internal */
    log?: Log;
    /** @internal */
    client?: StorageClient;
    /** @internal */
    config?: Configuration;
}
interface MemorySnapshot {
    createdAt: Date;
    isOverloaded: boolean;
    usedBytes?: number;
}
interface CpuSnapshot {
    createdAt: Date;
    isOverloaded: boolean;
    usedRatio: number;
    ticks?: {
        idle: number;
        total: number;
    };
}
interface EventLoopSnapshot {
    createdAt: Date;
    isOverloaded: boolean;
    exceededMillis: number;
}
interface ClientSnapshot {
    createdAt: Date;
    isOverloaded: boolean;
    rateLimitErrorCount: number;
}
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
export declare class Snapshotter {
    log: Log;
    client: StorageClient;
    config: Configuration;
    events: EventManager;
    eventLoopSnapshotIntervalMillis: number;
    clientSnapshotIntervalMillis: number;
    snapshotHistoryMillis: number;
    maxBlockedMillis: number;
    maxUsedMemoryRatio: number;
    maxClientErrors: number;
    maxMemoryBytes: number;
    cpuSnapshots: CpuSnapshot[];
    eventLoopSnapshots: EventLoopSnapshot[];
    memorySnapshots: MemorySnapshot[];
    clientSnapshots: ClientSnapshot[];
    eventLoopInterval: BetterIntervalID;
    clientInterval: BetterIntervalID;
    lastLoggedCriticalMemoryOverloadAt: Date | null;
    /**
     * @param [options] All `Snapshotter` configuration options.
     */
    constructor(options?: SnapshotterOptions);
    /**
     * Starts capturing snapshots at configured intervals.
     */
    start(): Promise<void>;
    /**
     * Stops all resource capturing.
     */
    stop(): Promise<void>;
    /**
     * Returns a sample of latest memory snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getMemorySample(sampleDurationMillis?: number): MemorySnapshot[];
    /**
     * Returns a sample of latest event loop snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getEventLoopSample(sampleDurationMillis?: number): EventLoopSnapshot[];
    /**
     * Returns a sample of latest CPU snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getCpuSample(sampleDurationMillis?: number): CpuSnapshot[];
    /**
     * Returns a sample of latest Client snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getClientSample(sampleDurationMillis?: number): ClientSnapshot[];
    /**
     * Finds the latest snapshots by sampleDurationMillis in the provided array.
     */
    protected _getSample<T extends {
        createdAt: Date;
    }>(snapshots: T[], sampleDurationMillis?: number): T[];
    /**
     * Creates a snapshot of current memory usage
     * using the Apify platform `systemInfo` event.
     */
    protected _snapshotMemory(systemInfo: SystemInfo): void;
    /**
     * Checks for critical memory overload and logs it to the console.
     */
    protected _memoryOverloadWarning(systemInfo: SystemInfo): void;
    /**
     * Creates a snapshot of current event loop delay.
     */
    protected _snapshotEventLoop(intervalCallback: () => unknown): void;
    /**
     * Creates a snapshot of current CPU usage using the Apify platform `systemInfo` event.
     */
    protected _snapshotCpu(systemInfo: SystemInfo): void;
    /**
     * Creates a snapshot of current API state by checking for
     * rate limit errors. Only errors produced by a 2nd retry
     * of the API call are considered for snapshotting since
     * earlier errors may just be caused by a random spike in
     * number of requests and do not necessarily signify API
     * overloading.
     */
    protected _snapshotClient(intervalCallback: () => unknown): void;
    /**
     * Removes snapshots that are older than the snapshotHistorySecs option
     * from the array (destructively - in place).
     */
    protected _pruneSnapshots(snapshots: MemorySnapshot[] | CpuSnapshot[] | EventLoopSnapshot[] | ClientSnapshot[], now: Date): void;
    /**
     * Helper method for easier mocking.
     */
    private _getMemoryInfo;
}
export {};
//# sourceMappingURL=snapshotter.d.ts.map