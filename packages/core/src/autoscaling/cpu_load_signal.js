import { EventType } from '../events/event_manager.js';
import { serviceLocator } from '../service_locator.js';
import { SnapshotStore } from './load_signal.js';
/**
 * Tracks CPU usage via `SYSTEM_INFO` events and reports overload when the platform or local OS metrics indicate the
 * CPU is overloaded.
 *
 * Built by default; construct one yourself only to wrap or adapt it — see {@apilink LoadSignal}.
 *
 * @category Scaling
 */
export class CpuLoadSignal {
    name = 'cpuInfo';
    overloadedRatio;
    #store = new SnapshotStore();
    #events;
    constructor(options = {}) {
        this.overloadedRatio = options.overloadedRatio ?? 0.4;
        this.handle = this.handle.bind(this);
    }
    async start(context) {
        this.#store.useSampleWindow(context.maxSampleWindowMillis);
        // A new session starts from a clean slate, so it is not judged on measurements from before the downtime.
        this.#store.clear();
        // Resolved here rather than in the constructor, so an instance built ahead of time (to be wrapped, or shared
        // between systems) cannot capture whichever event manager happened to be registered at that moment.
        this.#events = serviceLocator.getEventManager();
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
        const { cpuCurrentUsage, isCpuOverloaded } = systemInfo;
        const createdAt = systemInfo.createdAt ? new Date(systemInfo.createdAt) : new Date();
        this.#store.push({
            createdAt,
            isOverloaded: isCpuOverloaded,
            usedRatio: Math.ceil(cpuCurrentUsage / 100),
        }, createdAt);
    }
}
