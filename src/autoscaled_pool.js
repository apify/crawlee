import Promise from 'bluebird';
import { log } from 'apify-shared';
import _ from 'underscore';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { getMemoryInfo } from './utils';

const MEM_CHECK_INTERVAL_MILLIS = 100;
const MAYBE_RUN_INTERVAL_MILLIS = 1000;
const MIN_FREE_MEMORY_PERC = 0.1; // Minumum amount of memory that we keep free.
const DEFAULT_OPTIONS = {
    maxConcurrency: 1000,
    minConcurrency: 1,
};

// These constants defines that in Nth execution memCheckInterval we do:
export const SCALE_UP_INTERVAL = 100;
export const SCALE_UP_MAX_STEP = 10;
export const SCALE_DOWN_INTERVAL = 10;
export const LOG_INFO_INTERVAL = 600; // This must be multiple of SCALE_UP_INTERVAL

const humanReadable = bytes => `${Math.round(bytes / 1024 / 1024)} MB`;

export default class AutoscaledPool {
    constructor(opts) {
        const { maxMemoryMbytes, maxConcurrency, minConcurrency, workerFunction } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(maxMemoryMbytes, 'opts.maxMemoryMbytes', 'Maybe Number');
        checkParamOrThrow(maxConcurrency, 'opts.maxConcurrency', 'Number');
        checkParamOrThrow(minConcurrency, 'opts.minConcurrency', 'Number');
        checkParamOrThrow(workerFunction, 'opts.workerFunction', 'Function');

        // Configuration.
        this.maxMemoryMbytes = maxMemoryMbytes;
        this.maxConcurrency = maxConcurrency;
        this.minConcurrency = Math.min(minConcurrency, maxConcurrency);
        this.workerFunction = workerFunction;

        // State.
        this.promiseCounter = 0;
        this.intervalCounter = 0;
        this.concurrency = minConcurrency;
        this.runningPromises = {};
        this.runningCount = 0;
        this.freeBytesSnapshots = [];

        // Intervals.
        this.memCheckInterval = null;
        this.maybeRunInterval = null;

        // This is resolve function of Promise returned by this.run()
        // which gets resolved once everything is done.
        this.resolve = null;
        this.reject = null;
    }

    /**
     * Starts the pool.
     * Returns promise that resolves once whole pool gets finished.
     */
    run() {
        const promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            this._maybeRunPromise();

            // This is here because if we scale down to lets say 1. Then after each promise is finished
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
     */
    _autoscale() {
        getMemoryInfo()
            .then(({ freeBytes, totalBytes }) => {
                if (this.maxMemoryMbytes) totalBytes = this.maxMemoryMbytes;

                this.intervalCounter++;
                this.freeBytesSnapshots = this.freeBytesSnapshots.concat(freeBytes).slice(-SCALE_UP_INTERVAL);

                // Maybe scale down.
                if (
                    this.intervalCounter % SCALE_DOWN_INTERVAL === 0
                    && (freeBytes / totalBytes < MIN_FREE_MEMORY_PERC)
                    && this.concurrency > this.minConcurrency
                ) {
                    this.concurrency--;
                    log.debug('AutoscaledPool: scaling down', { concurrency: this.concurrency });
                }

                // Maybe scale up.
                if (
                    this.intervalCounter % SCALE_UP_INTERVAL === 0
                    && this.concurrency < this.maxConcurrency
                ) {
                    const hasSpaceForInstances = this._computeSpaceforInstances(totalBytes, this.intervalCounter % LOG_INFO_INTERVAL);

                    if (hasSpaceForInstances > 0) {
                        const increaseBy = Math.min(hasSpaceForInstances, SCALE_UP_MAX_STEP);
                        this.concurrency = Math.min(this.concurrency + increaseBy, this.maxConcurrency);
                        log.debug('AutoscaledPool: scaling up', { concurrency: this.concurrency, increaseBy });
                    }
                }
            });
    }

    /**
     * Gets memory info and computes how much we can scale pool to don't exceede the
     * maximal memory.
     *
     * If shouldLogInfo = true then also logs info about memory usage.
     */
    _computeSpaceforInstances(totalBytes, logInfo) {
        const minFreeBytes = Math.min(...this.freeBytesSnapshots);
        const minFreePerc = minFreeBytes / totalBytes;
        const maxTakenBytes = totalBytes - minFreeBytes;
        const perInstancePerc = (maxTakenBytes / totalBytes) / this.concurrency;
        const hasSpaceForInstances = (minFreePerc - MIN_FREE_MEMORY_PERC) / perInstancePerc;

        if (logInfo) {
            log.info('AutoscaledPool: info', {
                concurency: this.concurrency,
                runningCount: this.runningCount,
                freeBytesSnapshots: humanReadable(_.last(this.freeBytesSnapshots)),
                totalBytes: humanReadable(totalBytes),
                minFreeBytes: humanReadable(minFreeBytes),
                minFreePerc,
                maxTakenBytes: humanReadable(maxTakenBytes),
                perInstancePerc,
                hasSpaceForInstances,
            });
        }

        return Math.floor(hasSpaceForInstances);
    }

    /**
     * Registers running promise.
     */
    _addRunningPromise(id, promise) {
        this.runningPromises[id] = promise;
        this.runningCount++;
    }

    /**
     * Removes finished promise.
     */
    _removeFinishedPromise(id) {
        delete this.runningPromises[id];
        this.runningCount--;
    }

    /**
     * If this.runningCount < this.concurrency then gets new promise from this.workerFunction() and adds it to the pool.
     * If this.workerFunction() returns null and nothing is running then finishes pool.
     */
    _maybeRunPromise() {
        if (this.runningCount >= this.concurrency) return;

        const promise = this.workerFunction();

        // We are done.
        if (!promise && this.runningCount === 0) return this.resolve();

        // We are not done but don't want to execute new promise at this point.
        // This may happen when there are less pages in the queue than max concurrency
        // but all of them are being served already.
        if (!promise) return;

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
                this.reject(err);
            });

        this._maybeRunPromise();
    }

    _destroy() {
        clearInterval(this.memCheckInterval);
        clearInterval(this.maybeRunInterval);
    }
}
