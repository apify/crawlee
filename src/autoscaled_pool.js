import Promise from 'bluebird';
import log from 'apify-shared/log';
import _ from 'underscore';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { delayPromise } from 'apify-shared/utilities';
import { getMemoryInfo, isPromise } from './utils';
import { events } from './actor';
import { ACTOR_EVENT_NAMES } from './constants';

// TODO: we should scale down less aggresively - ie. scale down only if CPU or memory
//       gets exceeded for some longer period of time ...

const MEM_CHECK_INTERVAL_MILLIS = 200; // This is low to have at least.
const MIN_FREE_MEMORY_RATIO = 0.1; // Minimum amount of memory that we keep free.
const DEFAULT_OPTIONS = {
    maxConcurrency: 1000,
    minConcurrency: 1,
    minFreeMemoryRatio: 0.2,
    maybeRunIntervalMillis: 500,
    finishWhenEmpty: true,
};

// These constants defines that in Nth execution memCheckInterval we do:
export const SCALE_UP_INTERVAL = 50;
export const SCALE_UP_MAX_STEP = 10;
export const SCALE_DOWN_INTERVAL = 5;
export const LOG_INFO_INTERVAL = 6 * SCALE_UP_INTERVAL; // This must be multiple of SCALE_UP_INTERVAL

/**
 * Helper function that coverts bytes into human readable MBs.
 *
 * @ignore
 */
const humanReadable = bytes => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * AutoscaledPool helps to process asynchronous task in parallel. It scales the number of concurrent tasks based on
 * the available memory and CPU. If any of the tasks throws an error then the pool.run() method
 * also throws.
 *
 * Autoscaled pool gets finished when the last running task gets resolved and following call of `workerFunction`
 * returns null. This behaviour might be changed using `options.finishWhenEmpty` parameter.
 *
 * AutoscaledPool tries to start new tasks everytime some of the tasks gets resolved and also in interval
 * given by parameter `options.maybeRunIntervalMillis`.
 *
 * Basic usage of AutoscaledPool:
 *
 * ```javascript
 * const pool = new Apify.AutoscaledPool({
 *     maxConcurrency: 50,
 *     workerFunction: () => {
 *         // ... do some intensive asynchronous operations here and return a promise ...
 *     },
 * });
 *
 * await pool.run();
 * ```
 *
 * @param {Object} options
 * @param {Function} options.handleTaskFunction Function we want to call in parallel. This function must either return a
 *                                              promise or null when all the tasks were processed.
 * @param {Function} [opts.isFinishedFunction] This function gets called everytime there is a zero number of tasks being processed.
 *                                             If resolves to true then pool gets closed. If `isFinishedFunction` is not provided then pool
 *                                             gets closed at the point that there are no running tasks.
 * @param {Function} [opts.isTaskReadyFunction] This function indicates if `handleTaskFunction` should be called. By default handleTaskFunction
 *                                              is called everytime there is a free spot for new task. But by overriding this you can throttle
 *                                              number of calls to `handleTaskFunction` or to prevent calls to `handleTaskFunction` when you know
 *                                              that it would return null.
 * @param {Number} [options.maxConcurrency=1000] Maximal concurrency.
 * @param {Number} [options.minConcurrency=1] Minimal concurrency.
 * @param {Number} [options.maxMemoryMbytes] Maximum memory available in the system. By default uses the totalMemory from Apify.getMemoryInfo().
 * @param {Number} [options.minFreeMemoryRatio=0.2] Minumum ratio of free memory kept in the system.
 * @param {number} [options.maybeRunIntervalMillis=1000] Determines how often autoscaled pool tried to call `opts.workerFunction` to get a new task.

 */
