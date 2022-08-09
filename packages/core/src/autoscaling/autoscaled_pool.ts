import type { Log } from '@apify/log';
import { addTimeoutToPromise } from '@apify/timeout';
import type { BetterIntervalID } from '@apify/utilities';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';
import ow from 'ow';
import { Configuration } from '../configuration';
import { log as defaultLog } from '../log';
import type { SnapshotterOptions } from './snapshotter';
import { Snapshotter } from './snapshotter';
import type { SystemInfo, SystemStatusOptions } from './system_status';
import { SystemStatus } from './system_status';

export interface AutoscaledPoolOptions {
    /**
     * A function that performs an asynchronous resource-intensive task.
     * The function must either be labeled `async` or return a promise.
     */
    runTaskFunction?: () => Promise<unknown>;

    /**
     * A function that indicates whether `runTaskFunction` should be called.
     * This function is called every time there is free capacity for a new task and it should
     * indicate whether it should start a new task or not by resolving to either `true` or `false`.
     * Besides its obvious use, it is also useful for task throttling to save resources.
     */
    isTaskReadyFunction?: () => Promise<boolean>;

    /**
     * A function that is called only when there are no tasks to be processed.
     * If it resolves to `true` then the pool's run finishes. Being called only
     * when there are no tasks being processed means that as long as `isTaskReadyFunction()`
     * keeps resolving to `true`, `isFinishedFunction()` will never be called.
     * To abort a run, use the {@apilink AutoscaledPool.abort} method.
     */
    isFinishedFunction?: () => Promise<boolean>;

    /**
     * The minimum number of tasks running in parallel.
     *
     * *WARNING:* If you set this value too high with respect to the available system memory and CPU, your code might run extremely slow or crash.
     * If you're not sure, just keep the default value and the concurrency will scale up automatically.
     * @default 1
     */
    minConcurrency?: number;

    /**
     * The maximum number of tasks running in parallel.
     * @default 200
     */
    maxConcurrency?: number;

    /**
     * The desired number of tasks that should be running parallel on the start of the pool,
     * if there is a large enough supply of them.
     * By default, it is `minConcurrency`.
     */
    desiredConcurrency?: number;

    /**
     * Minimum level of desired concurrency to reach before more scaling up is allowed.
     * @default 0.90
     */
    desiredConcurrencyRatio?: number;

    /**
     * Defines the fractional amount of desired concurrency to be added with each scaling up.
     * The minimum scaling step is one.
     * @default 0.05
     */
    scaleUpStepRatio?: number;

    /**
     * Defines the amount of desired concurrency to be subtracted with each scaling down.
     * The minimum scaling step is one.
     * @default 0.05
     */
    scaleDownStepRatio?: number;

    /**
     * Indicates how often the pool should call the `runTaskFunction()` to start a new task, in seconds.
     * This has no effect on starting new tasks immediately after a task completes.
     * @default 0.5
     */
    maybeRunIntervalSecs?: number;

    /**
     * Specifies a period in which the instance logs its state, in seconds.
     * Set to `null` to disable periodic logging.
     * @default 60
     */
    loggingIntervalSecs?: number | null;

    /**
     * Defines in seconds how often the pool should attempt to adjust the desired concurrency
     * based on the latest system status. Setting it lower than 1 might have a severe impact on performance.
     * We suggest using a value from 5 to 20.
     * @default 10
     */
    autoscaleIntervalSecs?: number;

    /**
     * Timeout in which the `runTaskFunction` needs to finish, given in seconds.
     * @default 0
     */
    taskTimeoutSecs?: number;

    /**
     * Options to be passed down to the {@apilink Snapshotter} constructor. This is useful for fine-tuning
     * the snapshot intervals and history.
     */
    snapshotterOptions?: SnapshotterOptions;

    /**
     * Options to be passed down to the {@apilink SystemStatus} constructor. This is useful for fine-tuning
     * the system status reports. If a custom snapshotter is set in the options, it will be used
     * by the pool.
     */
    systemStatusOptions?: SystemStatusOptions;

    /**
     * The maximum number of tasks per minute the pool can run.
     * By default, this is set to `Infinity`, but you can pass any positive, non-zero integer.
     */
    maxTasksPerMinute?: number;

    log?: Log;
}

