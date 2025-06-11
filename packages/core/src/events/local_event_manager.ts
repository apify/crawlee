import { getCurrentCpuTicksV2, getMemoryInfo, isContainerized } from '@crawlee/utils';

import log from '@apify/log';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';

import type { SystemInfo } from '../autoscaling/system_status.js';
import { EventManager, EventType } from './event_manager.js';

export class LocalEventManager extends EventManager {
    /**
     * Initializes the EventManager and sets up periodic `systemInfo` and `persistState` events.
     * This is automatically called at the beginning of `crawler.run()`.
     */
    override async init() {
        if (this.initialized) {
            return;
        }

        await super.init();

        const systemInfoIntervalMillis = this.config.get('systemInfoIntervalMillis')!;
        this.emitSystemInfoEvent = this.emitSystemInfoEvent.bind(this);
        this.intervals.systemInfo = betterSetInterval(this.emitSystemInfoEvent.bind(this), systemInfoIntervalMillis);
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
            maxUsedCpuRatio: this.config.get('maxUsedCpuRatio'),
        });
        this.events.emit(EventType.SYSTEM_INFO, info);
        intervalCallback();
    }

    /**
     * @internal
     */
    async isContainerizedWrapper() {
        return this.config.get('containerized', await isContainerized());
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