export default class AutoscaledPool {
    constructor(opts) {
        // TODO: remove this when we release v1.0.0
        // For backwards compatibility with opts.workerFunction.
        if (opts.workerFunction) {
            // For backwards compatiblity with opts.finishWhenEmpty and this.finish();
            if (opts.finishWhenEmpty !== undefined) {
                log.warning('Parameter `finishWhenEmpty` of AutoscaledPool is deprecated!!! Use `isFinishedFunction` instead!');
                checkParamOrThrow(opts.finishWhenEmpty, 'opts.finishWhenEmpty', 'Boolean');
                let mayFinish = false;
                opts.isFinishedFunction = () => Promise.resolve(mayFinish),
                this.finish = () => { mayFinish = true; };
            } else {
                opts.isFinishedFunction = () => Promise.resolve(true);
            }

            log.warning('Parameter `workerFunction` of AutoscaledPool is deprecated!!! Use `handleTaskFunction` instead!');
            checkParamOrThrow(opts.workerFunction, 'opts.workerFunction', 'Function');
            opts.handleTaskFunction = opts.workerFunction;
            opts.isTaskReadyFunction = () => Promise.resolve(true);
        }

        const {
            maxConcurrency,
            minConcurrency,
            maxMemoryMbytes,
            minFreeMemoryRatio,
            maybeRunIntervalMillis,
            handleTaskFunction,
            isFinishedFunction,
            isTaskReadyFunction,
        } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(maxConcurrency, 'opts.maxConcurrency', 'Number');
        checkParamOrThrow(minConcurrency, 'opts.minConcurrency', 'Number');
        checkParamOrThrow(maxMemoryMbytes, 'opts.maxMemoryMbytes', 'Maybe Number');
        checkParamOrThrow(minFreeMemoryRatio, 'opts.minFreeMemoryRatio', 'Number');
        checkParamOrThrow(maybeRunIntervalMillis, 'opts.maybeRunIntervalMillis', 'Number');
        checkParamOrThrow(handleTaskFunction, 'opts.handleTaskFunction', 'Function');
        checkParamOrThrow(isFinishedFunction, 'opts.isFinishedFunction', 'Maybe Function');
        checkParamOrThrow(isTaskReadyFunction, 'opts.isTaskReadyFunction', 'Maybe Function');

        // Configuration.
        this.maxMemoryMbytes = maxMemoryMbytes;
        this.maxConcurrency = maxConcurrency;
        this.minConcurrency = Math.min(minConcurrency, maxConcurrency);
        this.minFreeMemoryRatio = minFreeMemoryRatio;
        this.maybeRunIntervalMillis = maybeRunIntervalMillis;
        this.handleTaskFunction = handleTaskFunction;
        this.isFinishedFunction = isFinishedFunction;
        this.isTaskReadyFunction = isTaskReadyFunction;

        // State.
        this.promiseCounter = 0;
        this.intervalCounter = 0;
        this.concurrency = minConcurrency;
        this.runningCount = 0;
        this.freeBytesSnapshots = [];
        this.isCpuOverloaded = false;
        this.queryingIsTaskReady = false;
        this.queryingIsFinished = false;

        // Intervals.
        this.memCheckInterval = null;
        this.maybeRunTaskInterval = null;

        // This is resolve function of Promise returned by this.run()
        // which gets resolved once everything is done.
        this.poolPromise = null;
        this.resolve = null;
        this.reject = null;

        // Connect to actor events for CPU info.
        this.cpuInfoListener = (data) => {
            this.isCpuOverloaded = data.isCpuOverloaded;
        };
        events.on(ACTOR_EVENT_NAMES.CPU_INFO, this.cpuInfoListener);
    }

    /**
     * Runs the autoscaled pool. Returns promise that gets resolved or rejected once
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

        // This is here because if we scale down to let's say 1. Then after each promise is finished
        // this._maybeRunTask() doesn't trigger another one. So if that 1 instance stucks it results
        // in whole act to stuck and even after scaling up it never triggers another promise.
        this.maybeRunTaskInterval = setInterval(() => this._maybeRunTask(), this.maybeRunIntervalMillis);

        // This interval checks memory and in each call saves current memory stats and in every
        // SCALE_UP_INTERVAL-th/SCALE_DOWN_INTERVAL-th call it may scale up/down based on memory.
        this.memCheckInterval = setInterval(() => this._autoscale(), MEM_CHECK_INTERVAL_MILLIS);

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
     * Gets called every MEM_CHECK_INTERVAL_MILLIS and saves number of free bytes in this.freeBytesSnapshots.
     *
     * Every:
     * - SCALE_DOWN_INTERVAL-th call checks memory and possibly scales DOWN by 1.
     * - SCALE_UP_INTERVAL-th call checks memory and possibly scales UP
     * - MEM_INFO_INTERVAL-th call logs statistics about memory.
     *
     * @ignore
     */
    _autoscale() {
        // Returning promise so that we can await it in unit tests.
        return getMemoryInfo()
            .then(({ freeBytes, totalBytes }) => {
                if (this.maxMemoryMbytes) totalBytes = Math.min(totalBytes, this.maxMemoryMbytes);

                this.intervalCounter++;
                this.freeBytesSnapshots = this.freeBytesSnapshots.concat(freeBytes).slice(-SCALE_UP_INTERVAL);

                // Maybe scale down.
                if (
                    this.intervalCounter % SCALE_DOWN_INTERVAL === 0
                    && this.concurrency > this.minConcurrency
                    && (this.isCpuOverloaded || freeBytes / totalBytes < this.minFreeMemoryRatio)
                ) {
                    this.concurrency--;
                    log.debug('AutoscaledPool: scaling down', { concurrency: this.concurrency });

                // Maybe scale up.
                } else if (
                    this.intervalCounter % SCALE_UP_INTERVAL === 0
                    && this.concurrency < this.maxConcurrency
                ) {
                    const spaceForInstances = this._computeSpaceForInstances(totalBytes, this.intervalCounter % LOG_INFO_INTERVAL);

                    if (spaceForInstances > 0) {
                        const increaseBy = Math.min(spaceForInstances, SCALE_UP_MAX_STEP);
                        const oldConcurrency = this.concurrency;
                        this.concurrency = Math.min(this.concurrency + increaseBy, this.maxConcurrency);
                        log.debug('AutoscaledPool: scaling up', { oldConcurrency, newConcurrency: this.concurrency });
                    }
                }
            })
            .catch(err => log.exception(err, 'AutoscaledPool._autoscale() function failed'));
    }