/**
 * Manages a pool of asynchronous resource-intensive tasks that are executed in parallel.
 * The pool only starts new tasks if there is enough free CPU and memory available
 * and the Javascript event loop is not blocked.
 *
 * The information about the CPU and memory usage is obtained by the {@apilink Snapshotter} class,
 * which makes regular snapshots of system resources that may be either local
 * or from the Apify cloud infrastructure in case the process is running on the Apify platform.
 * Meaningful data gathered from these snapshots is provided to `AutoscaledPool` by the {@apilink SystemStatus} class.
 *
 * Before running the pool, you need to implement the following three functions:
 * {@apilink AutoscaledPoolOptions.runTaskFunction},
 * {@apilink AutoscaledPoolOptions.isTaskReadyFunction} and
 * {@apilink AutoscaledPoolOptions.isFinishedFunction}.
 *
 * The auto-scaled pool is started by calling the {@apilink AutoscaledPool.run} function.
 * The pool periodically queries the {@apilink AutoscaledPoolOptions.isTaskReadyFunction} function
 * for more tasks, managing optimal concurrency, until the function resolves to `false`. The pool then queries
 * the {@apilink AutoscaledPoolOptions.isFinishedFunction}. If it resolves to `true`, the run finishes after all running tasks complete.
 * If it resolves to `false`, it assumes there will be more tasks available later and keeps periodically querying for tasks.
 * If any of the tasks throws then the {@apilink AutoscaledPool.run} function rejects the promise with an error.
 *
 * The pool evaluates whether it should start a new task every time one of the tasks finishes
 * and also in the interval set by the `options.maybeRunIntervalSecs` parameter.
 *
 * **Example usage:**
 *
 * ```javascript
 * const pool = new AutoscaledPool({
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
 * @category Scaling
 */
export class AutoscaledPool {
    private readonly log: Log;

    // Configurable properties.
    private readonly desiredConcurrencyRatio: number;
    private readonly scaleUpStepRatio: number;
    private readonly scaleDownStepRatio: number;
    private readonly maybeRunIntervalMillis: number;
    private readonly loggingIntervalMillis: number;
    private readonly autoscaleIntervalMillis: number;
    private readonly taskTimeoutMillis: number;
    private readonly runTaskFunction: () => Promise<unknown>;
    private readonly isFinishedFunction: () => Promise<boolean>;
    private readonly isTaskReadyFunction: () => Promise<boolean>;
    private readonly maxTasksPerMinute: number;

    // Internal properties.
    private _minConcurrency: number;
    private _maxConcurrency: number;
    private _desiredConcurrency: number;
    private _currentConcurrency = 0;
    private isStopped = false;
    private lastLoggingTime?: number;
    private resolve: ((val?: unknown) => void) | null = null;
    private reject: ((reason?: unknown) => void) | null = null;
    private snapshotter: Snapshotter;
    private systemStatus: SystemStatus;
    private poolPromise!: Promise<unknown>;
    private autoscaleInterval!: BetterIntervalID;
    private maybeRunInterval!: BetterIntervalID;
    private queryingIsTaskReady!: boolean;
    private queryingIsFinished!: boolean;
    private tasksDonePerSecondInterval?: BetterIntervalID;
    private _tasksPerMinute: number[] = Array.from({ length: 60 }, () => 0);

