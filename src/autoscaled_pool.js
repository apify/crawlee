import Promise from 'bluebird';
import log from 'apify-shared/log';
import _ from 'underscore';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { getMemoryInfo, isPromise, avg, isAtHome } from './utils';
import events from './events';
import { ACTOR_EVENT_NAMES } from './constants';

// NOTE: If this is too low, getMemoryInfo() has so much overheads that it chokes the system
const AUTOSCALE_INTERVAL_MILLIS = 1000;
const MIN_FREE_MEMORY_RATIO = 0.1; // Minimum amount of memory that we keep free.
const DEFAULT_OPTIONS = {
    maxConcurrency: 1000,
    minConcurrency: 1,
    minFreeMemoryRatio: 0.2,
    maybeRunIntervalMillis: 500,
    finishWhenEmpty: true,
    ignoreMainProcess: false,
    loggingIntervalMillis: 60000,
};

// These constants defines that in Nth execution of autoscaleInterval we do:
export const SCALE_UP_INTERVAL = 10;
export const SCALE_UP_MAX_STEP = 10;
export const SCALE_DOWN_INTERVAL = 1;

/**
 * Helper function that coverts bytes into human readable MBs.
 *
 * @ignore
 */
const humanReadable = bytes => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * Manages a pool of asynchronous resource-intensive tasks that are executed in parallel.
 * The pool only starts new tasks if there is enough free CPU and memory available.
 * The information about the CPU and memory usage is obtained
 * either from the local system or from the Apify cloud infrastructure in case the process
 * is running on the Apify platform.
 *
 * The auto-scaled pool is started by calling the `run()` function
 * and it finishes when the last running task gets resolved and the next call to
 * the function passed via `isFinishedFunction` resolves to `false`.
 * If any of the tasks throws then the `run()` function also throws.
 *
 * The pool evaluates whether is should start a new task every time some of the tasks is finished
 * and also in the interval set by the `options.maybeRunIntervalMillis` parameter.
 *
 * Basic usage of `AutoscaledPool`:
 *
 * ```javascript
 * const pool = new Apify.AutoscaledPool({
 *     maxConcurrency: 50,
 *     runTaskFunction: () => {
 *         // Run some resource-intensive asynchronous operation here and return a promise...
 *     },
 * });
 *
 * await pool.run();
 * ```
 *
 * @param {Object} options
 * @param {Function} [options.runTaskFunction]
 *   A function that performs an asynchronous resource-intensive task.
 *   The function must either return a promise or `null` if no task is currently available.
 * @param {Function} [options.isFinishedFunction]
 *   A function that is called every time there are no tasks being processed.
 *   If it resolves to `true` then the pool's run finishes.
 *   If `isFinishedFunction` is not provided then the pool
 *   is finished whenever there are no running tasks.
 * @param {Function} [options.isTaskReadyFunction]
 *   A function that indicates if `runTaskFunction` should be called.
 *   By default, this function is called every time there is a free capacity for new task.
 *   But by overriding this you can throttle
 *   number of calls to `runTaskFunction` or to prevent calls to `runTaskFunction` when you know
 *   that it would return null.
 * @param {Number} [options.minConcurrency=1]
 *   Minimum number of tasks running in parallel.
 * @param {Number} [options.maxConcurrency=1000]
 *   Maximum number of tasks running in parallel.
 * @param {Number} [options.maxMemoryMbytes]
 *   Maximum memory available in the system. By default the pool
 *   uses the `totalMemory` value provided by `Apify.getMemoryInfo()`.
 * @param {Number} [options.minFreeMemoryRatio=0.2]
 *   Minimum ratio of free memory kept in the system.
 * @param {Number} [options.maybeRunIntervalMillis=500]
 *   Indicates how often should the pool try to call `opts.runTaskFunction` to start a new task.
 * @param {Boolean} [options.ignoreMainProcess=false]
 *   If set to `true` then the auto-scaling manager does not consider memory consumption
 *   of the main Node.js process when scaling the pool up or down.
 *   This is mainly useful when tasks are running as separate processes (e.g. web browsers).
 * @param {Number} [options.loggingIntervalMillis=60000]
 *   Specifies a period in which the instance logs it state, in milliseconds.
 *   Set to `null` to disable periodic logging.
 */
