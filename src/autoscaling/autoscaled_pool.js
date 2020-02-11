import _ from 'underscore';
import { betterSetInterval, betterClearInterval } from 'apify-shared/utilities';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import Snapshotter, { SnapshotterOptions } from './snapshotter'; // eslint-disable-line import/named,no-unused-vars
import SystemStatus, { SystemStatusOptions } from './system_status'; // eslint-disable-line import/named,no-unused-vars

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
 * @typedef {Object} AutoscaledPoolOptions
 * @property {Function} runTaskFunction
 *   A function that performs an asynchronous resource-intensive task.
 *   The function must either be labeled `async` or return a promise.
 *
 * @property {Function} isTaskReadyFunction
 *   A function that indicates whether `runTaskFunction` should be called.
 *   This function is called every time there is free capacity for a new task and it should
 *   indicate whether it should start a new task or not by resolving to either `true` or `false`.
 *   Besides its obvious use, it is also useful for task throttling to save resources.
 *
 * @property {Function} isFinishedFunction
 *   A function that is called only when there are no tasks to be processed.
 *   If it resolves to `true` then the pool's run finishes. Being called only
 *   when there are no tasks being processed means that as long as `isTaskReadyFunction()`
 *   keeps resolving to `true`, `isFinishedFunction()` will never be called.
 *   To abort a run, use the [`abort()`](#AutoscaledPool+abort) method.
 *
 * @property {Number} [minConcurrency=1]
 *   The minimum number of tasks running in parallel.
 *
 *   *WARNING:* If you set this value too high with respect to the available system memory and CPU, your code might run extremely slow or crash.
 *   If you're not sure, just keep the default value and the concurrency will scale up automatically.
 * @property {Number} [maxConcurrency=1000]
 *   The maximum number of tasks running in parallel.
 * @property {Number} [desiredConcurrency]
 *   The desired number of tasks that should be running parallel on the start of the pool,
 *   if there is a large enough supply of them.
 *   By default, it is `minConcurrency`.
 * @property {Number} [desiredConcurrencyRatio=0.95]
 *   Minimum level of desired concurrency to reach before more scaling up is allowed.
 * @property {Number} [scaleUpStepRatio=0.05]
 *   Defines the fractional amount of desired concurrency to be added with each scaling up.
 *   The minimum scaling step is one.
 * @property {Number} [scaleDownStepRatio=0.05]
 *   Defines the amount of desired concurrency to be subtracted with each scaling down.
 *   The minimum scaling step is one.
 * @property {Number} [maybeRunIntervalSecs=0.5]
 *   Indicates how often the pool should call the `runTaskFunction()` to start a new task, in seconds.
 *   This has no effect on starting new tasks immediately after a task completes.
 * @property {Number} [loggingIntervalSecs=60]
 *   Specifies a period in which the instance logs its state, in seconds.
 *   Set to `null` to disable periodic logging.
 * @property {Number} [autoscaleIntervalSecs=10]
 *   Defines in seconds how often the pool should attempt to adjust the desired concurrency
 *   based on the latest system status. Setting it lower than 1 might have a severe impact on performance.
 *   We suggest using a value from 5 to 20.
 * @property {SnapshotterOptions} [snapshotterOptions]
 *   Options to be passed down to the {@link Snapshotter} constructor. This is useful for fine-tuning
 *   the snapshot intervals and history.
 * @property {SystemStatusOptions} [systemStatusOptions]
 *   Options to be passed down to the {@link SystemStatus} constructor. This is useful for fine-tuning
 *   the system status reports. If a custom snapshotter is set in the options, it will be used
 *   by the pool.
 */

/**
 * Manages a pool of asynchronous resource-intensive tasks that are executed in parallel.
 * The pool only starts new tasks if there is enough free CPU and memory available
 * and the Javascript event loop is not blocked.
 *
 * The information about the CPU and memory usage is obtained by the {@link Snapshotter} class,
 * which makes regular snapshots of system resources that may be either local
 * or from the Apify cloud infrastructure in case the process is running on the Apify platform.
 * Meaningful data gathered from these snapshots is provided to `AutoscaledPool` by the {@link SystemStatus} class.
 *
 * Before running the pool, you need to implement the following three functions:
 * [`runTaskFunction()`](#new_AutoscaledPool_new),
 * [`isTaskReadyFunction()`](#new_AutoscaledPool_new) and
 * [`isFinishedFunction()`](#new_AutoscaledPool_new).
 *
 * The auto-scaled pool is started by calling the [`run()`](#AutoscaledPool+run) function.
 * The pool periodically queries the [`isTaskReadyFunction()`](#new_AutoscaledPool_new) function
 * for more tasks, managing optimal concurrency, until the function resolves to `false`. The pool then queries
 * the [`isFinishedFunction()`](#new_AutoscaledPool_new). If it resolves to `true`, the run finishes after all running tasks complete.
 * If it resolves to `false`, it assumes there will be more tasks available later and keeps periodically querying for tasks.
 * If any of the tasks throws then the [`run()`](#AutoscaledPool+run) function rejects the promise with an error.
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
 */
class AutoscaledPool {
    /**
     * @param {AutoscaledPoolOptions} options All `AutoscaledPool` configuration options.
     */
    constructor(options = {}) {
        const {
            maxConcurrency,
            minConcurrency,
            desiredConcurrency,
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
        } = _.defaults({}, options, DEFAULT_OPTIONS);

        checkParamOrThrow(maxConcurrency, 'options.maxConcurrency', 'Number');
        checkParamOrThrow(minConcurrency, 'options.minConcurrency', 'Number');
        checkParamOrThrow(desiredConcurrency, 'options.desiredConcurrency', 'Maybe Number');
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
        this._minConcurrency = minConcurrency;
        this._maxConcurrency = maxConcurrency;
        this._desiredConcurrency = typeof desiredConcurrency === 'number' ? desiredConcurrency : minConcurrency;
        this._currentConcurrency = 0;
        this.isStopped = false;
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
     * @ignore
     */
    setMaxConcurrency(maxConcurrency) {
        log.deprecated('AutoscaledPool.setMaxConcurrency() is deprecated, use the "maxConcurrency" property instead');
        this._maxConcurrency = maxConcurrency;
    }

    /**
     * @ignore
     */
    setMinConcurrency(minConcurrency) {
        log.deprecated('AutoscaledPool.setMaxConcurrency() is deprecated, use the "maxConcurrency" property instead');
        this._minConcurrency = minConcurrency;
    }


    /**
     * Gets the minimum number of tasks running in parallel.
     *
     * @return {number}
     */
    get minConcurrency() {
        return this._minConcurrency;
    }

    /**
     * Sets the minimum number of tasks running in parallel.
     *
     * *WARNING:* If you set this value too high with respect to the available system memory and CPU, your code might run extremely slow or crash.
     * If you're not sure, just keep the default value and the concurrency will scale up automatically.
     *
     * @param {number} value
     */
    set minConcurrency(value) {
        checkParamOrThrow(value, 'value', 'Number');
        this._minConcurrency = value;
    }

    /**
     * Gets the maximum number of tasks running in parallel.
     *
     * @return {number}
     */
    get maxConcurrency() {
        return this._maxConcurrency;
    }

    /**
     * Sets the maximum number of tasks running in parallel.
     *
     * @param {number} value
     */
    set maxConcurrency(value) {
        checkParamOrThrow(value, 'value', 'Number');
        this._maxConcurrency = value;
    }

    /**
     * Gets the desired concurrency for the pool,
     * which is an estimated number of parallel tasks that the system can currently support.
     *
     * @return {number}
     */
    get desiredConcurrency() {
        return this._desiredConcurrency;
    }

    /**
     * Sets the desired concurrency for the pool, i.e. the number of tasks that should be running
     * in parallel if there's large enough supply of tasks.
     *
     * @param {number} value
     */
    set desiredConcurrency(value) {
        checkParamOrThrow(value, 'value', 'Number');
        this._desiredConcurrency = value;
    }

    /**
     * Gets the the number of parallel tasks currently running in the pool.
     *
     * @return {number}
     */
    get currentConcurrency() {
        return this._currentConcurrency;
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
     * Aborts the run of the auto-scaled pool and destroys it. The promise returned from
     * the [`run()`](#AutoscaledPool+run) function will immediately resolve, no more new tasks
     * will be spawned and all running tasks will be left in their current state.
     *
     * Due to the nature of the tasks, auto-scaled pool cannot reliably guarantee abortion
     * of all the running tasks, therefore, no abortion is attempted and some of the tasks
     * may finish, while others may not. Essentially, auto-scaled pool doesn't care about
     * their state after the invocation of `.abort()`, but that does not mean that some
     * parts of their asynchronous chains of commands will not execute.
     *
     * @return {Promise}
     */
    async abort() {
        this.isStopped = true;
        if (this.resolve) {
            this.resolve();
            await this._destroy();
        }
    }

    /**
     * Prevents the auto-scaled pool from starting new tasks, but allows the running ones to finish
     * (unlike abort, which terminates them). Used together with [`resume()`](#AutoscaledPool+resume)
     *
     * The function's promise will resolve once all running tasks have completed and the pool
     * is effectively idle. If the `timeoutSecs` argument is provided, the promise will reject
     * with a timeout error after the `timeoutSecs` seconds.
     *
     * The promise returned from the [`run()`](#AutoscaledPool+run) function will not resolve
     * when `.pause()` is invoked (unlike abort, which resolves it).
     *
     * @param {number} [timeoutSecs]
     * @return {Promise}
     */
    async pause(timeoutSecs) {
        if (this.isStopped) return;
        this.isStopped = true;
        return new Promise((resolve, reject) => {
            let timeout;
            if (timeoutSecs) {
                timeout = setTimeout(() => {
                    const err = new Error('AutoscaledPool: The pool\'s running tasks did not finish'
                        + `in ${timeoutSecs} secs after pool.pause() invocation.`);
                    reject(err);
                }, timeoutSecs);
            }

            const interval = setInterval(() => {
                if (this._currentConcurrency <= 0) {
                    // Clean up timeout and interval to prevent process hanging.
                    if (timeout) clearTimeout(timeout);
                    clearInterval(interval);
                    resolve();
                }
            }, this.maybeRunIntervalMillis);
        });
    }

    /**
     * Resumes the operation of the autoscaled-pool by allowing more tasks to be run.
     * Used together with [`pause()`](#AutoscaledPool+pause)
     *
     * Tasks will automatically start running again in `options.maybeRunIntervalSecs`.
     */
    resume() {
        this.isStopped = false;
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
        // - the pool is paused or aborted
        if (this.isStopped) return done();
        // - we are already querying for a task.
        if (this.queryingIsTaskReady) return done();
        // - we would exceed desired concurrency.
        if (this._currentConcurrency >= this._desiredConcurrency) return done();
        // - system is overloaded now and we are at or above minConcurrency
        const currentStatus = this.systemStatus.getCurrentStatus();
        const { isSystemIdle } = currentStatus;
        if (!isSystemIdle && this._currentConcurrency >= this._minConcurrency) {
            log.perf('AutoscaledPool: Task will not be run. System is overloaded.', currentStatus);
            return done();
        }
        // - a task is ready.
        this.queryingIsTaskReady = true;
        let isTaskReady;
        try {
            isTaskReady = await this.isTaskReadyFunction();
        } catch (err) {
            // We might have already rejected this promise.
            if (this.reject) {
                // No need to log all concurrent errors.
                log.exception(err, 'AutoscaledPool: isTaskReadyFunction failed');
                this.reject(err);
            }
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
            this._currentConcurrency++;
            // Try to run next task to build up concurrency,
            // but defer it so it doesn't create a cycle.
            setImmediate(this._maybeRunTask);

            // We need to restart interval here, so that it doesn't get blocked by a stalled task.
            done();

            // Execute the current task.
            await this.runTaskFunction();
            this._currentConcurrency--;
            // Run task after the previous one finished.
            setImmediate(this._maybeRunTask);
        } catch (err) {
            // We might have already rejected this promise.
            if (this.reject) {
                // No need to log all concurrent errors.
                log.exception(err, 'AutoscaledPool: runTaskFunction failed.');
                this.reject(err);
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
        // Don't scale if paused.
        if (this.isStopped) return intervalCallback();

        // Only scale up if:
        // - system has not been overloaded lately.
        const systemStatus = this.systemStatus.getHistoricalStatus();
        const { isSystemIdle } = systemStatus;
        // - we're not already at max concurrency.
        const weAreNotAtMax = this._desiredConcurrency < this._maxConcurrency;
        // - current concurrency reaches at least the given ratio of desired concurrency.
        const minCurrentConcurrency = Math.floor(this._desiredConcurrency * this.desiredConcurrencyRatio);
        const weAreReachingDesiredConcurrency = this._currentConcurrency >= minCurrentConcurrency;

        if (isSystemIdle && weAreNotAtMax && weAreReachingDesiredConcurrency) this._scaleUp(systemStatus);

        // Always scale down if:
        // - the system has been overloaded lately.
        const isSystemOverloaded = !isSystemIdle;
        // - we're over min concurrency.
        const weAreNotAtMin = this._desiredConcurrency > this._minConcurrency;

        if (isSystemOverloaded && weAreNotAtMin) this._scaleDown(systemStatus);

        // On periodic intervals, print comprehensive log information
        if (this.loggingIntervalMillis > 0) {
            const now = Date.now();
            if (now > this.lastLoggingTime + this.loggingIntervalMillis) {
                this.lastLoggingTime = now;
                log.info('AutoscaledPool state', {
                    currentConcurrency: this._currentConcurrency,
                    desiredConcurrency: this._desiredConcurrency,
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
        const step = Math.ceil(this._desiredConcurrency * this.scaleUpStepRatio);
        this._desiredConcurrency = Math.min(this._maxConcurrency, this._desiredConcurrency + step);
        log.debug('AutoscaledPool: scaling up', {
            oldConcurrency: this._desiredConcurrency - step,
            newConcurrency: this._desiredConcurrency,
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
        const step = Math.ceil(this._desiredConcurrency * this.scaleUpStepRatio);
        this._desiredConcurrency = Math.max(this._minConcurrency, this._desiredConcurrency - step);
        log.debug('AutoscaledPool: scaling down', {
            oldConcurrency: this._desiredConcurrency + step,
            newConcurrency: this._desiredConcurrency,
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
        if (this._currentConcurrency > 0) return;

        this.queryingIsFinished = true;
        try {
            const isFinished = await this.isFinishedFunction();
            if (isFinished && this.resolve) this.resolve();
        } catch (err) {
            if (this.reject) {
                // No need to log all concurrent errors.
                log.exception(err, 'AutoscaledPool: isFinishedFunction failed.');
                this.reject(err);
            }
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

export default AutoscaledPool;