    constructor(
        options: AutoscaledPoolOptions,
        private readonly config = Configuration.getGlobalConfig(),
    ) {
        ow(options, ow.object.exactShape({
            runTaskFunction: ow.function,
            isFinishedFunction: ow.function,
            isTaskReadyFunction: ow.function,
            maxConcurrency: ow.optional.number.integer.greaterThanOrEqual(1),
            minConcurrency: ow.optional.number.integer.greaterThanOrEqual(1),
            desiredConcurrency: ow.optional.number.integer.greaterThanOrEqual(1),
            desiredConcurrencyRatio: ow.optional.number.greaterThan(0).lessThan(1),
            scaleUpStepRatio: ow.optional.number.greaterThan(0).lessThan(1),
            scaleDownStepRatio: ow.optional.number.greaterThan(0).lessThan(1),
            maybeRunIntervalSecs: ow.optional.number.greaterThan(0),
            loggingIntervalSecs: ow.any(ow.number.greaterThan(0), ow.nullOrUndefined),
            autoscaleIntervalSecs: ow.optional.number.greaterThan(0),
            taskTimeoutSecs: ow.optional.number.greaterThanOrEqual(0),
            systemStatusOptions: ow.optional.object,
            snapshotterOptions: ow.optional.object,
            log: ow.optional.object,
            maxTasksPerMinute: ow.optional.number.integerOrInfinite.greaterThanOrEqual(1),
        }));

        const {
            runTaskFunction,
            isFinishedFunction,
            isTaskReadyFunction,
            maxConcurrency = 200,
            minConcurrency = 1,
            desiredConcurrency,
            desiredConcurrencyRatio = 0.90,
            scaleUpStepRatio = 0.05,
            scaleDownStepRatio = 0.05,
            maybeRunIntervalSecs = 0.5,
            loggingIntervalSecs = 60,
            taskTimeoutSecs = 0,
            autoscaleIntervalSecs = 10,
            systemStatusOptions,
            snapshotterOptions,
            log = defaultLog,
            maxTasksPerMinute = Infinity,
        } = options;

        this.log = log.child({ prefix: 'AutoscaledPool' });

        // Configurable properties.
        this.desiredConcurrencyRatio = desiredConcurrencyRatio;
        this.scaleUpStepRatio = scaleUpStepRatio;
        this.scaleDownStepRatio = scaleDownStepRatio;
        this.maybeRunIntervalMillis = maybeRunIntervalSecs * 1000;
        this.loggingIntervalMillis = loggingIntervalSecs! * 1000;
        this.autoscaleIntervalMillis = autoscaleIntervalSecs * 1000;
        this.taskTimeoutMillis = taskTimeoutSecs * 1000;
        this.runTaskFunction = runTaskFunction;
        this.isFinishedFunction = isFinishedFunction;
        this.isTaskReadyFunction = isTaskReadyFunction;
        this.maxTasksPerMinute = maxTasksPerMinute;

        // Internal properties.
        this._minConcurrency = minConcurrency;
        this._maxConcurrency = maxConcurrency;
        this._desiredConcurrency = Math.min(desiredConcurrency ?? minConcurrency, maxConcurrency);
        this._currentConcurrency = 0;
        this.isStopped = false;
        this.resolve = null;
        this.reject = null;
        this._autoscale = this._autoscale.bind(this);
        this._maybeRunTask = this._maybeRunTask.bind(this);
        this._incrementTasksDonePerSecond = this._incrementTasksDonePerSecond.bind(this);

        // Create instances with correct options.
        const ssoCopy = { ...systemStatusOptions };
        ssoCopy.snapshotter ??= new Snapshotter({
            ...snapshotterOptions,
            log: this.log,
            config: this.config,
            client: this.config.getStorageClient(),
        });
        ssoCopy.config ??= this.config;
        this.snapshotter = ssoCopy.snapshotter;
        this.systemStatus = new SystemStatus(ssoCopy);
    }

    /**
     * Gets the minimum number of tasks running in parallel.
     */
    get minConcurrency(): number {
        return this._minConcurrency;
    }

    /**
     * Sets the minimum number of tasks running in parallel.
     *
     * *WARNING:* If you set this value too high with respect to the available system memory and CPU, your code might run extremely slow or crash.
     * If you're not sure, just keep the default value and the concurrency will scale up automatically.
     */
    set minConcurrency(value: number) {
        ow(value, ow.optional.number.integer.greaterThanOrEqual(1));
        this._minConcurrency = value;
    }

    /**
     * Gets the maximum number of tasks running in parallel.
     */
    get maxConcurrency(): number {
        return this._maxConcurrency;
    }

    /**
     * Sets the maximum number of tasks running in parallel.
     */
    set maxConcurrency(value: number) {
        ow(value, ow.optional.number.integer.greaterThanOrEqual(1));
        this._maxConcurrency = value;
    }

    /**
     * Gets the desired concurrency for the pool,
     * which is an estimated number of parallel tasks that the system can currently support.
     */
    get desiredConcurrency(): number {
        return this._desiredConcurrency;
    }

    /**
     * Sets the desired concurrency for the pool, i.e. the number of tasks that should be running
     * in parallel if there's large enough supply of tasks.
     */
    set desiredConcurrency(value: number) {
        ow(value, ow.optional.number.integer.greaterThanOrEqual(1));
        this._desiredConcurrency = value;
    }

    /**
     * Gets the the number of parallel tasks currently running in the pool.
     */
    get currentConcurrency(): number {
        return this._currentConcurrency;
    }

