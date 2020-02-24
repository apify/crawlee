export default SystemStatus;
/**
 * Represents the current status of the system.
 */
export type SystemInfo = {
    /**
     * If true, system is being overloaded.
     */
    isSystemIdle: boolean;
    /**
     * Memory
     */
    memInfo: any;
    eventLoopInfo: any;
    cpuInfo: any;
};
export type SystemStatusOptions = {
    /**
     * Defines max age of snapshots used in the
     * {@link SystemStatus#getCurrentStatus} measurement.
     */
    currentHistorySecs?: number;
    /**
     * Sets the maximum ratio of overloaded snapshots in a memory sample.
     * If the sample exceeds this ratio, the system will be overloaded.
     */
    maxMemoryOverloadedRatio?: number;
    /**
     * Sets the maximum ratio of overloaded snapshots in an event loop sample.
     * If the sample exceeds this ratio, the system will be overloaded.
     */
    maxEventLoopOverloadedRatio?: number;
    /**
     * Sets the maximum ratio of overloaded snapshots in a CPU sample.
     * If the sample exceeds this ratio, the system will be overloaded.
     */
    maxCpuOverloadedRatio?: number;
    /**
     * Sets the maximum ratio of overloaded snapshots in a Client sample.
     * If the sample exceeds this ratio, the system will be overloaded.
     */
    maxClientOverloadedRatio?: number;
    /**
     * The `Snapshotter` instance to be queried for `SystemStatus`.
     */
    snapshotter?: Snapshotter;
};
/**
 * Represents the current status of the system.
 *
 * @typedef SystemInfo
 * @property {boolean} isSystemIdle
 *   If true, system is being overloaded.
 * @property {object} memInfo
 *   Memory
 * @property {object} eventLoopInfo
 * @property {object} cpuInfo
 */
/**
 * @typedef SystemStatusOptions
 * @property {number} [currentHistorySecs=5]
 *   Defines max age of snapshots used in the
 *   {@link SystemStatus#getCurrentStatus} measurement.
 * @property {number} [maxMemoryOverloadedRatio=0.2]
 *   Sets the maximum ratio of overloaded snapshots in a memory sample.
 *   If the sample exceeds this ratio, the system will be overloaded.
 * @property {number} [maxEventLoopOverloadedRatio=0.2]
 *   Sets the maximum ratio of overloaded snapshots in an event loop sample.
 *   If the sample exceeds this ratio, the system will be overloaded.
 * @property {number} [maxCpuOverloadedRatio=0.4]
 *   Sets the maximum ratio of overloaded snapshots in a CPU sample.
 *   If the sample exceeds this ratio, the system will be overloaded.
 * @property {number} [maxClientOverloadedRatio=0.2]
 *   Sets the maximum ratio of overloaded snapshots in a Client sample.
 *   If the sample exceeds this ratio, the system will be overloaded.
 * @property {Snapshotter} [snapshotter]
 *   The `Snapshotter` instance to be queried for `SystemStatus`.
 */
/**
 * Provides a simple interface to reading system status from a {@link Snapshotter} instance.
 * It only exposes two functions {@link SystemStatus#getCurrentStatus}
 * and {@link SystemStatus#getHistoricalStatus}.
 * The system status is calculated using a weighted average of overloaded
 * messages in the snapshots, with the weights being the time intervals
 * between the snapshots. Each resource is calculated separately
 * and the system is overloaded whenever at least one resource is overloaded.
 * The class is used by the {@link AutoscaledPool} class.
 *
 * {@link SystemStatus#getCurrentStatus}
 * returns a boolean that represents the current status of the system.
 * The length of the current timeframe in seconds is configurable
 * by the `currentHistorySecs` option and represents the max age
 * of snapshots to be considered for the calculation.
 *
 * {@link SystemStatus#getHistoricalStatus}
 * returns a boolean that represents the long-term status
 * of the system. It considers the full snapshot history available
 * in the {@link Snapshotter} instance.
 */
declare class SystemStatus {
    /**
     * @param {SystemStatusOptions} [options] All `SystemStatus` configuration options.
     */
    constructor(options?: SystemStatusOptions | undefined);
    currentHistorySecs: number;
    maxMemoryOverloadedRatio: any;
    maxEventLoopOverloadedRatio: any;
    maxCpuOverloadedRatio: any;
    maxClientOverloadedRatio: any;
    snapshotter: any;
    /**
     * Returns an {@link SystemInfo} object with the following structure:
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
     * @return {SystemInfo}
     */
    getCurrentStatus(): SystemInfo;
    /**
     * Returns an {@link SystemInfo} object with the following structure:
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
     * has been overloaded in the full history of the {@link Snapshotter}
     * (which is configurable in the {@link Snapshotter}) and `true` otherwise.
     * @return {SystemInfo}
     */
    getHistoricalStatus(): SystemInfo;
    /**
     * Returns a system status object.
     *
     * @param {number} [sampleDurationMillis]
     * @return {SystemInfo}
     * @ignore
     */
    _isSystemIdle(sampleDurationMillis?: number | undefined): SystemInfo;
    /**
     * Returns an object with an isOverloaded property set to true
     * if the memory has been overloaded in the last sampleDurationMillis.
     *
     * @param {number} sampleDurationMillis
     * @return {object}
     * @ignore
     */
    _isMemoryOverloaded(sampleDurationMillis: number): any;
    /**
     * Returns an object with an isOverloaded property set to true
     * if the event loop has been overloaded in the last sampleDurationMillis.
     *
     * @param {number} sampleDurationMillis
     * @return {object}
     * @ignore
     */
    _isEventLoopOverloaded(sampleDurationMillis: number): any;
    /**
     * Returns an object with an isOverloaded property set to true
     * if the CPU has been overloaded in the last sampleDurationMillis.
     *
     * @param {number} sampleDurationMillis
     * @return {object}
     * @ignore
     */
    _isCpuOverloaded(sampleDurationMillis: number): any;
    /**
     * Returns an object with an isOverloaded property set to true
     * if the client has been overloaded in the last sampleDurationMillis.
     * @param {number} sampleDurationMillis
     * @return {{isOverloaded: boolean, maxOverloadedRatio: number, actualRatio: number}}
     * @private
     */
    _isClientOverloaded(sampleDurationMillis: number): {
        isOverloaded: boolean;
        maxOverloadedRatio: number;
        actualRatio: number;
    };
    /**
     * Returns an object with sample information and an isOverloaded property
     * set to true if at least the ratio of snapshots in the sample are overloaded.
     *
     * @param {Array<*>} sample
     * @param {number} ratio
     * @return {object}
     * @ignore
     */
    _isSampleOverloaded(sample: any[], ratio: number): any;
}
import Snapshotter from "./snapshotter";
