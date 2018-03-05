import Promise from 'bluebird';
import log from 'apify-shared/log';
import _ from 'underscore';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { getMemoryInfo, isPromise } from './utils';
import { events } from './actor';
import { ACTOR_EVENT_NAMES } from './constants';

const MEM_CHECK_INTERVAL_MILLIS = 200; // This is low to have at least.
const MAYBE_RUN_INTERVAL_MILLIS = 1000;
const MIN_FREE_MEMORY_RATIO = 0.1; // Minimum amount of memory that we keep free.
const DEFAULT_OPTIONS = {
    maxConcurrency: 1000,
    minConcurrency: 1,
    minFreeMemoryRatio: 0.2,
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
 * @param {Function} options.workerFunction Function we want to call in parallel. This function must either return a
 *                                            promise or null when all the tasks were processed.
 * @param {Number} [options.maxConcurrency=1000] Maximal concurrency.
 * @param {Number} [options.minConcurrency=1] Minimal concurrency.
 * @param {Number} [options.maxMemoryMbytes] Maximum memory available in the system. By default uses the totalMemory from Apify.getMemoryInfo().
 * @param {Number} [options.minFreeMemoryRatio=0.2] Minumum ratio of free memory kept in the system.
 */
export default class AutoscaledPool {
    constructor(opts) {
        const { maxMemoryMbytes, maxConcurrency, minConcurrency, workerFunction, minFreeMemoryRatio } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(maxMemoryMbytes, 'opts.maxMemoryMbytes', 'Maybe Number');
        checkParamOrThrow(maxConcurrency, 'opts.maxConcurrency', 'Number');
        checkParamOrThrow(minConcurrency, 'opts.minConcurrency', 'Number');
        checkParamOrThrow(minFreeMemoryRatio, 'opts.minFreeMemoryRatio', 'Number');
        checkParamOrThrow(workerFunction, 'opts.workerFunction', 'Function');

        // Configuration.
        this.maxMemoryMbytes = maxMemoryMbytes;
        this.maxConcurrency = maxConcurrency;
        this.minConcurrency = Math.min(minConcurrency, maxConcurrency);
        this.workerFunction = workerFunction;
        this.minFreeMemoryRatio = minFreeMemoryRatio;

        // State.
        this.promiseCounter = 0;
        this.intervalCounter = 0;
        this.concurrency = minConcurrency;
        this.runningPromises = {};
        this.runningCount = 0;
        this.freeBytesSnapshots = [];
        this.isCpuOverloaded = false;

        // Intervals.
        this.memCheckInterval = null;
        this.maybeRunInterval = null;

        // This is resolve function of Promise returned by this.run()
        // which gets resolved once everything is done.
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
        const promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            this._maybeRunPromise();

            // This is here because if we scale down to let's say 1. Then after each promise is finished
            // this._maybeRunPromise() doesn't trigger another one. So if that 1 instance stucks it results
            // in whole act to stuck and even after scaling up it never triggers another promise.
            this.maybeRunInterval = setInterval(() => this._maybeRunPromise(), MAYBE_RUN_INTERVAL_MILLIS);

            // This interval checks memory and in each call saves current memory stats and in every
            // SCALE_UP_INTERVAL-th/SCALE_DOWN_INTERVAL-th call it may scale up/down based on memory.
            this.memCheckInterval = setInterval(() => this._autoscale(), MEM_CHECK_INTERVAL_MILLIS);
        });

        return promise
            .then(() => this._destroy())
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
        getMemoryInfo()
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
            });
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
        const perInstanceRatio = (maxTakenBytes / totalBytes) / this.concurrency;
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
     * Registers running promise.
     *
     * @ignore
     */
    _addRunningPromise(id, promise) {
        this.runningPromises[id] = promise;
        this.runningCount++;
    }

    /**
     * Removes finished promise.
     *
     * @ignore
     */
    _removeFinishedPromise(id) {
        delete this.runningPromises[id];
        this.runningCount--;
    }

    /**
     * If this.runningCount < this.concurrency then gets new promise from this.workerFunction() and adds it to the pool.
     * If this.workerFunction() returns null and nothing is running then finishes pool.
     *
     * @ignore
     */
    _maybeRunPromise() {
        if (!this.resolve || !this.reject) return;
        if (this.runningCount >= this.concurrency) return;

        const promise = this.workerFunction();

        // We are done.
        if (!promise && this.runningCount === 0) return this.resolve();

        // We are not done but don't want to execute new promise at this point.
        // This may happen when there are less pages in the queue than max concurrency
        // but all of them are being served already.
        if (!promise) return;

        // It's not null so it must be a promise!
        if (!isPromise(promise)) throw new Error('User provided workerFunction must return a Promise.');

        const id = this.promiseCounter;
        this.promiseCounter++;
        this._addRunningPromise(id, promise);

        promise
            .then((data) => {
                this._removeFinishedPromise(id);
                this._maybeRunPromise();

                return data;
            })
            .catch((err) => {
                log.exception(err, 'AutoscaledPool: worker function failed');
                this._removeFinishedPromise(id);
                if (this.reject) this.reject(err);
            });

        this._maybeRunPromise();
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
        clearInterval(this.maybeRunInterval);
    }
}