export default class AutoscaledPool {
    constructor(opts) {
        // TODO: remove this when we release v1.0.0
        // For backwards compatibility with opts.workerFunction.
        if (opts.workerFunction) {
            // For backwards compatiblity with opts.finishWhenEmpty and this.finish();
            if (opts.finishWhenEmpty !== undefined) {
                log.warning('AutoscaledPool: Parameter `finishWhenEmpty` is deprecated!!! Use `isFinishedFunction` instead!');
                checkParamOrThrow(opts.finishWhenEmpty, 'opts.finishWhenEmpty', 'Boolean');
                let mayFinish = false;
                opts.isFinishedFunction = () => Promise.resolve(mayFinish);
                this.finish = () => { mayFinish = true; };
            } else {
                opts.isFinishedFunction = () => Promise.resolve(true);
            }

            log.warning('AutoscaledPool: Parameter `workerFunction` is deprecated!!! Use `runTaskFunction` instead!');
            checkParamOrThrow(opts.workerFunction, 'opts.workerFunction', 'Function');
            opts.runTaskFunction = opts.workerFunction;
            opts.isTaskReadyFunction = () => Promise.resolve(true);
        }

        const {
            maxConcurrency,
            minConcurrency,
            maxMemoryMbytes,
            minFreeMemoryRatio,
            maybeRunIntervalMillis,
            runTaskFunction,
            isFinishedFunction,
            isTaskReadyFunction,
            ignoreMainProcess,
            loggingIntervalMillis,
        } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(maxConcurrency, 'opts.maxConcurrency', 'Number');
        checkParamOrThrow(minConcurrency, 'opts.minConcurrency', 'Number');
        checkParamOrThrow(maxMemoryMbytes, 'opts.maxMemoryMbytes', 'Maybe Number');
        checkParamOrThrow(minFreeMemoryRatio, 'opts.minFreeMemoryRatio', 'Number');
        checkParamOrThrow(maybeRunIntervalMillis, 'opts.maybeRunIntervalMillis', 'Number');
        checkParamOrThrow(runTaskFunction, 'opts.runTaskFunction', 'Function');
        checkParamOrThrow(isFinishedFunction, 'opts.isFinishedFunction', 'Maybe Function');
        checkParamOrThrow(isTaskReadyFunction, 'opts.isTaskReadyFunction', 'Maybe Function');
        checkParamOrThrow(ignoreMainProcess, 'opts.ignoreMainProcess', 'Boolean');
        checkParamOrThrow(loggingIntervalMillis, 'opts.loggingIntervalMillis', 'Maybe Number');

        // Configuration.
        this.maxMemoryMbytes = maxMemoryMbytes;
        this.maxConcurrency = maxConcurrency;
        this.minConcurrency = Math.min(minConcurrency, maxConcurrency);
        this.minFreeMemoryRatio = minFreeMemoryRatio;
        this.maybeRunIntervalMillis = maybeRunIntervalMillis;
        this.runTaskFunction = runTaskFunction;
        this.isFinishedFunction = isFinishedFunction;
        this.isTaskReadyFunction = isTaskReadyFunction;
        this.ignoreMainProcess = ignoreMainProcess;
        this.loggingIntervalMillis = loggingIntervalMillis;

        // State.
        this.intervalCounter = 0;
        this.concurrency = minConcurrency;
        this.runningCount = 0;
        this.freeBytesSnapshots = [];
        this.isCpuOverloadedSnapshots = [false];
        this.queryingIsTaskReady = false;
        this.queryingIsFinished = false;
        this.lastLoggingTime = 0;

        // Intervals.
        this.autoscaleInterval = null;
        this.maybeRunTaskInterval = null;

        // This is resolve function of Promise returned by this.run()
        // which gets resolved once everything is done.
        this.poolPromise = null;
        this.resolve = null;
        this.reject = null;

        // Connect to actor events for CPU info.
        // TODO: This doesn't work on local machine! use blocked() both locally and on server!!!!
        // CPU is overloaded if either blocked() or the CPU_INFO event says so
        // the CPU status sampling should be in regular intervals (e.g. once per second),
        // otherwise the auto-scaled pool cannot know what the data means
        this.cpuInfoListener = (data) => {
            this.isCpuOverloadedSnapshots = this.isCpuOverloadedSnapshots
                .concat(data.isCpuOverloaded)
                .slice(-SCALE_DOWN_INTERVAL);
        };
        events.on(ACTOR_EVENT_NAMES.CPU_INFO, this.cpuInfoListener);
    }

