import _ from 'underscore';
import { betterSetInterval, betterClearInterval } from 'apify-shared/utilities';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import Snapshotter from './snapshotter';
import SystemStatus from './system_status';

const DEFAULT_OPTIONS = {
    maxConcurrency: 1000,
    minConcurrency: 1,
    desiredConcurrencyRatio: 0.95,
    scaleUpStepRatio: 0.05,
    scaleDownStepRatio: 0.05,
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
            scaleUpStepRatio,
            scaleDownStepRatio,
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
        checkParamOrThrow(scaleUpStepRatio, 'options.scaleUpStepRatio', 'Number');
        checkParamOrThrow(scaleDownStepRatio, 'options.scaleDownStepRatio', 'Number');
        checkParamOrThrow(maybeRunIntervalSecs, 'options.maybeRunIntervalSecs', 'Number');
        checkParamOrThrow(loggingIntervalSecs, 'options.loggingIntervalSecs', 'Number');
        checkParamOrThrow(autoscaleIntervalSecs, 'options.autoscaleIntervalSecs', 'Number');
        checkParamOrThrow(runTaskFunction, 'options.runTaskFunction', 'Function');
        checkParamOrThrow(isFinishedFunction, 'options.isFinishedFunction', 'Function');
        checkParamOrThrow(isTaskReadyFunction, 'options.isTaskReadyFunction', 'Function');
        checkParamOrThrow(systemStatusOptions, 'options.systemStatusOptions', 'Maybe Object');
        checkParamOrThrow(snapshotterOptions, 'options.snapshotterOptions', 'Maybe Object');

        this.maxConcurrency = maxConcurrency;
        this.minConcurrency = minConcurrency;
        this.desiredConcurrencyRatio = desiredConcurrencyRatio;
        this.scaleUpStepRatio = scaleUpStepRatio;
        this.scaleDownStepRatio = scaleDownStepRatio;
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
        this.lastLoggingTime = 0;

        this._autoscale = this._autoscale.bind(this);
        this._maybeRunTask = this._maybeRunTask.bind(this);
    }

    async run() {
        this.poolPromise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });

        await this.snapshotter.start();
        this.autoscaleInterval = betterSetInterval(this._autoscale, this.autoscaleIntervalMillis);
        this.maybeRunInterval = betterSetInterval(this._maybeRunTask, this.maybeRunIntervalMillis);

        try {
            await this.poolPromise;
        } finally {
            await this._destroy();
        }
    }

    abort() {
        if (this.resolve) this.resolve();
    }

    async _maybeRunTask(intervalCallback) {
        // Check if the function was invoked by the maybeRunInterval and use an empty function if not.
        const done = intervalCallback || (() => {});

        // Only run task if:
        // - we're not already querying for a task
        if (this.queryingIsTaskReady) return done();
        // - we will not exceed desired concurrency.
        if (this.currentConcurrency >= this.desiredConcurrency) return done();
        // - system is not overloaded now
        if (!this.systemStatus.isOk()) return done();
        // - a task is ready.
        this.queryingIsTaskReady = true;
        let isTaskReady;
        try {
            isTaskReady = await this.isTaskReadyFunction();
        } catch (err) {
            log.exception(err, 'AutoscaledPool: isTaskReadyFunction failed');
        } finally {
            this.queryingIsTaskReady = false;
        }
        if (!isTaskReady) {
            done();
            // No tasks could mean that we're finished with all tasks.
            return this._maybeFinish();
        }

        // Everything's fine. Run task.
        try {
            this.currentConcurrency++;
            setImmediate(this._maybeRunTask); // Try to run next task to build up concurrency.
            done(); // We need to restart interval here, so that it isn't blocked by a stalled task.
            await this.runTaskFunction();
            this.currentConcurrency--;
            setImmediate(this._maybeRunTask); // Run task after the previous one finished.
        } catch (err) {
            // We might have already rejected this promise.
            if (this.reject) {
                this.reject(err);
                // No need to log all concurrent errors.
                log.exception(err, 'AutoscaledPool: runTaskFunction failed');
            }
        }
    }

    _autoscale(intervalCallback) {
        // Only scale up if:
        // - system has not been overloaded lately.
        const isSystemOk = this.systemStatus.hasBeenOkLately();
        // - we're not already at max concurrency.
        const canWeScaleUp = this.desiredConcurrency < this.maxConcurrency;
        // - current concurrency reaches at least the given ratio of desired concurrency.
        const minCurrentConcurrency = Math.floor(this.desiredConcurrency * this.desiredConcurrencyRatio);
        const shouldWeScaleUp = this.currentConcurrency >= minCurrentConcurrency;

        if (isSystemOk && canWeScaleUp && shouldWeScaleUp) this._scaleUp();

        // Always scale down if:
        // - the system has been overloaded lately.
        const isSystemOverloaded = !isSystemOk;
        // - we're over min concurrency.
        const canWeScaleDown = this.desiredConcurrency > this.minConcurrency;

        if (isSystemOverloaded && canWeScaleDown) this._scaleDown();

        // On periodic intervals, print comprehensive log information
        if (this.loggingIntervalMillis > 0) {
            const now = Date.now();
            if (now > this.lastLoggingTime + this.loggingIntervalMillis) {
                this.lastLoggingTime = now;
                log.info('AutoscaledPool state', {
                    currentConcurrency: this.currentConcurrency,
                    desiredConcurrency: this.desiredConcurrency,
                    isSystemOk,
                });
            }
        }

        // Start a new interval cycle.
        intervalCallback();
    }

    _scaleUp() {
        const step = Math.ceil(this.desiredConcurrency * this.scaleUpStepRatio);
        this.desiredConcurrency = Math.min(this.maxConcurrency, this.desiredConcurrency + step);
        log.debug('AutoscaledPool: scaling up', {
            oldConcurrency: this.desiredConcurrency - step,
            newConcurrency: this.desiredConcurrency,
        });
    }

    _scaleDown() {
        const step = Math.ceil(this.desiredConcurrency * this.scaleUpStepRatio);
        this.desiredConcurrency = Math.max(this.minConcurrency, this.desiredConcurrency - step);
        log.debug('AutoscaledPool: scaling down', {
            oldConcurrency: this.desiredConcurrency + step,
            newConcurrency: this.desiredConcurrency,
        });
    }

    async _maybeFinish() {
        if (this.queryingIsFinished) return;
        if (this.runningCount > 0) return;

        this.queryingIsFinished = true;
        try {
            const isFinished = await this.isFinishedFunction();
            if (isFinished && this.resolve) this.resolve();
        } catch (err) {
            log.exception(err, 'AutoscaledPool: isFinishedFunction failed');
        } finally {
            this.queryingIsFinished = false;
        }
    }

    async _destroy() {
        this.resolve = null;
        this.reject = null;

        betterClearInterval(this.autoscaleInterval);
        betterClearInterval(this.maybeRunInterval);
        if (this.snapshotter) await this.snapshotter.stop();
    }
}
