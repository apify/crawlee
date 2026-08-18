import { EventType } from '../events/event_manager.js';
import { serviceLocator } from '../service_locator.js';
import { getMemoryInfo } from '../system-info/memory-info.js';
import { isContainerized } from '../system-info/runtime.js';
import { SnapshotStore } from './load_signal.js';
const RESERVE_MEMORY_RATIO = 0.5;
const CRITICAL_OVERLOAD_RATE_LIMIT_MILLIS = 10_000;
/**
 * Tracks memory usage via `SYSTEM_INFO` events and reports overload when the used-to-available memory ratio exceeds a
 * threshold. Also warns when memory use becomes critical.
 *
 * Built by default; construct one yourself only to wrap or adapt it — see {@apilink LoadSignal}.
 *
 * @category Scaling
 */
export class MemoryLoadSignal {
    name = 'memInfo';
    overloadedRatio;
    #store = new SnapshotStore();
    #maxUsedRatio;
    /** All resolved in `start()`, before anything that reads them can fire. */
    #config;
    #log;
    #maxMemoryBytes;
    #events;
    #maxMemoryRatio;
    #lastLoggedCriticalMemoryOverloadAt = null;
    constructor(options = {}) {
        this.#maxUsedRatio = options.maxUsedRatio ?? 0.9;
        this.overloadedRatio = options.overloadedRatio ?? 0.2;
        this.handle = this.handle.bind(this);
    }
    async start(context) {
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
        }
        else {
            this.#maxMemoryRatio = this.#config.availableMemoryRatio;
            if (!this.#maxMemoryRatio) {
                throw new Error('availableMemoryRatio is not set in configuration.');
            }
            else {
                this.#log.debug(`Setting max memory of this run to ${this.#maxMemoryRatio * 100} % of available memory. ` +
                    'Use the CRAWLEE_MEMORY_MBYTES or CRAWLEE_AVAILABLE_MEMORY_RATIO environment variable to override it.');
            }
            // Fallback memory measurement in case memTotalBytes is missing from SystemInfo.
            this.#maxMemoryBytes = await this.getTotalMemoryBytes();
        }
        this.#events.on(EventType.SYSTEM_INFO, this.handle);
    }
    async stop() {
        this.#events?.off(EventType.SYSTEM_INFO, this.handle);
        this.#events = undefined;
    }
    getSample(sampleDurationMillis) {
        return this.#store.getSample(sampleDurationMillis);
    }
    /** @internal Records a snapshot from a `SYSTEM_INFO` payload. Exposed for tests. */
    handle(systemInfo) {
        const createdAt = systemInfo.createdAt ? new Date(systemInfo.createdAt) : new Date();
        const { memCurrentBytes, memTotalBytes } = systemInfo;
        let maxMemoryBytes = this.#maxMemoryBytes;
        if (this.#maxMemoryRatio !== undefined && this.#maxMemoryRatio > 0) {
            maxMemoryBytes = this.#maxMemoryRatio * (memTotalBytes ?? this.#maxMemoryBytes);
        }
        const snapshot = {
            createdAt,
            isOverloaded: memCurrentBytes / maxMemoryBytes > this.#maxUsedRatio,
            usedBytes: memCurrentBytes,
        };
        this.#store.push(snapshot, createdAt);
        this.memoryOverloadWarning(systemInfo, maxMemoryBytes);
    }
    memoryOverloadWarning(systemInfo, maxMemoryBytes) {
        const effectiveMax = maxMemoryBytes ?? this.#maxMemoryBytes;
        const { memCurrentBytes } = systemInfo;
        const createdAt = systemInfo.createdAt ? new Date(systemInfo.createdAt) : new Date();
        if (this.#lastLoggedCriticalMemoryOverloadAt &&
            +createdAt < +this.#lastLoggedCriticalMemoryOverloadAt + CRITICAL_OVERLOAD_RATE_LIMIT_MILLIS)
            return;
        const maxDesiredMemoryBytes = this.#maxUsedRatio * effectiveMax;
        const reserveMemory = effectiveMax * (1 - this.#maxUsedRatio) * RESERVE_MEMORY_RATIO;
        const criticalOverloadBytes = maxDesiredMemoryBytes + reserveMemory;
        const isCriticalOverload = memCurrentBytes > criticalOverloadBytes;
        if (isCriticalOverload) {
            const usedPercentage = Math.round((memCurrentBytes / effectiveMax) * 100);
            const toMb = (bytes) => Math.round(bytes / 1024 ** 2);
            this.#log.warning('Memory is critically overloaded. ' +
                `Using ${toMb(memCurrentBytes)} MB of ${toMb(effectiveMax)} MB (${usedPercentage}%). Consider increasing available memory.`);
            this.#lastLoggedCriticalMemoryOverloadAt = createdAt;
        }
    }
    async getTotalMemoryBytes() {
        const containerized = this.#config.containerized ?? (await isContainerized());
        return (await getMemoryInfo({ containerized, logger: serviceLocator.getLogger() })).totalBytes;
    }
}
