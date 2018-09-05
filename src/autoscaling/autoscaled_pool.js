import _ from 'underscore';
import { betterSetInterval, betterClearInterval } from 'apify-shared/utilities';
import { checkParamOrThrow } from 'apify-client/build/utils';
import Snapshotter from './snapshotter';
import SystemStatus from './system_status';

const DEFAULT_OPTIONS = {
    maxConcurrency: 1000,
    minConcurrency: 1,
    desiredConcurrencyRatio: 0.95,
    maybeRunIntervalSecs: 0.5,
    loggingIntervalSecs: 60,
    autoscaleIntervalSecs: 10,
};

export default class AutoscaledPool {
    constructor(options = {}) {
        const {
            maxConcurrency,
            minConcurrency,
            desiredConcurrencyRatio,
            maybeRunIntervalSecs,
            loggingIntervalSecs,
            autoscaleIntervalSecs,
            runTaskFunction,
            isFinishedFunction,
            isTaskReadyFunction,
            systemStatusOptions,
            snapshotterOptions,
        } = _.defaults(options, DEFAULT_OPTIONS);

        checkParamOrThrow(maxConcurrency, 'options.maxConcurrency', 'Number');
        checkParamOrThrow(minConcurrency, 'options.minConcurrency', 'Number');
        checkParamOrThrow(desiredConcurrencyRatio, 'options.desiredConcurrencyRatio', 'Number');
        checkParamOrThrow(maybeRunIntervalSecs, 'options.maybeRunIntervalSecs', 'Number');
        checkParamOrThrow(loggingIntervalSecs, 'options.loggingIntervalSecs', 'Number');
        checkParamOrThrow(autoscaleIntervalSecs, 'options.autoscaleIntervalSecs', 'Number');
        checkParamOrThrow(runTaskFunction, 'options.runTaskFunction', 'Function');
        checkParamOrThrow(isFinishedFunction, 'options.isFinishedFunction', 'Maybe Function');
        checkParamOrThrow(isTaskReadyFunction, 'options.isTaskReadyFunction', 'Maybe Function');
        checkParamOrThrow(systemStatusOptions, 'options.systemStatusOptions', 'Maybe Object');
        checkParamOrThrow(snapshotterOptions, 'options.snapshotterOptions', 'Maybe Object');

        this.maxConcurrency = maxConcurrency;
        this.minConcurrency = minConcurrency;
        this.desiredConcurrencyRatio = desiredConcurrencyRatio;
        this.maybeRunIntervalMillis = maybeRunIntervalSecs * 1000;
        this.loggingIntervalMillis = loggingIntervalSecs * 1000;
        this.autoscaleIntervalMillis = autoscaleIntervalSecs * 1000;
        this.runTaskFunction = runTaskFunction;
        this.isFinishedFunction = isFinishedFunction;
        this.isTaskReadyFunction = isTaskReadyFunction;

        this.snapshotter = new Snapshotter(snapshotterOptions);

        const ssoCopy = Object.assign({}, systemStatusOptions);
        if (!ssoCopy.snapshotter) ssoCopy.snapshotter = this.snapshotter;
        this.systemStatus = new SystemStatus(ssoCopy);

        this.desiredConcurrency = this.minConcurrency;
        this.currentConcurrency = 0;
    }

    async run() {
        this.poolPromise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });

        await this.snapshotter.start();
        this.autoscaleInterval = betterSetInterval(this._autoscale.bind(this), this.autoscaleIntervalMillis);
        this.maybeRunInterval = betterSetInterval(this._maybeRunTask.bind(this), this.maybeRunIntervalMillis);

        try {
            await this.poolPromise;
        } finally {
            this._destroy();
        }
    }

    abort() {

    }

    _autoscale(intervalCallback) {
        const isSystemOk = this.systemStatus.isOk();
        const canWeScaleUp = this.desiredConcurrency < this.maxConcurrency;
        const shouldWeScaleUp = Math.max(this.desiredConcurrency * )
        if (isSystemOk) {
            this.desiredConcurrency++;
        }
    }

    _maybeRunTask(intervalCallback) {

    }

    _maybeFinish() {

    }

    _destroy() {
        this.resolve = null;
        this.reject = null;

        betterClearInterval(this.autoscaleInterval);
        betterClearInterval(this.maybeRunInterval);
    }
}
