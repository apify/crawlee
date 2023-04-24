import { Snapshotter } from './snapshotter';
import type { Configuration } from '../configuration';
/**
 * Represents the current status of the system.
 */
export interface SystemInfo {
    /** If true, system is being overloaded. */
    isSystemIdle: boolean;
    memInfo: ClientInfo;
    eventLoopInfo: ClientInfo;
    cpuInfo: ClientInfo;
    clientInfo: ClientInfo;
    memCurrentBytes?: number;
    /**
     * Platform only property
     * @internal
     */
    cpuCurrentUsage?: number;
    /**
     * Platform only property
     * @internal
     */
    isCpuOverloaded?: boolean;
    /**
     * Platform only property
     * @internal
     */
    createdAt?: Date;
}
export interface SystemStatusOptions {
    /**
     * Defines max age of snapshots used in the {@apilink SystemStatus.getCurrentStatus} measurement.
     * @default 5
     */
    currentHistorySecs?: number;
    /**
     * Sets the maximum ratio of overloaded snapshots in a memory sample.
     * If the sample exceeds this ratio, the system will be overloaded.
     * @default 0.2
     */
    maxMemoryOverloadedRatio?: number;
    /**
     * Sets the maximum ratio of overloaded snapshots in an event loop sample.
     * If the sample exceeds this ratio, the system will be overloaded.
     * @default 0.6
     */
    maxEventLoopOverloadedRatio?: number;
    /**
     * Sets the maximum ratio of overloaded snapshots in a CPU sample.
     * If the sample exceeds this ratio, the system will be overloaded.
     * @default 0.4
     */
    maxCpuOverloadedRatio?: number;
    /**
     * Sets the maximum ratio of overloaded snapshots in a Client sample.
     * If the sample exceeds this ratio, the system will be overloaded.
     * @default 0.3
     */
    maxClientOverloadedRatio?: number;
    /**
     * The `Snapshotter` instance to be queried for `SystemStatus`.
     */
    snapshotter?: Snapshotter;
    /** @internal */
    config?: Configuration;
}
export interface ClientInfo {
    isOverloaded: boolean;
    limitRatio: number;
    actualRatio: number;
}
export interface FinalStatistics {
    requestsFinished: number;
    requestsFailed: number;
    retryHistogram: number[];
    requestAvgFailedDurationMillis: number;
    requestAvgFinishedDurationMillis: number;
    requestsFinishedPerMinute: number;
    requestsFailedPerMinute: number;
    requestTotalDurationMillis: number;
    requestsTotal: number;
    crawlerRuntimeMillis: number;
}
/**
 * Provides a simple interface to reading system status from a {@apilink Snapshotter} instance.
 * It only exposes two functions {@apilink SystemStatus.getCurrentStatus}
 * and {@apilink SystemStatus.getHistoricalStatus}.
 * The system status is calculated using a weighted average of overloaded
 * messages in the snapshots, with the weights being the time intervals
 * between the snapshots. Each resource is calculated separately
 * and the system is overloaded whenever at least one resource is overloaded.
 * The class is used by the {@apilink AutoscaledPool} class.
 *
 * {@apilink SystemStatus.getCurrentStatus}
 * returns a boolean that represents the current status of the system.
 * The length of the current timeframe in seconds is configurable
 * by the `currentHistorySecs` option and represents the max age
 * of snapshots to be considered for the calculation.
 *
 * {@apilink SystemStatus.getHistoricalStatus}
 * returns a boolean that represents the long-term status
 * of the system. It considers the full snapshot history available
 * in the {@apilink Snapshotter} instance.
 * @category Scaling
 */
export declare class SystemStatus {
    private readonly currentHistorySecs;
    private readonly maxMemoryOverloadedRatio;
    private readonly maxEventLoopOverloadedRatio;
    private readonly maxCpuOverloadedRatio;
    private readonly maxClientOverloadedRatio;
    private readonly snapshotter;
    constructor(options?: SystemStatusOptions);
    /**
     * Returns an {@apilink SystemInfo} object with the following structure:
     *
     * ```javascript
     * {
     *     isSystemIdle: Boolean,
     *     memInfo: Object,
     *     eventLoopInfo: Object,
     *     cpuInfo: Object
     * }
     * ```
     *
     * Where the `isSystemIdle` property is set to `false` if the system
     * has been overloaded in the last `options.currentHistorySecs` seconds,
     * and `true` otherwise.
     */
    getCurrentStatus(): SystemInfo;
    /**
     * Returns an {@apilink SystemInfo} object with the following structure:
     *
     * ```javascript
     * {
     *     isSystemIdle: Boolean,
     *     memInfo: Object,
     *     eventLoopInfo: Object,
     *     cpuInfo: Object
     * }
     * ```
     *
     * Where the `isSystemIdle` property is set to `false` if the system
     * has been overloaded in the full history of the {@apilink Snapshotter}
     * (which is configurable in the {@apilink Snapshotter}) and `true` otherwise.
     */
    getHistoricalStatus(): SystemInfo;
    /**
     * Returns a system status object.
     */
    protected _isSystemIdle(sampleDurationMillis?: number): SystemInfo;
    /**
     * Returns an object with an isOverloaded property set to true
     * if the memory has been overloaded in the last sampleDurationMillis.
     */
    protected _isMemoryOverloaded(sampleDurationMillis?: number): ClientInfo;
    /**
     * Returns an object with an isOverloaded property set to true
     * if the event loop has been overloaded in the last sampleDurationMillis.
     */
    protected _isEventLoopOverloaded(sampleDurationMillis?: number): ClientInfo;
    /**
     * Returns an object with an isOverloaded property set to true
     * if the CPU has been overloaded in the last sampleDurationMillis.
     */
    protected _isCpuOverloaded(sampleDurationMillis?: number): ClientInfo;
    /**
     * Returns an object with an isOverloaded property set to true
     * if the client has been overloaded in the last sampleDurationMillis.
     */
    protected _isClientOverloaded(sampleDurationMillis?: number): ClientInfo;
    /**
     * Returns an object with sample information and an isOverloaded property
     * set to true if at least the ratio of snapshots in the sample are overloaded.
     */
    protected _isSampleOverloaded<T extends {
        createdAt: Date;
        isOverloaded: boolean;
    }>(sample: T[], ratio: number): ClientInfo;
}
//# sourceMappingURL=system_status.d.ts.map