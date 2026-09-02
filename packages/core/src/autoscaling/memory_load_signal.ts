import type { Configuration } from '../configuration.js';
import type { EventManager } from '../events/event_manager.js';
import { EventType } from '../events/event_manager.js';
import type { CrawleeLogger } from '../log.js';
import { serviceLocator } from '../service_locator.js';
import { getMemoryInfo } from '../system-info/memory-info.js';
import { isContainerized } from '../system-info/runtime.js';
import type { LoadSignal, LoadSignalStartContext, LoadSnapshot } from './load_signal.js';
import { SnapshotStore } from './load_signal.js';
import type { SystemInfo } from './system_status.js';

const RESERVE_MEMORY_RATIO = 0.5;
const CRITICAL_OVERLOAD_RATE_LIMIT_MILLIS = 10_000;

/**
 * A snapshot produced by the built-in memory signal.
 * @internal
 */
export interface MemorySnapshot extends LoadSnapshot {
    usedBytes?: number;
}

/**
 * Tuning for the built-in **memory** load signal, as accepted both by {@apilink MemoryLoadSignal} and by the
 * {@apilink LoadSignalsOptions.memory|`memory`} shorthand on {@apilink LoadSignalsOptions}.
 */
export interface MemoryLoadSignalOptions {
    /**
     * Defines the maximum ratio of total memory that can be used.
     * Exceeding this limit overloads the memory.
     * @default 0.9
     */
    maxUsedRatio?: number;

    /**
     * Maximum ratio of overloaded snapshots in a sample before memory counts as overloaded.
     * @default 0.2
     */
    overloadedRatio?: number;
}

/**
 * Tracks memory usage via `SYSTEM_INFO` events and reports overload when the used-to-available memory ratio exceeds a
 * threshold. Also warns when memory use becomes critical.
 *
 * Built by default; construct one yourself only to wrap or adapt it — see {@apilink LoadSignal}.
 *
 * @category Scaling
 */
export class MemoryLoadSignal implements LoadSignal {
    readonly name = 'memInfo';
    readonly overloadedRatio: number;

    readonly #store = new SnapshotStore<MemorySnapshot>();
    readonly #maxUsedRatio: number;
    /** All resolved in `start()`, before anything that reads them can fire. */
    #config!: Configuration;
    #log!: CrawleeLogger;
    #maxMemoryBytes!: number;
    #events?: EventManager;
    #maxMemoryRatio: number | undefined;
    #lastLoggedCriticalMemoryOverloadAt: Date | null = null;

    constructor(options: MemoryLoadSignalOptions = {}) {
        this.#maxUsedRatio = options.maxUsedRatio ?? 0.9;
        this.overloadedRatio = options.overloadedRatio ?? 0.2;
        this.handle = this.handle.bind(this);
    }

    async start(context: LoadSignalStartContext): Promise<void> {
        this.#store.useSampleWindow(context.maxSampleWindowMillis);
        // A new session starts from a clean slate, so it is not judged on measurements from before the downtime.
        this.#store.clear();

        // Resolved here rather than in the constructor: an instance built ahead of time (to be wrapped, or shared
        // between systems) must not capture whichever services happened to be registered at that moment.
        this.#config = serviceLocator.getConfiguration();
        this.#events = serviceLocator.getEventManager();
        this.#log = serviceLocator.getLogger().child({ prefix: 'MemoryLoadSignal' });

        const memoryMbytes = this.#config.memoryMbytes ?? 0;

        if (memoryMbytes > 0) {
            this.#maxMemoryBytes = memoryMbytes * 1024 * 1024;
        } else {
            this.#maxMemoryRatio = this.#config.availableMemoryRatio;
            if (!this.#maxMemoryRatio) {
                throw new Error('availableMemoryRatio is not set in configuration.');
            } else {
                this.#log.debug(
                    `Setting max memory of this run to ${this.#maxMemoryRatio * 100} % of available memory. ` +
                        'Use the CRAWLEE_MEMORY_MBYTES or CRAWLEE_AVAILABLE_MEMORY_RATIO environment variable to override it.',
                );
            }
            // Fallback memory measurement in case memTotalBytes is missing from SystemInfo.
            this.#maxMemoryBytes = await this.getTotalMemoryBytes();
        }

        this.#events.on(EventType.SYSTEM_INFO, this.handle);
    }

    async stop(): Promise<void> {
        this.#events?.off(EventType.SYSTEM_INFO, this.handle);
        this.#events = undefined;
    }

    getSample(sampleDurationMillis?: number): LoadSnapshot[] {
        return this.#store.getSample(sampleDurationMillis);
    }

    /** @internal Records a snapshot from a `SYSTEM_INFO` payload. Exposed for tests. */
    handle(systemInfo: SystemInfo): void {
        const createdAt = systemInfo.createdAt ? new Date(systemInfo.createdAt) : new Date();
        const { memCurrentBytes, memTotalBytes } = systemInfo;

        let maxMemoryBytes = this.#maxMemoryBytes;
        if (this.#maxMemoryRatio !== undefined && this.#maxMemoryRatio > 0) {
            maxMemoryBytes = this.#maxMemoryRatio * (memTotalBytes ?? this.#maxMemoryBytes);
        }

        const snapshot: MemorySnapshot = {
            createdAt,
            isOverloaded: memCurrentBytes! / maxMemoryBytes > this.#maxUsedRatio,
            usedBytes: memCurrentBytes,
        };

        this.#store.push(snapshot, createdAt);
        this.memoryOverloadWarning(systemInfo, maxMemoryBytes);
    }

    private memoryOverloadWarning(systemInfo: SystemInfo, maxMemoryBytes?: number): void {
        const effectiveMax = maxMemoryBytes ?? this.#maxMemoryBytes;
        const { memCurrentBytes } = systemInfo;
        const createdAt = systemInfo.createdAt ? new Date(systemInfo.createdAt) : new Date();
        if (
            this.#lastLoggedCriticalMemoryOverloadAt &&
            +createdAt < +this.#lastLoggedCriticalMemoryOverloadAt + CRITICAL_OVERLOAD_RATE_LIMIT_MILLIS
        )
            return;

        const maxDesiredMemoryBytes = this.#maxUsedRatio * effectiveMax;
        const reserveMemory = effectiveMax * (1 - this.#maxUsedRatio) * RESERVE_MEMORY_RATIO;
        const criticalOverloadBytes = maxDesiredMemoryBytes + reserveMemory;
        const isCriticalOverload = memCurrentBytes! > criticalOverloadBytes;

        if (isCriticalOverload) {
            const usedPercentage = Math.round((memCurrentBytes! / effectiveMax) * 100);
            const toMb = (bytes: number) => Math.round(bytes / 1024 ** 2);
            this.#log.warning(
                'Memory is critically overloaded. ' +
                    `Using ${toMb(memCurrentBytes!)} MB of ${toMb(
                        effectiveMax,
                    )} MB (${usedPercentage}%). Consider increasing available memory.`,
            );
            this.#lastLoggedCriticalMemoryOverloadAt = createdAt;
        }
    }

    private async getTotalMemoryBytes(): Promise<number> {
        const containerized = this.#config.containerized ?? (await isContainerized());
        return (await getMemoryInfo({ containerized, logger: serviceLocator.getLogger() })).totalBytes;
    }
}
