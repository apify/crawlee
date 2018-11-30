import _ from 'underscore';
import { checkParamOrThrow } from 'apify-client/build/utils';
import Snapshotter from './snapshotter';
import { weightedAvg } from '../utils';

const DEFAULT_OPTIONS = {
    currentHistorySecs: 5,
    maxMemoryOverloadedRatio: 0.2,
    maxEventLoopOverloadedRatio: 0.2,
    maxCpuOverloadedRatio: 0.4,
    maxClientOverloadedRatio: 0.2,
};

/**
 * Provides a simple interface to reading system status from a {@link Snapshotter} instance.
 * It only exposes two functions [`getCurrentStatus()`](#SystemStatus+getCurrentStatus)
 * and [`getHistoricalStatus()`](#SystemStatus+getHistoricalStatus).
 * The system status is calculated using a weighted average of overloaded
 * messages in the snapshots, with the weights being the time intervals
 * between the snapshots. Each resource is calculated separately
 * and the system is overloaded whenever at least one resource is overloaded.
 * The class is used by the {@link AutoscaledPool} class.
 *
 * [`getCurrentStatus()`](#SystemStatus+getCurrentStatus)
 * returns a boolean that represents the current status of the system.
 * The length of the current timeframe in seconds is configurable
 * by the `currentHistorySecs` option and represents the max age
 * of snapshots to be considered for the calculation.
 *
 * [`getHistoricalStatus()`](#SystemStatus+getHistoricalStatus)
 * returns a boolean that represents the long-term status
 * of the system. It considers the full snapshot history available
 * in the {@link Snapshotter} instance.
 *
 * @param {Object} [options] All `SystemStatus` parameters are passed
 *   via an options object with the following keys:
 * @param {Number} [options.currentHistorySecs=5]
 *   Defines max age of snapshots used in the
 *   [`getCurrentStatus()`](#SystemStatus+getCurrentStatus) measurement.
 * @param {Number} [options.maxMemoryOverloadedRatio=0.2]
 *   Sets the maximum ratio of overloaded snapshots in a memory sample.
 *   If the sample exceeds this ratio, the system will be overloaded.
 * @param {Number} [options.maxEventLoopOverloadedRatio=0.2]
 *   Sets the maximum ratio of overloaded snapshots in an event loop sample.
 *   If the sample exceeds this ratio, the system will be overloaded.
 * @param {Number} [options.maxCpuOverloadedRatio=0.4]
 *   Sets the maximum ratio of overloaded snapshots in a CPU sample.
 *   If the sample exceeds this ratio, the system will be overloaded.
 * @param {Number} [options.maxClientOverloadedRatio=0.2]
 *   Sets the maximum ratio of overloaded snapshots in a Client sample.
 *   If the sample exceeds this ratio, the system will be overloaded.
 */
class SystemStatus {
    constructor(options = {}) {
        const {
            currentHistorySecs,
            maxMemoryOverloadedRatio,
            maxEventLoopOverloadedRatio,
            maxCpuOverloadedRatio,
            maxClientOverloadedRatio,
            snapshotter,
        } = _.defaults({}, options, DEFAULT_OPTIONS);

        checkParamOrThrow(currentHistorySecs, 'options.currentHistorySecs', 'Number');
        checkParamOrThrow(maxMemoryOverloadedRatio, 'options.maxMemoryOverloadedRatio', 'Number');
        checkParamOrThrow(maxEventLoopOverloadedRatio, 'options.maxEventLoopOverloadedRatio', 'Number');
        checkParamOrThrow(maxCpuOverloadedRatio, 'options.maxCpuOverloadedRatio', 'Number');
        checkParamOrThrow(maxClientOverloadedRatio, 'options.maxClientOverloadedRatio', 'Number');
        checkParamOrThrow(snapshotter, 'options.snapshotter', 'Maybe Object');

        this.currentHistorySecs = currentHistorySecs * 1000;
        this.maxMemoryOverloadedRatio = maxMemoryOverloadedRatio;
        this.maxEventLoopOverloadedRatio = maxEventLoopOverloadedRatio;
        this.maxCpuOverloadedRatio = maxCpuOverloadedRatio;
        this.maxClientOverloadedRatio = maxClientOverloadedRatio;

        this.snapshotter = snapshotter || new Snapshotter();
    }

    /**
     * Returns an object with the following structure:
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
     * @return {Object}
     */
    getCurrentStatus() {
        return this._isSystemIdle(this.currentHistorySecs);
    }

    /**
     * Returns an object with the following structure:
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
     * has been overloaded in the full history of the {@link Snapshotter}
     * (which is configurable in the {@link Snapshotter}) and `true` otherwise.
     * @return {Object}
     */
    getHistoricalStatus() {
        return this._isSystemIdle();
    }

    /**
     * Returns a system status object.
     *
     * @param {Number} [sampleDurationMillis]
     * @return {Boolean}
     * @ignore
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
     *
     * @param {Number} sampleDurationMillis
     * @return {Object}
     * @ignore
     */
    _isMemoryOverloaded(sampleDurationMillis) {
        const sample = this.snapshotter.getMemorySample(sampleDurationMillis);
        return this._isSampleOverloaded(sample, this.maxMemoryOverloadedRatio);
    }

    /**
     * Returns an object with an isOverloaded property set to true
     * if the event loop has been overloaded in the last sampleDurationMillis.
     *
     * @param {Number} sampleDurationMillis
     * @return {Object}
     * @ignore
     */
    _isEventLoopOverloaded(sampleDurationMillis) {
        const sample = this.snapshotter.getEventLoopSample(sampleDurationMillis);
        return this._isSampleOverloaded(sample, this.maxEventLoopOverloadedRatio);
    }

    /**
     * Returns an object with an isOverloaded property set to true
     * if the CPU has been overloaded in the last sampleDurationMillis.
     *
     * @param {Number} sampleDurationMillis
     * @return {Object}
     * @ignore
     */
    _isCpuOverloaded(sampleDurationMillis) {
        const sample = this.snapshotter.getCpuSample(sampleDurationMillis);
        return this._isSampleOverloaded(sample, this.maxCpuOverloadedRatio);
    }

    /**
     * Returns an object with an isOverloaded property set to true
     * if the client has been overloaded in the last sampleDurationMillis.
     * @param sampleDurationMillis
     * @return {{isOverloaded, maxOverloadedRatio, actualRatio}}
     * @private
     */
    _isClientOverloaded(sampleDurationMillis) {
        const sample = this.snapshotter.getClientSample(sampleDurationMillis);
        return this._isSampleOverloaded(sample, this.maxClientOverloadedRatio);
    }

    /**
     * Returns an object with sample information and an isOverloaded property
     * set to true if at least the ratio of snapshots in the sample are overloaded.
     *
     * @param {Array} sample
     * @param {Number} ratio
     * @return {Object}
     * @ignore
     */
    _isSampleOverloaded(sample, ratio) { // eslint-disable-line class-methods-use-this
        const weights = [];
        const values = [];
        for (let i = 1; i < sample.length; i++) {
            const previous = sample[i - 1];
            const current = sample[i];
            const weight = current.createdAt - previous.createdAt;
            weights.push(weight || 1); // Prevent errors from 0ms long intervals (sync) between snapshots.
            values.push(Number(current.isOverloaded));
        }
        const wAvg = weightedAvg(values, weights);
        return {
            isOverloaded: wAvg > ratio,
            maxOverloadedRatio: ratio,
            actualRatio: wAvg,
        };
    }
}

export default SystemStatus;
