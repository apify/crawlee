import _ from 'underscore';
import { checkParamOrThrow } from 'apify-client/build/utils';
import Snapshotter from './snapshotter';
import { weightedAvg } from '../utils';

const DEFAULT_OPTIONS = {
    sampleDurationSecs: 5, // TODO this should be something like "nowDurationSecs" but it's weird, ideas?
    maxMemoryOverloadedRatio: 0.2,
    maxEventLoopOverloadedRatio: 0.02,
    maxCpuOverloadedRatio: 0.1,
};

export default class SystemStatus {
    constructor(options = {}) {
        const {
            sampleDurationSecs,
            maxMemoryOverloadedRatio,
            maxEventLoopOverloadedRatio,
            maxCpuOverloadedRatio,
            snapshotter,
        } = _.defaults(options, DEFAULT_OPTIONS);

        checkParamOrThrow(sampleDurationSecs, 'options.sampleDurationSecs', 'Number');
        checkParamOrThrow(maxMemoryOverloadedRatio, 'options.maxMemoryOverloadedRatio', 'Number');
        checkParamOrThrow(maxEventLoopOverloadedRatio, 'options.maxEventLoopOverloadedRatio', 'Number');
        checkParamOrThrow(maxCpuOverloadedRatio, 'options.maxCpuOverloadedRatio', 'Number');
        checkParamOrThrow(snapshotter, 'options.snapshotter', 'Maybe Object');

        this.sampleDurationMillis = sampleDurationSecs * 1000;
        this.maxMemoryOverloadedRatio = maxMemoryOverloadedRatio;
        this.maxEventLoopOverloadedRatio = maxEventLoopOverloadedRatio;
        this.maxCpuOverloadedRatio = maxCpuOverloadedRatio;

        this.snapshotter = snapshotter || new Snapshotter();
    }

    isOverloadedNow() {
        return this._isOverloaded(this.sampleDurationMillis);
    }

    isOverloadedAlways() {
        return this._isOverloaded();
    }

    _isOverloaded(sampleDurationMillis) {
        return this._isMemoryOverloaded(sampleDurationMillis)
            || this._isEventLoopOverloaded(sampleDurationMillis)
            || this._isCpuOverloaded(sampleDurationMillis);
    }

    _isMemoryOverloaded(sampleDurationMillis) {
        const sample = this.snapshotter.getMemorySample(sampleDurationMillis);
        return this._isSampleOverloaded(sample, this.maxMemoryOverloadedRatio);
    }

    _isEventLoopOverloaded(sampleDurationMillis) {
        const sample = this.snapshotter.getEventLoopSample(sampleDurationMillis);
        return this._isSampleOverloaded(sample, this.maxEventLoopOverloadedRatio);
    }

    _isCpuOverloaded(sampleDurationMillis) {
        const sample = this.snapshotter.getCpuSample(sampleDurationMillis);
        return this._isSampleOverloaded(sample, this.maxCpuOverloadedRatio);
    }

    _isSampleOverloaded(sample, ratio) { // eslint-disable-line class-methods-use-this
        const weights = [];
        const values = [];
        for (let i = 1; i < sample.length; i++) {
            const previous = sample[i - 1];
            const current = sample[i];
            weights.push(current.timestamp - previous.timestamp);
            values.push(Number(current.isOverloaded));
        }
        const wAvg = weightedAvg(values, weights);
        return wAvg > ratio;
    }
}
