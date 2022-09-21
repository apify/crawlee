import ow from 'ow';
import { weightedAvg } from '@crawlee/utils';
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
export class SystemStatus {
    private readonly currentHistorySecs: number;
    private readonly maxMemoryOverloadedRatio: number;
    private readonly maxEventLoopOverloadedRatio: number;
    private readonly maxCpuOverloadedRatio: number;
    private readonly maxClientOverloadedRatio: number;
    private readonly snapshotter: Snapshotter;

    constructor(options: SystemStatusOptions = {}) {
        ow(options, ow.object.exactShape({
            currentHistorySecs: ow.optional.number,
            maxMemoryOverloadedRatio: ow.optional.number,
            maxEventLoopOverloadedRatio: ow.optional.number,
            maxCpuOverloadedRatio: ow.optional.number,
            maxClientOverloadedRatio: ow.optional.number,
            snapshotter: ow.optional.object,
            config: ow.optional.object,
        }));

        const {
            currentHistorySecs = 5,
            maxMemoryOverloadedRatio = 0.2,
            maxEventLoopOverloadedRatio = 0.6,
            maxCpuOverloadedRatio = 0.4,
            maxClientOverloadedRatio = 0.3,
            snapshotter,
            config,
        } = options;

        this.currentHistorySecs = currentHistorySecs * 1000;
        this.maxMemoryOverloadedRatio = maxMemoryOverloadedRatio;
        this.maxEventLoopOverloadedRatio = maxEventLoopOverloadedRatio;
        this.maxCpuOverloadedRatio = maxCpuOverloadedRatio;
        this.maxClientOverloadedRatio = maxClientOverloadedRatio;
        this.snapshotter = snapshotter || new Snapshotter({ config });
    }

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
    getCurrentStatus(): SystemInfo {
        return this._isSystemIdle(this.currentHistorySecs);
    }

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
    getHistoricalStatus(): SystemInfo {
        return this._isSystemIdle();
    }

    /**
     * Returns a system status object.
     */
    protected _isSystemIdle(sampleDurationMillis?: number): SystemInfo {
        const memInfo = this._isMemoryOverloaded(sampleDurationMillis);
        const eventLoopInfo = this._isEventLoopOverloaded(sampleDurationMillis);
        const cpuInfo = this._isCpuOverloaded(sampleDurationMillis);
        const clientInfo = this._isClientOverloaded(sampleDurationMillis);
        return {
            isSystemIdle: !memInfo.isOverloaded && !eventLoopInfo.isOverloaded && !cpuInfo.isOverloaded && !clientInfo.isOverloaded,
            memInfo,
            eventLoopInfo,
            cpuInfo,
            clientInfo,
        };
    }

    /**
     * Returns an object with an isOverloaded property set to true
     * if the memory has been overloaded in the last sampleDurationMillis.
     */
    protected _isMemoryOverloaded(sampleDurationMillis?: number) {
        const sample = this.snapshotter.getMemorySample(sampleDurationMillis);
        return this._isSampleOverloaded(sample, this.maxMemoryOverloadedRatio);
    }

    /**
     * Returns an object with an isOverloaded property set to true
     * if the event loop has been overloaded in the last sampleDurationMillis.
     */
    protected _isEventLoopOverloaded(sampleDurationMillis?: number) {
        const sample = this.snapshotter.getEventLoopSample(sampleDurationMillis);
        return this._isSampleOverloaded(sample, this.maxEventLoopOverloadedRatio);
    }

    /**
     * Returns an object with an isOverloaded property set to true
     * if the CPU has been overloaded in the last sampleDurationMillis.
     */
    protected _isCpuOverloaded(sampleDurationMillis?: number) {
        const sample = this.snapshotter.getCpuSample(sampleDurationMillis);
        return this._isSampleOverloaded(sample, this.maxCpuOverloadedRatio);
    }

    /**
     * Returns an object with an isOverloaded property set to true
     * if the client has been overloaded in the last sampleDurationMillis.
     */
    protected _isClientOverloaded(sampleDurationMillis?: number): ClientInfo {
        const sample = this.snapshotter.getClientSample(sampleDurationMillis);
        return this._isSampleOverloaded(sample, this.maxClientOverloadedRatio);
    }

    /**
     * Returns an object with sample information and an isOverloaded property
     * set to true if at least the ratio of snapshots in the sample are overloaded.
     */
    protected _isSampleOverloaded<T extends { createdAt: Date; isOverloaded: boolean }>(sample: T[], ratio: number): ClientInfo {
        if (sample.length === 0) {
            return {
                isOverloaded: false,
                limitRatio: ratio,
                actualRatio: 0,
            };
        }

        const weights: number[] = [];
        const values: number[] = [];

        for (let i = 1; i < sample.length; i++) {
            const previous = sample[i - 1];
            const current = sample[i];
            const weight = +current.createdAt - +previous.createdAt;
            weights.push(weight || 1); // Prevent errors from 0ms long intervals (sync) between snapshots.
            values.push(+current.isOverloaded);
        }

        const wAvg = sample.length === 1 ? +sample[0].isOverloaded : weightedAvg(values, weights);

        return {
            isOverloaded: wAvg > ratio,
            limitRatio: ratio,
            actualRatio: Math.round(wAvg * 1000) / 1000,
        };
    }
}