    /**
     * Runs the auto-scaled pool. Returns promise that gets resolved or rejected once
     * all the task got finished or some of them fails.
     *
     * @return {Promise}
     */
    run() {
        this.poolPromise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });

        this._maybeRunTask();

        // This is here because if we scale down to let's say 1, then after each promise is finished
        // this._maybeRunTask() doesn't trigger another one. So if that 1 instance gets stuck it results
        // in whole actor to get stuck and even after scaling up it never triggers another promise.
        this.maybeRunTaskInterval = setInterval(() => this._maybeRunTask(), this.maybeRunIntervalMillis);

        // This interval checks memory and in each call saves current memory stats and in every
        // SCALE_UP_INTERVAL-th/SCALE_DOWN_INTERVAL-th call it may scale up/down based on memory.
        if (isAtHome()) {
            this.autoscaleInterval = setInterval(() => this._autoscale(), AUTOSCALE_INTERVAL_MILLIS);
        } else {
            log.warning('Auto-scaling is currently available only when running on Apify platform! '
                + 'Use `minConcurrency` parameter if you need to test multiple requests in parallel. '
                + 'This feature will be enabled soon.');
        }

        return this.poolPromise
            .then(() => {
                this._destroy();
            })
            .catch((err) => {
                this._destroy();

                throw err;
            });
    }

    /**
     * Stops the auto-scaled pool, discards all currently running tasks and destroys it.
     *
     * @return {Promise}
     */
    async abort() {
        if (this.resolve) this.resolve();
        // _destroy gets called 10 lines above so no need to do it here
    }

    /**
     * Gets called every AUTOSCALE_INTERVAL_MILLIS and saves number of free bytes in this.freeBytesSnapshots.
     *
     * Every:
     * - SCALE_DOWN_INTERVAL-th call checks memory and possibly scales DOWN by 1.
     * - SCALE_UP_INTERVAL-th call checks memory and possibly scales UP
     * - MEM_INFO_INTERVAL-th call logs statistics about memory.
     *
     * NOTE: Parameter this.ignoreMainProcess=true solves the situation where for example we have 3GB memory,
     *       node process takes 1.5GB and Chrome 500MB so autoscaling things that we 1 concurrency allocates
     *       2/3 of memory and therefore it doesn't scales up.
     *
     *       Ignoring the main process we get total memory decreased to 1.5GB so AutoscaledPool considers that
     *       one Chrome process to be correctly taking that 1/3 of memory.
     *
     * @ignore
     */
    _autoscale() {
        // Returning promise so that we can await it in unit tests.
        return getMemoryInfo()
            .then(({ freeBytes, totalBytes, mainProcessBytes }) => {
                if (this.ignoreMainProcess) totalBytes -= mainProcessBytes;
                if (this.maxMemoryMbytes) totalBytes = Math.min(totalBytes, this.maxMemoryMbytes);

                this.intervalCounter++;
                this.freeBytesSnapshots = this.freeBytesSnapshots.concat(freeBytes).slice(-SCALE_UP_INTERVAL);

                // On periodic intervals, print comprehensive log information
                let logData = null;
                if (this.loggingIntervalMillis > 0) {
                    const now = Date.now();
                    if (now > this.lastLoggingTime + this.loggingIntervalMillis) {
                        this.lastLoggingTime = now;
                        logData = {
                            concurrency: this.concurrency,
                            runningCount: this.runningCount,
                        };
                    }
                }

                const scaledDown = this._maybeScaleDown(totalBytes, logData);
                if (!scaledDown) this._maybeScaleUp(totalBytes, logData);

                if (logData) {
                    log.info('AutoscaledPool state', logData);
                }
            })
            .catch(err => log.exception(err, 'AutoscaledPool._autoscale() function failed'));
    }

    /**
     * Scales pool down if there is enough memory and CPU.
     *
     * @return true if concurrency was changed
     * @ignore
     */
    _maybeScaleDown(totalBytes, logData) {
        const snapshots = this.freeBytesSnapshots.slice(-SCALE_DOWN_INTERVAL);
        const averageFreeBytes = avg(snapshots);
        const isMemoryOverloaded = averageFreeBytes / totalBytes < this.minFreeMemoryRatio;
        const isCpuOverloaded = _.all(this.isCpuOverloadedSnapshots);

        // Update logData even if not scaling down
        if (logData) {
            Object.assign(logData, {
                concurrency: this.concurrency,
                isMemoryOverloaded,
                isCpuOverloaded,
            });
        }

        if (this.intervalCounter % SCALE_DOWN_INTERVAL !== 0
            || this.concurrency <= this.minConcurrency
            || (!isCpuOverloaded && !isMemoryOverloaded)) return false;

        this.concurrency--;
        log.debug('AutoscaledPool: scaling down', {
            oldConcurrency: this.concurrency + 1,
            newConcurrency: this.concurrency,
            isMemoryOverloaded,
            isCpuOverloaded,
        });

        return true;
    }

    /**
     * Scales pool up if there is enough memory and CPU.
     *
     * @return true if concurrency was changed
     * @ignore
     */
    _maybeScaleUp(totalBytes, logData) {
        // Update logData even if not scaling down
        const spaceForInstances = this._computeSpaceForInstances(totalBytes, logData);

        if (this.intervalCounter % SCALE_UP_INTERVAL !== 0
            || this.concurrency >= this.maxConcurrency
            || spaceForInstances <= 0) return false;

        const increaseBy = Math.min(spaceForInstances, SCALE_UP_MAX_STEP);
        const oldConcurrency = this.concurrency;

        this.concurrency = Math.min(this.concurrency + increaseBy, this.maxConcurrency);
        log.debug('AutoscaledPool: scaling up', {
            oldConcurrency,
            newConcurrency: this.concurrency,
        });

        return true;
    }

    /**
     * Gets memory info and computes how much we can scale pool
     * to avoid exceeding the maximum memory.
     *
     * If shouldLogInfo = true then also logs info about memory usage.
     *
     * @ignore
     */
    _computeSpaceForInstances(totalBytes, logData) {
        const minFreeBytes = Math.min(...this.freeBytesSnapshots);
        const minFreeRatio = minFreeBytes / totalBytes;
        const maxTakenBytes = totalBytes - minFreeBytes;
        const perInstanceRatio = (maxTakenBytes / totalBytes) / this.runningCount;
        const hasSpaceForInstances = Math.floor((minFreeRatio - MIN_FREE_MEMORY_RATIO) / perInstanceRatio);

        if (logData) {
            Object.assign(logData, {
                freeBytesSnapshots: humanReadable(_.last(this.freeBytesSnapshots)),
                totalBytes: humanReadable(totalBytes),
                minFreeBytes: humanReadable(minFreeBytes),
                minFreePerc: minFreeRatio,
                maxTakenBytes: humanReadable(maxTakenBytes),
                perInstancePerc: perInstanceRatio,
                hasSpaceForInstances,
            });
        }

        return hasSpaceForInstances;
    }
    /**
     * If number of running task is lower than allowed concurrency and this.isTaskReadyFunction()
     * returns true then starts a new task.
     *
     * It doesn't allow multiple concurrent runs of this method.
     *
     * @ignore
     */
    _maybeRunTask(recursion = 0) {
        if (recursion >= this.concurrency) return;
        if (this.runningCount >= this.concurrency) return;
        if (this.queryingIsTaskReady) return;

        this.queryingIsTaskReady = true;

        const isTaskReadyPromise = this.isTaskReadyFunction
            ? this.isTaskReadyFunction()
            : Promise.resolve(true);

        // It's not null so it must be a promise!
        if (!isPromise(isTaskReadyPromise)) throw new Error('User provided isTaskReadyFunction must return a Promise.');

        // We don't want to chain this so don't return here!
        isTaskReadyPromise
            .catch((err) => {
                this.queryingIsTaskReady = false;
                log.exception(err, 'AutoscaledPool: isTaskReadyFunction failed');
            })
            .then((isTaskReady) => {
                this.queryingIsTaskReady = false;

                if (!isTaskReady) return this._maybeFinish();

                const taskPromise = this.runTaskFunction();

                // We are not done but don't want to execute new promise at this point.
                // This may happen when there are less pages in the queue than max concurrency
                // but all of them are being served already.
                if (!taskPromise) return this._maybeFinish();

                // It's not null so it must be a promise!
                if (!isPromise(taskPromise)) throw new Error('User provided runTaskFunction must return a Promise.');

                this.runningCount++;
                this._maybeRunTask(recursion + 1);

                return taskPromise
                    .then(() => {
                        this.runningCount--;
                        this._maybeRunTask();
                    });
            })
            .catch((err) => {
                log.exception(err, 'AutoscaledPool: runTaskFunction failed');
                this.runningCount--;
                // This is here because we might have already rejected this promise.
                if (this.reject) this.reject(err);
            });
    }

    /**
     * If there is no running task and this.isFinishedFunction() returns true then closes
     * the pool and resolves the pool dependency..
     *
     * It doesn't allow multiple concurrent runs of this method.
     *
     * @ignore
     */
    _maybeFinish() {
        if (this.queryingIsFinished) return;
        if (this.runningCount > 0) return;
        if (!this.isFinishedFunction) return this.resolve();

        this.queryingIsFinished = true;

        return this
            .isFinishedFunction()
            .then((isFinished) => {
                this.queryingIsFinished = false;

                if (!isFinished) return;
                if (this.resolve) this.resolve();
            })
            .catch((err) => {
                this.queryingIsFinished = false;
                log.exception(err, 'AutoscaledPool: isFinishedFunction failed');
            });
    }

    /**
     * Cleanups resources.
     *
     * @ignore
     */
    _destroy() {
        this.resolve = null;
        this.reject = null;

        events.removeListener(ACTOR_EVENT_NAMES.CPU_INFO, this.cpuInfoListener);

        clearInterval(this.autoscaleInterval);
        clearInterval(this.maybeRunTaskInterval);
    }
}
