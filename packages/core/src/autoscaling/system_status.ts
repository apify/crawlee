import type { LoadSignal } from './load_signal.js';
import { evaluateLoadSignalSample } from './load_signal.js';
import type { LoadSignalsOptions, Snapshotter } from './snapshotter.js';

/**
 * Represents the current status of the system.
 */
export interface SystemInfo {
    /** If false, system is being overloaded. */
    isSystemIdle: boolean;
    memInfo: LoadSignalInfo;
    eventLoopInfo: LoadSignalInfo;
    cpuInfo: LoadSignalInfo;
    storageBackendInfo: LoadSignalInfo;
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
    loadSignalInfo?: Record<string, LoadSignalInfo>;
}

/**
 * How far back the *current* system status looks by default — the window that gates task dispatch.
 * @internal
 */
export const DEFAULT_CURRENT_HISTORY_SECS = 5;

/**
 * How far back the *historical* system status looks by default — the window autoscaling decisions are based on, and
 * therefore how much history the signals are asked to retain.
 * @internal
 */
export const DEFAULT_SNAPSHOT_HISTORY_SECS = 30;

/**
 * An implementation detail of the {@apilink ConcurrencySystem} — configure it through
 * {@apilink ConcurrencySystemOptions} (`loadSignals`, `currentHistorySecs` and `snapshotHistorySecs`).
 * @internal
 */
export interface SystemStatusOptions {
    /**
     * Defines max age of snapshots used in the {@apilink SystemStatus.getCurrentStatus} measurement.
     * @default 5
     */
    currentHistorySecs?: number;

    /**
     * Defines max age of snapshots used in the {@apilink SystemStatus.getHistoricalStatus} measurement — the window
     * autoscaling decisions are based on. Applied uniformly to every signal, built-in or custom, so that a signal's
     * private retention cannot silently widen the window.
     * @default 30
     */
    historySecs?: number;

    /**
     * The `Snapshotter` whose built-in signals are evaluated.
     */
    snapshotter: Snapshotter;

    /**
     * Additional load signals to include in the system status evaluation.
     * These are evaluated alongside the built-in memory, CPU, event loop,
     * and storage backend signals. If any signal reports overload, the system
     * is considered overloaded. Each signal carries its own overload ratio.
     */
    loadSignals?: LoadSignal[];
}

export interface LoadSignalInfo {
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

/** The four built-in signal names that map to typed `SystemInfo` fields, and the option that switches each off. */
const BUILTIN_SIGNAL_OPTION_KEYS: Record<string, keyof LoadSignalsOptions> = {
    memInfo: 'memory',
    eventLoopInfo: 'eventLoop',
    cpuInfo: 'cpu',
    storageBackendInfo: 'storageBackend',
};

const BUILTIN_SIGNAL_NAMES = new Set(Object.keys(BUILTIN_SIGNAL_OPTION_KEYS));

/**
 * Reads the overload verdict of every signal — the {@apilink Snapshotter}'s built-in four plus any custom ones — and
 * combines them into a {@apilink SystemInfo}: each signal is a time-weighted average of its snapshots, and the system
 * is overloaded whenever at least one of them is.
 *
 * Evaluated over two windows, both requested explicitly from every signal so that a signal's private retention cannot
 * widen what it contributes: a short `currentHistorySecs` one ({@apilink SystemStatus.getCurrentStatus}, gating task
 * dispatch) and a longer `historySecs` one ({@apilink SystemStatus.getHistoricalStatus}, driving autoscaling).
 *
 * An implementation detail of the {@apilink ConcurrencySystem}, configured through
 * {@apilink ConcurrencySystemOptions}.
 * @internal
 */
export class SystemStatus {
    readonly #currentHistoryMillis: number;
    readonly #historyMillis: number;
    readonly #signals: LoadSignal[];

    constructor(options: SystemStatusOptions) {
        const {
            currentHistorySecs = DEFAULT_CURRENT_HISTORY_SECS,
            historySecs = DEFAULT_SNAPSHOT_HISTORY_SECS,
            snapshotter,
            loadSignals = [],
        } = options;

        this.#currentHistoryMillis = currentHistorySecs * 1000;
        this.#historyMillis = historySecs * 1000;

        this.#signals = [...snapshotter.getLoadSignals(), ...loadSignals];
        this.assertUniqueSignalNames();
    }

    /**
     * The widest window any signal will be queried with, and therefore exactly how much history the signals are asked
     * to retain when they start. Derived here, where the windows are resolved, so nothing has to reapply their
     * defaults.
     */
    get maxSampleWindowMillis(): number {
        return Math.max(this.#currentHistoryMillis, this.#historyMillis);
    }

    /**
     * Signal names are the keys of the reported {@apilink SystemInfo}, so a duplicate would leave a status object that
     * contradicts actual behavior: both signals are still evaluated (any overloaded one holds concurrency down), but
     * only the last is reported.
     */
    private assertUniqueSignalNames(): void {
        const seen = new Set<string>();

        for (const { name } of this.#signals) {
            if (!seen.has(name)) {
                seen.add(name);
                continue;
            }

            const hint = BUILTIN_SIGNAL_NAMES.has(name)
                ? `it is the name of a built-in signal. To replace that signal, switch it off with \`loadSignals: { ${BUILTIN_SIGNAL_OPTION_KEYS[name]}: false }\` and keep your implementation in \`loadSignals.custom\`; to run yours alongside it, give it a different name.`
                : 'two custom signals cannot share a name - rename one of them.';

            throw new Error(`Duplicate load signal name ${JSON.stringify(name)}: ${hint}`);
        }
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
        return this.isSystemIdle(this.#currentHistoryMillis);
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
     * Where the `isSystemIdle` property is set to `false` if the system has been overloaded within the last
     * `historySecs` seconds and `true` otherwise.
     */
    getHistoricalStatus(): SystemInfo {
        return this.isSystemIdle(this.#historyMillis);
    }

    /**
     * Returns a system status object.
     */
    private isSystemIdle(sampleDurationMillis?: number): SystemInfo {
        const result: SystemInfo = {
            isSystemIdle: true,
            memInfo: { isOverloaded: false, limitRatio: 0, actualRatio: 0 },
            eventLoopInfo: { isOverloaded: false, limitRatio: 0, actualRatio: 0 },
            cpuInfo: { isOverloaded: false, limitRatio: 0, actualRatio: 0 },
            storageBackendInfo: { isOverloaded: false, limitRatio: 0, actualRatio: 0 },
        };

        let loadSignalInfo: Record<string, LoadSignalInfo> | undefined;

        for (const signal of this.#signals) {
            const sample = signal.getSample(sampleDurationMillis);
            const info = evaluateLoadSignalSample(sample, signal.overloadedRatio);

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
