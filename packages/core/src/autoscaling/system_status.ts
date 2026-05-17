import ow from 'ow';

import type { Configuration } from '../configuration';
import type { LoadSignal } from './load_signal';
import { evaluateLoadSignalSample } from './load_signal';
import { Snapshotter } from './snapshotter';

/**
 * Represents the current status of the system.
 */
export interface SystemInfo {
    /** If false, system is being overloaded. */
    isSystemIdle: boolean;
    memInfo: ClientInfo;
    eventLoopInfo: ClientInfo;
    cpuInfo: ClientInfo;
    clientInfo: ClientInfo;
    memTotalBytes?: number;
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

    /**
     * Status of additional load signals beyond the built-in four.
     * Keys are `LoadSignal.name` values, values are overload info.
     */
    loadSignalInfo?: Record<string, ClientInfo>;
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

    /**
     * Additional load signals to include in the system status evaluation.
     * These are evaluated alongside the built-in memory, CPU, event loop,
     * and client signals. If any signal reports overload, the system is
     * considered overloaded.
     */
    loadSignals?: LoadSignal[];

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

/** The four built-in signal names that map to typed `SystemInfo` fields. */
const BUILTIN_SIGNAL_NAMES = new Set(['memInfo', 'eventLoopInfo', 'cpuInfo', 'clientInfo']);

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
    private readonly currentHistoryMillis: number;
    private readonly snapshotter: Snapshotter;
    private readonly signals: LoadSignal[];

    /**
     * Per-signal ratio overrides. The built-in four get their overrides from
     * the legacy `max*OverloadedRatio` options; custom signals use their own
     * `overloadedRatio`.
     */
    private ratioOverrides: Record<string, number>;

    constructor(options: SystemStatusOptions = {}) {
        ow(
            options,
            ow.object.exactShape({
                currentHistorySecs: ow.optional.number,
                maxMemoryOverloadedRatio: ow.optional.number,
                maxEventLoopOverloadedRatio: ow.optional.number,
                maxCpuOverloadedRatio: ow.optional.number,
                maxClientOverloadedRatio: ow.optional.number,
                snapshotter: ow.optional.object,
                loadSignals: ow.optional.array,
                config: ow.optional.object,
            }),
        );

        const {
            currentHistorySecs = 5,
            maxMemoryOverloadedRatio = 0.2,
            maxEventLoopOverloadedRatio = 0.6,
            maxCpuOverloadedRatio = 0.4,
            maxClientOverloadedRatio = 0.3,
            snapshotter,
            loadSignals = [],
            config,
        } = options;

        this.currentHistoryMillis = currentHistorySecs * 1000;
        this.snapshotter = snapshotter || new Snapshotter({ config });

        // Built-in signals from the snapshotter + any custom signals
        this.signals = [...this.snapshotter.getLoadSignals(), ...loadSignals];

        // Allow legacy options to override the built-in signal ratios
        this.ratioOverrides = {
            memInfo: maxMemoryOverloadedRatio,
            eventLoopInfo: maxEventLoopOverloadedRatio,
            cpuInfo: maxCpuOverloadedRatio,
            clientInfo: maxClientOverloadedRatio,
        };
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
        return this._isSystemIdle(this.currentHistoryMillis);
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
        const result: SystemInfo = {
            isSystemIdle: true,
            memInfo: { isOverloaded: false, limitRatio: 0, actualRatio: 0 },
            eventLoopInfo: { isOverloaded: false, limitRatio: 0, actualRatio: 0 },
            cpuInfo: { isOverloaded: false, limitRatio: 0, actualRatio: 0 },
            clientInfo: { isOverloaded: false, limitRatio: 0, actualRatio: 0 },
        };

        let loadSignalInfo: Record<string, ClientInfo> | undefined;

        for (const signal of this.signals) {
            const ratio = this.ratioOverrides[signal.name] ?? signal.overloadedRatio;
            const sample = signal.getSample(sampleDurationMillis);
            const info = evaluateLoadSignalSample(sample, ratio);

            if (info.isOverloaded) {
                result.isSystemIdle = false;
            }

            if (BUILTIN_SIGNAL_NAMES.has(signal.name)) {
                (result as any)[signal.name] = info;
            } else {
                loadSignalInfo ??= {};
                loadSignalInfo[signal.name] = info;
            }
        }

        if (loadSignalInfo) {
            result.loadSignalInfo = loadSignalInfo;
        }

        return result;
    }
}