    /**
     * Gets memory info and computes how much we can scale pool
     * to avoid exceeding the maximum memory.
     *
     * If shouldLogInfo = true then also logs info about memory usage.
     *
     * @ignore
     */
    _computeSpaceForInstances(totalBytes, logInfo) {
        const minFreeBytes = Math.min(...this.freeBytesSnapshots);
        const minFreeRatio = minFreeBytes / totalBytes;
        const maxTakenBytes = totalBytes - minFreeBytes;
        const perInstanceRatio = (maxTakenBytes / totalBytes) / this.runningCount;
        const hasSpaceForInstances = (minFreeRatio - MIN_FREE_MEMORY_RATIO) / perInstanceRatio;

        if (logInfo) {
            log.info('AutoscaledPool: info', {
                concurency: this.concurrency,
                runningCount: this.runningCount,
                freeBytesSnapshots: humanReadable(_.last(this.freeBytesSnapshots)),
                totalBytes: humanReadable(totalBytes),
                minFreeBytes: humanReadable(minFreeBytes),
                minFreePerc: minFreeRatio,
                maxTakenBytes: humanReadable(maxTakenBytes),
                perInstancePerc: perInstanceRatio,
                hasSpaceForInstances,
            });
        }

        return Math.floor(hasSpaceForInstances);
    }
    /**
     * If number of running task is lower than allowed concurrency and this.isTaskReadyFunction()
     * returns true then starts a new task.
     *
     * It doesn't allow multiple concurrent runs of this method.
     *
     * @ignore
     */
    _maybeRunTask() {
        if (this.runningCount >= this.concurrency) return;
        if (this.queryingIsTaskReady) return;

        this.queryingIsTaskReady = true;

        const isTaskReadyPromise = this.isTaskReadyFunction
            ? this.isTaskReadyFunction()
            : Promise.resolve(true);

        // It's not null so it must be a promise!
        if (!isPromise(isTaskReadyPromise)) throw new Error('User provided isTaskReadyFunction must return a Promise.');

        // We don't want to chain this so no return here!
       isTaskReadyPromise
            .catch((err) => {
                this.queryingIsTaskReady = false;
                log.exception(err, 'AutoscaledPool: isTaskReadyFunction failed');
            })
            .then((isTaskReady) => {
                this.queryingIsTaskReady = false;

                if (!isTaskReady) return this._maybeFinish();

                const taskPromise = this.handleTaskFunction();

                // We are not done but don't want to execute new promise at this point.
                // This may happen when there are less pages in the queue than max concurrency
                // but all of them are being served already.
                if (!taskPromise) return this._maybeFinish();

                // It's not null so it must be a promise!
                if (!isPromise(taskPromise)) throw new Error('User provided handleTaskFunction must return a Promise.');

                this.runningCount++;
                this._maybeRunTask();

                const startedAt = Date.now();

                return taskPromise
                    .then(() => {
                        this.runningCount--;
                        this._maybeRunTask();
                    });
            })
            .catch((err) => {
                log.exception(err, 'AutoscaledPool: handleTaskFunction failed');
                this.runningCount--;
                // If is here because we might already rejected this promise.
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

        clearInterval(this.memCheckInterval);
        clearInterval(this.maybeRunTaskInterval);
    }
}
