import _ from 'underscore';
import { checkParamOrThrow } from 'apify-client/build/utils';
import Snapshotter from './snapshotter';
import { weightedAvg } from '../utils';

const DEFAULT_OPTIONS = {
    currentHistorySecs: 5, // TODO this should be something like "nowDurationSecs" but it's weird, ideas?
    maxMemoryOverloadedRatio: 0.2,
    maxEventLoopOverloadedRatio: 0.02,
    maxCpuOverloadedRatio: 0.1,
};

/**
 * Provides a simple interface to reading system status from a Snapshotter
 * instance. It only exposes two functions `isOk()` and `hasBeenOkLately()`.
 * The system status is calculated using a weighted average of overloaded
 * messages in the snapshots, with the weights being the time intervals
 * between the snapshots. Each resource is calculated separately
 * and the system is overloaded whenever at least one resource is overloaded.
 * The class is used by the {@linkcode AutoscaledPool} class.
 *
 * `getCurrentStatus()` returns a boolean that represents the current status of the system.
 * The length of the current timeframe in seconds is configurable
 * by the currentHistorySecs option and represents the max age
 * of snapshots to be considered for the calculation.
 *
 * `getHistoricalStatus()` returns a boolean that represents the long term status
 * of the system. It considers the full snapshot history available
 * in the Snapshotter instance.
 *
 * @param {Object} options
 * @param {Number} [options.currentHistorySecs=5]
 *   Defines max age of snapshots used in the `isOk()` measurement.
 * @param {Number} [options.maxMemoryOverloadedRatio=0.2]
 *   Sets the maximum ratio of overloaded snapshots in a memory sample.
 *   If the sample exceeds this ratio, the system will be overloaded.
 * @param {Number} [options.maxEventLoopOverloadedRatio=0.02]
 *   Sets the maximum ratio of overloaded snapshots in an event loop sample.
 *   If the sample exceeds this ratio, the system will be overloaded.
 * @param {Number} [options.maxCpuOverloadedRatio=0.1]
 *   Sets the maximum ratio of overloaded snapshots in a CPU sample.
 *   If the sample exceeds this ratio, the system will be overloaded.
 * @ignore
 */
export default class SystemStatus {
    constructor(options = {}) {
        const {
            currentHistorySecs,
            maxMemoryOverloadedRatio,
            maxEventLoopOverloadedRatio,
            maxCpuOverloadedRatio,
            snapshotter,
        } = _.defaults(options, DEFAULT_OPTIONS);

        checkParamOrThrow(currentHistorySecs, 'options.currentHistorySecs', 'Number');
        checkParamOrThrow(maxMemoryOverloadedRatio, 'options.maxMemoryOverloadedRatio', 'Number');
        checkParamOrThrow(maxEventLoopOverloadedRatio, 'options.maxEventLoopOverloadedRatio', 'Number');
        checkParamOrThrow(maxCpuOverloadedRatio, 'options.maxCpuOverloadedRatio', 'Number');
        checkParamOrThrow(snapshotter, 'options.snapshotter', 'Maybe Object');

        this.currentHistorySecs = currentHistorySecs * 1000;
        this.maxMemoryOverloadedRatio = maxMemoryOverloadedRatio;
        this.maxEventLoopOverloadedRatio = maxEventLoopOverloadedRatio;
        this.maxCpuOverloadedRatio = maxCpuOverloadedRatio;

        this.snapshotter = snapshotter || new Snapshotter();
    }

    /**
     * Returns true if the system has not been overloaded in the last
     * currentHistorySecs seconds, otherwise returns false.
     * @return {Boolean}
     * @ignore
     */
    getCurrentStatus() {
        return this._isSystemIdle(this.currentHistorySecs);
    }

    /**
     * Returns true if the system has not been overloaded in the full
     * history of the snapshotter (which is configurable in the snapshotter).
     * @return {Boolean}
     * @ignore
     */
    getHistoricalStatus() {
        return this._isSystemIdle();
    }

    /**
     * Returns true if the system has been overloaded
     * in the last sampleDurationMillis.
     *
     * @param {Number} [sampleDurationMillis]
     * @return {Boolean}
     * @ignore
     */
    _isSystemIdle(sampleDurationMillis) {
        const memInfo = this._isMemoryOverloaded(sampleDurationMillis);
        const eventLoopInfo = this._isEventLoopOverloaded(sampleDurationMillis);
        const cpuInfo = this._isCpuOverloaded(sampleDurationMillis);
        return {
            isSystemIdle: !memInfo.isOverloaded && !eventLoopInfo.isOverloaded && !cpuInfo.isOverloaded,
            memInfo,
            eventLoopInfo,
            cpuInfo,
        };
    }

    /**
     * Returns true if the memory has been overloaded
     * in the last sampleDurationMillis.
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
     * Returns true if the event loop has been overloaded
     * in the last sampleDurationMillis.
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