    /**
     * Runs the auto-scaled pool. Returns a promise that gets resolved or rejected once
     * all the tasks are finished or one of them fails.
     */
    async run(): Promise<void> {
        this.poolPromise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });

        await this.snapshotter.start();

        // This interval checks the system status and updates the desired concurrency accordingly.
        this.autoscaleInterval = betterSetInterval(this._autoscale, this.autoscaleIntervalMillis);

        // This is here because if we scale down to let's say 1, then after each promise is finished
        // this._maybeRunTask() doesn't trigger another one. So if that 1 instance gets stuck it results
        // in the crawler getting stuck and even after scaling up it never triggers another promise.
        this.maybeRunInterval = betterSetInterval(this._maybeRunTask, this.maybeRunIntervalMillis);

        if (this.maxTasksPerMinute !== Infinity) {
            // Start the interval that resets the counter of tasks per minute.
            this.tasksDonePerSecondInterval = betterSetInterval(this._incrementTasksDonePerSecond, 1000);
        }

        try {
            await this.poolPromise;
        } finally {
            // If resolve is null, the pool is already destroyed.
            if (this.resolve) await this._destroy();
        }
    }

    /**
     * Aborts the run of the auto-scaled pool and destroys it. The promise returned from
     * the {@apilink AutoscaledPool.run} function will immediately resolve, no more new tasks
     * will be spawned and all running tasks will be left in their current state.
     *
     * Due to the nature of the tasks, auto-scaled pool cannot reliably guarantee abortion
     * of all the running tasks, therefore, no abortion is attempted and some of the tasks
     * may finish, while others may not. Essentially, auto-scaled pool doesn't care about
     * their state after the invocation of `.abort()`, but that does not mean that some
     * parts of their asynchronous chains of commands will not execute.
     */
    async abort(): Promise<void> {
        this.isStopped = true;
        if (this.resolve) {
            this.resolve();
            await this._destroy();
        }
    }

    /**
     * Prevents the auto-scaled pool from starting new tasks, but allows the running ones to finish
     * (unlike abort, which terminates them). Used together with {@apilink AutoscaledPool.resume}
     *
     * The function's promise will resolve once all running tasks have completed and the pool
     * is effectively idle. If the `timeoutSecs` argument is provided, the promise will reject
     * with a timeout error after the `timeoutSecs` seconds.
     *
     * The promise returned from the {@apilink AutoscaledPool.run} function will not resolve
     * when `.pause()` is invoked (unlike abort, which resolves it).
     */
    async pause(timeoutSecs?: number): Promise<void> {
        if (this.isStopped) return;
        this.isStopped = true;
        return new Promise((resolve, reject) => {
            let timeout: NodeJS.Timeout;
            if (timeoutSecs) {
                timeout = setTimeout(() => {
                    const err = new Error('The pool\'s running tasks did not finish'
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
     * Used together with {@apilink AutoscaledPool.pause}
     *
     * Tasks will automatically start running again in `options.maybeRunIntervalSecs`.
     */
    resume(): void {
        this.isStopped = false;
    }

    /**
     * Starts a new task
     * if the number of running tasks (current concurrency) is lower than desired concurrency
     * and the system is not currently overloaded
     * and this.isTaskReadyFunction() returns true.
     *
     * It doesn't allow multiple concurrent runs of this method.
     */
    protected async _maybeRunTask(intervalCallback?: () => void): Promise<void> {
        this.log.perf('Attempting to run a task.');
        // Check if the function was invoked by the maybeRunInterval and use an empty function if not.
        const done = intervalCallback || (() => {});

        // Prevent starting a new task if:
        // - the pool is paused or aborted
        if (this.isStopped) {
            this.log.perf('Task will not run. AutoscaledPool is stopped.');
            return done();
        }
        // - we are already querying for a task.
        if (this.queryingIsTaskReady) {
            this.log.perf('Task will not run. Waiting for a ready task.');
            return done();
        }
        // - we would exceed desired concurrency.
        if (this._currentConcurrency >= this._desiredConcurrency) {
            this.log.perf('Task will not run. Desired concurrency achieved.');
            return done();
        }
        // - system is overloaded now and we are at or above minConcurrency
        const currentStatus = this.systemStatus.getCurrentStatus();
        const { isSystemIdle } = currentStatus;
        if (!isSystemIdle && this._currentConcurrency >= this._minConcurrency) {
            this.log.perf('Task will not be run. System is overloaded.', currentStatus);
            return done();
        }
        // - a task is ready.
        this.queryingIsTaskReady = true;
        let isTaskReady;
        try {
            this.log.perf('Checking for ready tasks.');
            isTaskReady = await this.isTaskReadyFunction();
        } catch (e) {
            const err = e as Error;
            this.log.perf('Checking for ready tasks failed.');
            // We might have already rejected this promise.
            if (this.reject) {
                // No need to log all concurrent errors.
                this.log.exception(err, 'isTaskReadyFunction failed');
                this.reject(err);
            }
        } finally {
            this.queryingIsTaskReady = false;
        }
        if (!isTaskReady) {
            this.log.perf('Task will not run. No tasks are ready.');
            done();
            // No tasks could mean that we're finished with all tasks.
            return this._maybeFinish();
        }

        // - we have already reached the maximum tasks per minute
        // we need to check this *after* checking if a task is ready to prevent hanging the pool
        // for an extra minute if there are no more tasks
        if (this._isOverMaxRequestLimit) {
            this.log.perf('Task will not run. Maximum tasks per minute reached.');
            return done();
        }

        try {
            // Everything's fine. Run task.
            this._currentConcurrency++;
            this._tasksPerMinute[0]++;
            // Try to run next task to build up concurrency,
            // but defer it so it doesn't create a cycle.
            setImmediate(this._maybeRunTask);

            // We need to restart interval here, so that it doesn't get blocked by a stalled task.
            done();

            // Execute the current task.
            this.log.perf('Running a task.');

            if (this.taskTimeoutMillis > 0) {
                await addTimeoutToPromise(
                    () => this.runTaskFunction(),
                    this.taskTimeoutMillis,
                    `runTaskFunction timed out after ${this.taskTimeoutMillis / 1000} seconds.`,
                );
            } else {
                await this.runTaskFunction();
            }

            this.log.perf('Task finished.');
            this._currentConcurrency--;
            // Run task after the previous one finished.
            setImmediate(this._maybeRunTask);
        } catch (e) {
            const err = e as Error;
            this.log.perf('Running a task failed.');
            // We might have already rejected this promise.
            if (this.reject) {
                // No need to log all concurrent errors.
                this.log.exception(err, 'runTaskFunction failed.');
                this.reject(err);
            }
        }
    }

    /**
     * Gets called every autoScaleIntervalSecs and evaluates the current system status.
     * If the system IS NOT overloaded and the settings allow it, it scales up.
     * If the system IS overloaded and the settings allow it, it scales down.
     */
    protected _autoscale(intervalCallback: () => void) {
        // Don't scale if paused.
        if (this.isStopped) return intervalCallback();

        // Don't scale if we've hit the maximum requests per minute
        if (this._isOverMaxRequestLimit) return intervalCallback();

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

            if (this.lastLoggingTime == null) {
                this.lastLoggingTime = now;
            } else if (now > this.lastLoggingTime + this.loggingIntervalMillis) {
                this.lastLoggingTime = now;
                this.log.info('state', {
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
     * @param systemStatus for logging
     */
    protected _scaleUp(systemStatus: SystemInfo): void {
        const step = Math.ceil(this._desiredConcurrency * this.scaleUpStepRatio);
        this._desiredConcurrency = Math.min(this._maxConcurrency, this._desiredConcurrency + step);
        this.log.debug('scaling up', {
            oldConcurrency: this._desiredConcurrency - step,
            newConcurrency: this._desiredConcurrency,
            systemStatus,
        });
    }

    /**
     * Scales the pool down by decreasing
     * the desired concurrency by the scaleDownStepRatio.
     *
     * @param systemStatus for logging
     */
    protected _scaleDown(systemStatus: SystemInfo): void {
        const step = Math.ceil(this._desiredConcurrency * this.scaleDownStepRatio);
        this._desiredConcurrency = Math.max(this._minConcurrency, this._desiredConcurrency - step);
        this.log.debug('scaling down', {
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
     */
    protected async _maybeFinish(): Promise<void> {
        if (this.queryingIsFinished) return;
        if (this._currentConcurrency > 0) return;

        this.queryingIsFinished = true;
        try {
            const isFinished = await this.isFinishedFunction();
            if (isFinished && this.resolve) this.resolve();
        } catch (e) {
            const err = e as Error;
            if (this.reject) {
                // No need to log all concurrent errors.
                this.log.exception(err, 'isFinishedFunction failed.');
                this.reject(err);
            }
        } finally {
            this.queryingIsFinished = false;
        }
    }

    /**
     * Cleans up resources.
     */
    protected async _destroy(): Promise<void> {
        this.resolve = null;
        this.reject = null;

        betterClearInterval(this.autoscaleInterval);
        betterClearInterval(this.maybeRunInterval);
        if (this.tasksDonePerSecondInterval) betterClearInterval(this.tasksDonePerSecondInterval);
        if (this.snapshotter) await this.snapshotter.stop();
    }

    protected _incrementTasksDonePerSecond(intervalCallback: () => void) {
        this._tasksPerMinute.unshift(0);

        this._tasksPerMinute.pop();

        return intervalCallback();
    }

    protected get _isOverMaxRequestLimit() {
        if (this.maxTasksPerMinute === Infinity) {
            return false;
        }

        return this._tasksPerMinute.reduce((acc, curr) => acc + curr, 0) >= this.maxTasksPerMinute;
    }
}
