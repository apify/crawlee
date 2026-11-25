import { betterClearInterval, betterSetInterval } from '@apify/utilities';

import type { Configuration } from '../configuration.js';
import { serviceLocator } from '../service-locator.js';
import { EventManager, type EventManagerOptions, EventType, type EventTypeName } from './event-manager.js';
import type { SystemInfo } from './system-info.js';

export interface LocalEventManagerOptions extends EventManagerOptions {
    /** Interval between emitted `systemInfo` events in milliseconds. */
    systemInfoIntervalMillis: number;
}

export class LocalEventManager extends EventManager {
    #systemInfoIntervalMillis: number;

    constructor(options: LocalEventManagerOptions) {
        super(options);
        this.#systemInfoIntervalMillis = options.systemInfoIntervalMillis;
    }

    /**
     * Creates a new `LocalEventManager` based on the provided `Configuration`.
     * Uses the global configuration from the service locator if none is provided.
     */
    static fromConfiguration(configuration?: Configuration): LocalEventManager {
        const resolvedConfiguration = configuration ?? serviceLocator.getConfiguration();

        return new LocalEventManager({
            persistStateIntervalMillis: resolvedConfiguration.persistStateIntervalMillis,
            systemInfoIntervalMillis: resolvedConfiguration.systemInfoIntervalMillis,
        });
    }

    /**
     * The `systemInfo` events are only emitted while something listens to them, as collecting them is not free.
     */
    override on(event: EventTypeName, listener: (...args: any[]) => any): void {
        super.on(event, listener);
        this.#startSystemInfo();
    }

    override off(event: EventTypeName, listener?: (...args: any[]) => any): void {
        super.off(event, listener);

        if (this.listenerCount(EventType.SYSTEM_INFO) === 0) {
            this.#stopSystemInfo();
        }
    }

    /**
     * @internal
     */
    override stop(): void {
        super.stop();
        this.#stopSystemInfo();
    }

    #startSystemInfo(): void {
        // Checked on every `on()`, so that listeners which outlived a `close()` are served again.
        if (this.intervals.systemInfo || this.listenerCount(EventType.SYSTEM_INFO) === 0) {
            return;
        }

        this.intervals.systemInfo = betterSetInterval(
            async () => this.emitSystemInfoEvent(),
            this.#systemInfoIntervalMillis,
        ).unref();
    }

    #stopSystemInfo(): void {
        betterClearInterval(this.intervals.systemInfo!);
        this.intervals.systemInfo = undefined;
    }

    /**
     * @internal
     */
    async emitSystemInfoEvent() {
        const info = await this.#createSystemInfo({
            maxUsedCpuRatio: serviceLocator.getConfiguration().maxUsedCpuRatio,
        });
        this.events.emit(EventType.SYSTEM_INFO, info);
    }

    /**
     * @internal
     */
    async isContainerizedWrapper() {
        const { isContainerized } = await import('../system-info/runtime.js');
        return serviceLocator.getConfiguration().containerized ?? (await isContainerized());
    }

    /**
     * Creates a SystemInfo object based on local metrics.
     */
    async #createSystemInfo(options: { maxUsedCpuRatio: number }) {
        return {
            createdAt: new Date(),
            ...(await this.#createCpuInfo(options)),
            ...(await this.#createMemoryInfo()),
        } as SystemInfo;
    }

    async #createCpuInfo(options: { maxUsedCpuRatio: number }) {
        const { getCurrentCpuTicksV2 } = await import('../system-info/cpu-info.js');
        const usedCpuRatio = await getCurrentCpuTicksV2({
            containerized: await this.isContainerizedWrapper(),
            logger: serviceLocator.getLogger(),
        });
        return {
            cpuCurrentUsage: usedCpuRatio * 100,
            isCpuOverloaded: usedCpuRatio > options.maxUsedCpuRatio,
        };
    }

    async #createMemoryInfo() {
        try {
            const memInfo = await this.#getMemoryInfo();
            return {
                memTotalBytes: memInfo.totalBytes,
                memCurrentBytes: memInfo.mainProcessBytes + memInfo.childProcessesBytes,
            };
        } catch (err) {
            this.log.exception(err as Error, 'Memory snapshot failed.');
            return {};
        }
    }

    async #getMemoryInfo() {
        const { getMemoryInfo } = await import('../system-info/memory-info.js');
        return getMemoryInfo({
            containerized: await this.isContainerizedWrapper(),
            logger: serviceLocator.getLogger(),
        });
    }
}
