import { betterClearInterval, betterSetInterval } from '@apify/utilities';
import { serviceLocator } from '../service_locator.js';
import { EventManager, EventType } from './event_manager.js';
export class LocalEventManager extends EventManager {
    #systemInfoIntervalMillis;
    constructor(options) {
        super(options);
        this.#systemInfoIntervalMillis = options.systemInfoIntervalMillis;
    }
    /**
     * Creates a new `LocalEventManager` based on the provided `Configuration`.
     * Uses the global configuration from the service locator if none is provided.
     */
    static fromConfiguration(configuration) {
        const resolvedConfiguration = configuration ?? serviceLocator.getConfiguration();
        return new LocalEventManager({
            persistStateIntervalMillis: resolvedConfiguration.persistStateIntervalMillis,
            systemInfoIntervalMillis: resolvedConfiguration.systemInfoIntervalMillis,
        });
    }
    /**
     * Initializes the EventManager and sets up periodic `systemInfo` events.
     * This is automatically called at the beginning of `crawler.run()`.
     */
    async init() {
        if (this.initialized) {
            return;
        }
        await super.init();
        this.emitSystemInfoEvent = this.emitSystemInfoEvent.bind(this);
        this.intervals.systemInfo = betterSetInterval(this.emitSystemInfoEvent.bind(this), this.#systemInfoIntervalMillis);
    }
    /**
     * @inheritDoc
     */
    async close() {
        if (!this.initialized) {
            return;
        }
        await super.close();
        betterClearInterval(this.intervals.systemInfo);
    }
    /**
     * @internal
     */
    async emitSystemInfoEvent(intervalCallback) {
        const info = await this.createSystemInfo({
            maxUsedCpuRatio: serviceLocator.getConfiguration().maxUsedCpuRatio,
        });
        this.events.emit(EventType.SYSTEM_INFO, info);
        intervalCallback();
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
    async createSystemInfo(options) {
        return {
            createdAt: new Date(),
            ...(await this.createCpuInfo(options)),
            ...(await this.createMemoryInfo()),
        };
    }
    async createCpuInfo(options) {
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
    async createMemoryInfo() {
        try {
            const memInfo = await this.getMemoryInfo();
            return {
                memTotalBytes: memInfo.totalBytes,
                memCurrentBytes: memInfo.mainProcessBytes + memInfo.childProcessesBytes,
            };
        }
        catch (err) {
            this.log.exception(err, 'Memory snapshot failed.');
            return {};
        }
    }
    async getMemoryInfo() {
        const { getMemoryInfo } = await import('../system-info/memory-info.js');
        return getMemoryInfo({
            containerized: await this.isContainerizedWrapper(),
            logger: serviceLocator.getLogger(),
        });
    }
}
