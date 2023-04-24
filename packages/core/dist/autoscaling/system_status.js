"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemStatus = void 0;
const tslib_1 = require("tslib");
const ow_1 = tslib_1.__importDefault(require("ow"));
const utils_1 = require("@crawlee/utils");
const snapshotter_1 = require("./snapshotter");
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
class SystemStatus {
    constructor(options = {}) {
        Object.defineProperty(this, "currentHistorySecs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxMemoryOverloadedRatio", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxEventLoopOverloadedRatio", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxCpuOverloadedRatio", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxClientOverloadedRatio", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "snapshotter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        (0, ow_1.default)(options, ow_1.default.object.exactShape({
            currentHistorySecs: ow_1.default.optional.number,
            maxMemoryOverloadedRatio: ow_1.default.optional.number,
            maxEventLoopOverloadedRatio: ow_1.default.optional.number,
            maxCpuOverloadedRatio: ow_1.default.optional.number,
            maxClientOverloadedRatio: ow_1.default.optional.number,
            snapshotter: ow_1.default.optional.object,
            config: ow_1.default.optional.object,
        }));
        const { currentHistorySecs = 5, maxMemoryOverloadedRatio = 0.2, maxEventLoopOverloadedRatio = 0.6, maxCpuOverloadedRatio = 0.4, maxClientOverloadedRatio = 0.3, snapshotter, config, } = options;
        this.currentHistorySecs = currentHistorySecs * 1000;
        this.maxMemoryOverloadedRatio = maxMemoryOverloadedRatio;
        this.maxEventLoopOverloadedRatio = maxEventLoopOverloadedRatio;
        this.maxCpuOverloadedRatio = maxCpuOverloadedRatio;
        this.maxClientOverloadedRatio = maxClientOverloadedRatio;
        this.snapshotter = snapshotter || new snapshotter_1.Snapshotter({ config });
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
    getCurrentStatus() {
        return this._isSystemIdle(this.currentHistorySecs);
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
    getHistoricalStatus() {
        return this._isSystemIdle();
    }
    /**
     * Returns a system status object.
     */
    _isSystemIdle(sampleDurationMillis) {
        const memInfo = this._isMemoryOverloaded(sampleDurationMillis);
        const eventLoopInfo = this._isEventLoopOverloaded(sampleDurationMillis);
        const cpuInfo = this._isCpuOverloaded(sampleDurationMillis);
        const clientInfo = this._isClientOverloaded(sampleDurationMillis);
        return {
            isSystemIdle: !memInfo.isOverloaded && !eventLoopInfo.isOverloaded && !cpuInfo.isOverloaded && !clientInfo.isOverloaded,
            memInfo,
            eventLoopInfo,
            cpuInfo,
            clientInfo,
        };
    }
    /**
     * Returns an object with an isOverloaded property set to true
     * if the memory has been overloaded in the last sampleDurationMillis.
     */
    _isMemoryOverloaded(sampleDurationMillis) {
        const sample = this.snapshotter.getMemorySample(sampleDurationMillis);
        return this._isSampleOverloaded(sample, this.maxMemoryOverloadedRatio);
    }
    /**
     * Returns an object with an isOverloaded property set to true
     * if the event loop has been overloaded in the last sampleDurationMillis.
     */
    _isEventLoopOverloaded(sampleDurationMillis) {
        const sample = this.snapshotter.getEventLoopSample(sampleDurationMillis);
        return this._isSampleOverloaded(sample, this.maxEventLoopOverloadedRatio);
    }
    /**
     * Returns an object with an isOverloaded property set to true
     * if the CPU has been overloaded in the last sampleDurationMillis.
     */
    _isCpuOverloaded(sampleDurationMillis) {
        const sample = this.snapshotter.getCpuSample(sampleDurationMillis);
        return this._isSampleOverloaded(sample, this.maxCpuOverloadedRatio);
    }
    /**
     * Returns an object with an isOverloaded property set to true
     * if the client has been overloaded in the last sampleDurationMillis.
     */
    _isClientOverloaded(sampleDurationMillis) {
        const sample = this.snapshotter.getClientSample(sampleDurationMillis);
        return this._isSampleOverloaded(sample, this.maxClientOverloadedRatio);
    }
    /**
     * Returns an object with sample information and an isOverloaded property
     * set to true if at least the ratio of snapshots in the sample are overloaded.
     */
    _isSampleOverloaded(sample, ratio) {
        if (sample.length === 0) {
            return {
                isOverloaded: false,
                limitRatio: ratio,
                actualRatio: 0,
            };
        }
        const weights = [];
        const values = [];
        for (let i = 1; i < sample.length; i++) {
            const previous = sample[i - 1];
            const current = sample[i];
            const weight = +current.createdAt - +previous.createdAt;
            weights.push(weight || 1); // Prevent errors from 0ms long intervals (sync) between snapshots.
            values.push(+current.isOverloaded);
        }
        const wAvg = sample.length === 1 ? +sample[0].isOverloaded : (0, utils_1.weightedAvg)(values, weights);
        return {
            isOverloaded: wAvg > ratio,
            limitRatio: ratio,
            actualRatio: Math.round(wAvg * 1000) / 1000,
        };
    }
}
exports.SystemStatus = SystemStatus;
//# sourceMappingURL=system_status.js.map