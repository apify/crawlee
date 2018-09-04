import _ from 'underscore';
import { checkParamOrThrow } from 'apify-client/build/utils';
import Promise from 'bluebird';
import Snapshotter from './snapshotter';
import SystemStatus from './system_status';

const DEFAULT_OPTIONS = {
    maxConcurrency: 1000,
    minConcurrency: 1,
    maybeRunIntervalSecs: 0.5,
    loggingIntervalSecs: 60,
};

export default class AutoscaledPool {
    constructor(options = {}) {
        const {
            maxConcurrency,
            minConcurrency,
            maybeRunIntervalSecs,
            loggingIntervalSecs,
            runTaskFunction,
            isFinishedFunction,
            isTaskReadyFunction,
            systemStatusOptions,
            snapshotterOptions,
        } = _.defaults(options, DEFAULT_OPTIONS);

        checkParamOrThrow(maxConcurrency, 'options.maxConcurrency', 'Number');
        checkParamOrThrow(minConcurrency, 'options.minConcurrency', 'Number');
        checkParamOrThrow(maybeRunIntervalSecs, 'options.maybeRunIntervalSecs', 'Number');
        checkParamOrThrow(loggingIntervalSecs, 'options.loggingIntervalSecs', 'Maybe Number');
        checkParamOrThrow(runTaskFunction, 'options.runTaskFunction', 'Function');
        checkParamOrThrow(isFinishedFunction, 'options.isFinishedFunction', 'Maybe Function');
        checkParamOrThrow(isTaskReadyFunction, 'options.isTaskReadyFunction', 'Maybe Function');
        checkParamOrThrow(systemStatusOptions, 'options.systemStatusOptions', 'Maybe Object');
        checkParamOrThrow(snapshotterOptions, 'options.snapshotterOptions', 'Maybe Object');

        this.maxConcurrency = maxConcurrency;
        this.minConcurrency = minConcurrency;
        this.maybeRunIntervalMillis = maybeRunIntervalSecs * 1000;
        this.loggingIntervalSecs = loggingIntervalSecs * 1000;
        this.runTaskFunction = runTaskFunction;
        this.isFinishedFunction = isFinishedFunction;
        this.isTaskReadyFunction = isTaskReadyFunction;

        this.snapshotter = new Snapshotter(snapshotterOptions);

        const ssoCopy = Object.assign({}, systemStatusOptions);
        if (!ssoCopy.snapshotter) ssoCopy.snapshotter = this.snapshotter;
        this.systemStatus = new SystemStatus(ssoCopy);
    }

    async run() {
        this.poolPromise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });


        this._maybeRunTask();

        try {
            await this.poolPromise;
        } finally {
            this._destroy();
        }
    }

    abort() {

    }

    _maybeRunTask() {

    }

    _maybeFinish() {

    }

    _destroy() {

    }
}
