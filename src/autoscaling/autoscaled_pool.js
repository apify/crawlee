import _ from 'underscore';
import { betterSetInterval, betterClearInterval } from 'apify-shared/utilities';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import Snapshotter from './snapshotter';
import SystemStatus from './system_status';

const DEFAULT_OPTIONS = {
    maxConcurrency: 1000,
    minConcurrency: 1,
    desiredConcurrencyRatio: 0.90,
    scaleUpStepRatio: 0.05,
    scaleDownStepRatio: 0.05,
    maybeRunIntervalSecs: 0.5,
    loggingIntervalSecs: 60,
    autoscaleIntervalSecs: 10,
};

/**
 * Manages a pool of asynchronous resource-intensive tasks that are executed in parallel.
 * The pool only starts new tasks if there is enough free CPU and memory available
 * and the Javascript event loop is not blocked.
 *
 * The information about the CPU and memory usage is obtained by the `Snapshotter` class,
 * which makes regular snapshots of system resources that may be either local
 * or from the Apify cloud infrastructure in case the process is running on the Apify platform.
 * Meaningful data gathered from these snapshots is provided to `AutoscaledPool` by the `SystemStatus` class.
 *
 * Before running the pool, you need to implement the following three functions:
 * {@link AutoscaledPool#runTaskFunction|`runTaskFunction()`},
 * {@link AutoscaledPool#isTaskReadyFunction|`isTaskReadyFunction()`} and
 * {@link AutoscaledPool#isFinishedFunction|`isFinishedFunction()`}.
 *
 * The auto-scaled pool is started by calling the {@link AutoscaledPool#run|`run()`} function.
 * The pool periodically queries the `isTaskReadyFunction()` function
 * for more tasks, managing optimal concurrency, until the function resolves to `false`. The pool then queries
 * the `isFinishedFunction()`. If it resolves to `true`, the run finishes. If it resolves to `false`, it assumes
 * there will be more tasks available later and keeps querying for tasks, until finally both the
 * `isTaskReadyFunction()` and `isFinishedFunction()` functions resolve to `true`. If any of the tasks throws
 * then the `run()` function rejects the promise with an error.
 *
 * The pool evaluates whether it should start a new task every time one of the tasks finishes
 * and also in the interval set by the `options.maybeRunIntervalSecs` parameter.
 *
 * **Example usage:**
 *
 * ```javascript
 * const pool = new Apify.AutoscaledPool({
 *     maxConcurrency: 50,
 *     runTaskFunction: async () => {
 *         // Run some resource-intensive asynchronous operation here.
 *     },
 *     isTaskReadyFunction: async () => {
 *         // Tell the pool whether more tasks are ready to be processed.
 *         // Return true or false
 *     },
 *     isFinishedFunction: async () => {
 *         // Tell the pool whether it should finish
 *         // or wait for more tasks to become available.
 *         // Return true or false
 *     }
 * });
 *
 * await pool.run();
 * ```
 *
 * @param {Object} options
 * @param {Function} options.runTaskFunction
 *   A function that performs an asynchronous resource-intensive task.
 *   The function must either be labeled `async` or return a promise.
 *
 * @param {Function} options.isTaskReadyFunction
 *   A function that indicates whether `runTaskFunction` should be called.
 *   This function is called every time there is free capacity for a new task and it should
 *   indicate whether it should start or not by resolving to either `true` or `false.
 *   Besides its obvious use, it is also useful for task throttling to save resources.
 *
 * @param {Function} options.isFinishedFunction
 *   A function that is called only when there are no tasks to be processed.
 *   If it resolves to `true` then the pool's run finishes. Being called only
 *   when there are no tasks being processed means that as long as `isTaskReadyFunction()`
 *   keeps resolving to `true`, `isFinishedFunction()` will never be called.
 *   To abort a run, use the `pool.abort()` method.
 *
 * @param {Number} [options.minConcurrency=1]
 *   Minimum number of tasks running in parallel.
 * @param {Number} [options.maxConcurrency=1000]
 *   Maximum number of tasks running in parallel.
 * @param {Number} [options.desiredConcurrencyRatio=0.95]
 *   Minimum level of desired concurrency to reach before more scaling up is allowed.
 * @param {Number} [options.scaleUpStepRatio=0.05]
 *   Defines the fractional amount of desired concurrency to be added with each scaling up.
 *   The minimum scaling step is one.
 * @param {Number} [options.scaleDownStepRatio=0.05]
 *   Defines the amount of desired concurrency to be subtracted with each scaling down.
 *   The minimum scaling step is one.
 * @param {Number} [options.maybeRunIntervalSecs=0.5]
 *   Indicates how often the pool should call the `runTaskFunction()` to start a new task, in seconds.
 *   This has no effect on starting new tasks immediately after a task completes.
 * @param {Number} [options.loggingIntervalSecs=60]
 *   Specifies a period in which the instance logs its state, in seconds.
 *   Set to `null` to disable periodic logging.
 * @param {Number} [options.autoscaleIntervalSecs=10]
 *   Defines in seconds how often the pool should attempt to adjust the desired concurrency
 *   based on the latest system status. Setting it lower than 1 might have a severe impact on performance.
 *   We suggest using a value from 5 to 20.
 * @param {Number} [options.snapshotterOptions]
 *   Options to be passed down to the `Snapshotter` constructor. This is useful for fine-tuning
 *   the snapshot intervals and history.
 *   See <a href="https://github.com/apifytech/apify-js/blob/develop/src/autoscaling/snapshotter.js">Snapshotter</a> source code for more details.
 * @param {Number} [options.systemStatusOptions]
 *   Options to be passed down to the `SystemStatus` constructor. This is useful for fine-tuning
 *   the system status reports. If a custom snapshotter is set in the options, it will be used
 *   by the pool.
 *   See <a href="https://github.com/apifytech/apify-js/blob/develop/src/autoscaling/system_status.js">SystemStatus</a> source code for more details.
 */
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

        // Configurable properties.
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

        // Internal properties.
        this.desiredConcurrency = this.minConcurrency;
        this.currentConcurrency = 0;
        this.lastLoggingTime = 0;
        this.resolve = null;
        this.reject = null;
        this._autoscale = this._autoscale.bind(this);
        this._maybeRunTask = this._maybeRunTask.bind(this);

        // Create instances with correct options.
        const ssoCopy = Object.assign({}, systemStatusOptions);
        if (!ssoCopy.snapshotter) ssoCopy.snapshotter = new Snapshotter(snapshotterOptions);
        this.snapshotter = ssoCopy.snapshotter;
        this.systemStatus = new SystemStatus(ssoCopy);
    }

    /**
     * Runs the auto-scaled pool. Returns a promise that gets resolved or rejected once
     * all the tasks are finished or one of them fails.
     *
     * @return {Promise}
     */
    async run() {
        this.poolPromise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });

        await this.snapshotter.start();

        // This interval checks the system status and updates the desired concurrency accordingly.
        this.autoscaleInterval = betterSetInterval(this._autoscale, this.autoscaleIntervalMillis);

        // This is here because if we scale down to let's say 1, then after each promise is finished
        // this._maybeRunTask() doesn't trigger another one. So if that 1 instance gets stuck it results
        // in the actor getting stuck and even after scaling up it never triggers another promise.
        this.maybeRunInterval = betterSetInterval(this._maybeRunTask, this.maybeRunIntervalMillis);

        try {
            await this.poolPromise;
        } finally {
            // If resolve is null, the pool is already destroyed.
            if (this.resolve) await this._destroy();
        }
    }

    /**
     * Aborts the run of the auto-scaled pool, discards all currently running tasks and destroys it.
     *
     * @return {Promise}
     */
    async abort() {
        if (this.resolve) {
            this.resolve();
            await this._destroy();
        }
    }

    /**
     * Starts a new task
     * if the number of running tasks (current concurrency) is lower than desired concurrency
     * and the system is not currently overloaded
     * and this.isTaskReadyFunction() returns true.
     *
     * It doesn't allow multiple concurrent runs of this method.
     *
     * @ignore
     */
    async _maybeRunTask(intervalCallback) {
        // Check if the function was invoked by the maybeRunInterval and use an empty function if not.
        const done = intervalCallback || (() => {});

        // Prevent starting a new task if:
        // - we are already querying for a task.
        if (this.queryingIsTaskReady) return done();
        // - we would exceed desired concurrency.
        if (this.currentConcurrency >= this.desiredConcurrency) return done();
        // - system is overloaded now and we are at or above minConcurrency
        const currentStatus = this.systemStatus.getCurrentStatus();
        const { isSystemIdle } = currentStatus;
        if (!isSystemIdle && this.currentConcurrency >= this.minConcurrency) {
            log.debug('AutoscaledPool: Task will not be run. System is overloaded.', currentStatus);
            return done();
        }
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

        try {
            // Everything's fine. Run task.
            this.currentConcurrency++;
            // Try to run next task to build up concurrency,
            // but defer it so it doesn't create a cycle.
            setImmediate(this._maybeRunTask);

            // We need to restart interval here, so that it doesn't get blocked by a stalled task.
            done();

            // Execute the current task.
            await this.runTaskFunction();
            this.currentConcurrency--;
            // Run task after the previous one finished.
            setImmediate(this._maybeRunTask);
        } catch (err) {
            // We might have already rejected this promise.
            if (this.reject) {
                this.reject(err);
                // No need to log all concurrent errors.
                log.exception(err, 'AutoscaledPool: runTaskFunction failed');
            }
        }
    }

    /**
     * Gets called every autoScaleIntervalSecs and evaluates the current system status.
     * If the system IS NOT overloaded and the settings allow it, it scales up.
     * If the system IS overloaded and the settings allow it, it scales down.
     *
     * @ignore
     */
    _autoscale(intervalCallback) {
        // Only scale up if:
        // - system has not been overloaded lately.
        const systemStatus = this.systemStatus.getHistoricalStatus();
        const { isSystemIdle } = systemStatus;
        // - we're not already at max concurrency.
        const weAreNotAtMax = this.desiredConcurrency < this.maxConcurrency;
        // - current concurrency reaches at least the given ratio of desired concurrency.
        const minCurrentConcurrency = Math.floor(this.desiredConcurrency * this.desiredConcurrencyRatio);
        const weAreReachingDesiredConcurrency = this.currentConcurrency >= minCurrentConcurrency;

        if (isSystemIdle && weAreNotAtMax && weAreReachingDesiredConcurrency) this._scaleUp(systemStatus);

        // Always scale down if:
        // - the system has been overloaded lately.
        const isSystemOverloaded = !isSystemIdle;
        // - we're over min concurrency.
        const weAreNotAtMin = this.desiredConcurrency > this.minConcurrency;

        if (isSystemOverloaded && weAreNotAtMin) this._scaleDown(systemStatus);

        // On periodic intervals, print comprehensive log information
        if (this.loggingIntervalMillis > 0) {
            const now = Date.now();
            if (now > this.lastLoggingTime + this.loggingIntervalMillis) {
                this.lastLoggingTime = now;
                log.info('AutoscaledPool state', {
                    currentConcurrency: this.currentConcurrency,
                    desiredConcurrency: this.desiredConcurrency,
                    systemStatus,
                });
            }
        }

        // Start a new interval cycle.
        intervalCallback();
    }

    /**
     * Scales the pool up by increasing
     * the desired concurrency by the scaleUpStepRatio.
     *
     * @param {Object} systemStatus for logging
     * @ignore
     */
    _scaleUp(systemStatus) {
        const step = Math.ceil(this.desiredConcurrency * this.scaleUpStepRatio);
        this.desiredConcurrency = Math.min(this.maxConcurrency, this.desiredConcurrency + step);
        log.debug('AutoscaledPool: scaling up', {
            oldConcurrency: this.desiredConcurrency - step,
            newConcurrency: this.desiredConcurrency,
            systemStatus,
        });
    }

    /**
     * Scales the pool down by decreasing
     * the desired concurrency by the scaleDownStepRatio.
     *
     * @param {Object} systemStatus for logging
     * @ignore
     */
    _scaleDown(systemStatus) {
        const step = Math.ceil(this.desiredConcurrency * this.scaleUpStepRatio);
        this.desiredConcurrency = Math.max(this.minConcurrency, this.desiredConcurrency - step);
        log.debug('AutoscaledPool: scaling down', {
            oldConcurrency: this.desiredConcurrency + step,
            newConcurrency: this.desiredConcurrency,
            systemStatus,
        });
    }

    /**
     * If there are no running tasks and this.isFinishedFunction() returns true then closes
     * the pool and resolves the pool's promise returned by the run() method.
     *
     * It doesn't allow multiple concurrent runs of this method.
     *
     * @ignore
     */
    async _maybeFinish() {
        if (this.queryingIsFinished) return;
        if (this.currentConcurrency > 0) return;

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

    /**
     * Cleans up resources.
     *
     * @ignore
     */
    async _destroy() {
        this.resolve = null;
        this.reject = null;

        betterClearInterval(this.autoscaleInterval);
        betterClearInterval(this.maybeRunInterval);
        if (this.snapshotter) await this.snapshotter.stop();
    }
}
