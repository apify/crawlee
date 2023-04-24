"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalEventManager = void 0;
const tslib_1 = require("tslib");
const node_os_1 = tslib_1.__importDefault(require("node:os"));
const log_1 = tslib_1.__importDefault(require("@apify/log"));
const utilities_1 = require("@apify/utilities");
const utils_1 = require("@crawlee/utils");
const event_manager_1 = require("./event_manager");
class LocalEventManager extends event_manager_1.EventManager {
    constructor() {
        super(...arguments);
        Object.defineProperty(this, "previousTicks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: { idle: 0, total: 0 }
        });
    }
    /**
     * Initializes the EventManager and sets up periodic `systemInfo` and `persistState` events.
     * This is automatically called at the beginning of `crawler.run()`.
     */
    async init() {
        if (this.initialized) {
            return;
        }
        await super.init();
        const systemInfoIntervalMillis = this.config.get('systemInfoIntervalMillis');
        this.emitSystemInfoEvent = this.emitSystemInfoEvent.bind(this);
        this.intervals.systemInfo = (0, utilities_1.betterSetInterval)(this.emitSystemInfoEvent.bind(this), systemInfoIntervalMillis);
    }
    /**
     * @inheritDoc
     */
    async close() {
        if (!this.initialized) {
            return;
        }
        await super.close();
        (0, utilities_1.betterClearInterval)(this.intervals.systemInfo);
    }
    /**
     * @internal
     */
    async emitSystemInfoEvent(intervalCallback) {
        const info = await this.createSystemInfo({
            maxUsedCpuRatio: this.config.get('maxUsedCpuRatio'),
        });
        this.events.emit("systemInfo" /* EventType.SYSTEM_INFO */, info);
        intervalCallback();
    }
    getCurrentCpuTicks() {
        const cpus = node_os_1.default.cpus();
        return cpus.reduce((acc, cpu) => {
            const cpuTimes = Object.values(cpu.times);
            return {
                idle: acc.idle + cpu.times.idle,
                total: acc.total + cpuTimes.reduce((sum, num) => sum + num),
            };
        }, { idle: 0, total: 0 });
    }
    /**
     * Creates a SystemInfo object based on local metrics.
     */
    async createSystemInfo(options) {
        return {
            createdAt: new Date(),
            ...this.createCpuInfo(options),
            ...await this.createMemoryInfo(),
        };
    }
    createCpuInfo(options) {
        const ticks = this.getCurrentCpuTicks();
        const idleTicksDelta = ticks.idle - this.previousTicks.idle;
        const totalTicksDelta = ticks.total - this.previousTicks.total;
        const usedCpuRatio = totalTicksDelta ? 1 - (idleTicksDelta / totalTicksDelta) : 0;
        Object.assign(this.previousTicks, ticks);
        return {
            cpuCurrentUsage: usedCpuRatio * 100,
            isCpuOverloaded: usedCpuRatio > options.maxUsedCpuRatio,
        };
    }
    async createMemoryInfo() {
        try {
            const memInfo = await this._getMemoryInfo();
            const { mainProcessBytes, childProcessesBytes } = memInfo;
            return {
                memCurrentBytes: mainProcessBytes + childProcessesBytes,
            };
        }
        catch (err) {
            log_1.default.exception(err, 'Memory snapshot failed.');
            return {};
        }
    }
    /**
     * Helper method for easier mocking.
     */
    async _getMemoryInfo() {
        return (0, utils_1.getMemoryInfo)();
    }
}
exports.LocalEventManager = LocalEventManager;
//# sourceMappingURL=local_event_manager.js.map