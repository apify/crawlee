import { getCurrentCpuTicksV2, getMemoryInfo, isContainerized } from '@crawlee/utils';

import log from '@apify/log';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';

import type { SystemInfo } from '../autoscaling/system_status.js';
import type { Configuration } from '../configuration.js';
import { serviceLocator } from '../service_locator.js';
import { EventManager, type EventManagerOptions, EventType } from './event_manager.js';

export interface LocalEventManagerOptions extends EventManagerOptions {
    /** Interval between emitted `systemInfo` events in milliseconds. */
    systemInfoIntervalMillis: number;
}

export class LocalEventManager extends EventManager {
    private systemInfoIntervalMillis: number;

    constructor(options: LocalEventManagerOptions) {
        super(options);
        this.systemInfoIntervalMillis = options.systemInfoIntervalMillis;
    }

    /**
     * Creates a new `LocalEventManager` based on the provided `Configuration`.
     * Uses the global configuration from the service locator if none is provided.
     */
    static fromConfig(config?: Configuration): LocalEventManager {
        const resolvedConfig = config ?? serviceLocator.getConfiguration();

        return new LocalEventManager({
            persistStateIntervalMillis: resolvedConfig.get('persistStateIntervalMillis'),
            systemInfoIntervalMillis: resolvedConfig.get('systemInfoIntervalMillis'),
        });
    }

    /**
     * Initializes the EventManager and sets up periodic `systemInfo` events.
     * This is automatically called at the beginning of `crawler.run()`.
     */
    override async init() {
        if (this.initialized) {
            return;
        }

        await super.init();

        this.emitSystemInfoEvent = this.emitSystemInfoEvent.bind(this);
        this.intervals.systemInfo = betterSetInterval(
            this.emitSystemInfoEvent.bind(this),
            this.systemInfoIntervalMillis,
        );
    }

    /**
     * @inheritDoc
     */
    override async close() {
        if (!this.initialized) {
            return;
        }

        await super.close();
        betterClearInterval(this.intervals.systemInfo!);
    }

    /**
     * @internal
     */
    async emitSystemInfoEvent(intervalCallback: () => unknown) {
        const info = await this.createSystemInfo({
            maxUsedCpuRatio: serviceLocator.getConfiguration().get('maxUsedCpuRatio'),
        });
        this.events.emit(EventType.SYSTEM_INFO, info);
        intervalCallback();
    }

    /**
     * @internal
     */
    async isContainerizedWrapper() {
        return serviceLocator.getConfiguration().get('containerized', await isContainerized());
    }

    /**
     * Creates a SystemInfo object based on local metrics.
     */
    private async createSystemInfo(options: { maxUsedCpuRatio: number }) {
        return {
            createdAt: new Date(),
            ...(await this.createCpuInfo(options)),
            ...(await this.createMemoryInfo()),
        } as SystemInfo;
    }

    private async createCpuInfo(options: { maxUsedCpuRatio: number }) {
        const usedCpuRatio = await getCurrentCpuTicksV2(await this.isContainerizedWrapper());
        return {
            cpuCurrentUsage: usedCpuRatio * 100,
            isCpuOverloaded: usedCpuRatio > options.maxUsedCpuRatio,
        };
    }

    private async createMemoryInfo() {
        try {
            const memInfo = await getMemoryInfo(await this.isContainerizedWrapper());
            return {
                memCurrentBytes: memInfo.mainProcessBytes + memInfo.childProcessesBytes,
            };
        } catch (err) {
            log.exception(err as Error, 'Memory snapshot failed.');
            return {};
        }
    }
}
