import type { Log } from '@apify/log';
import { Configuration } from '../configuration';
import type { SnapshotterOptions } from './snapshotter';
import type { SystemInfo, SystemStatusOptions } from './system_status';
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
export declare class AutoscaledPool {
    private readonly config;
    private readonly log;
    private readonly desiredConcurrencyRatio;
    private readonly scaleUpStepRatio;
    private readonly scaleDownStepRatio;
    private readonly maybeRunIntervalMillis;
    private readonly loggingIntervalMillis;
    private readonly autoscaleIntervalMillis;
    private readonly taskTimeoutMillis;
    private readonly runTaskFunction;
    private readonly isFinishedFunction;
    private readonly isTaskReadyFunction;
    private readonly maxTasksPerMinute;
    private _minConcurrency;
    private _maxConcurrency;
    private _desiredConcurrency;
    private _currentConcurrency;
    private isStopped;
    private lastLoggingTime?;
    private resolve;
    private reject;
    private snapshotter;
    private systemStatus;
    private poolPromise;
    private autoscaleInterval;
    private maybeRunInterval;
    private queryingIsTaskReady;
    private queryingIsFinished;
    private tasksDonePerSecondInterval?;
    private _tasksPerMinute;
    constructor(options: AutoscaledPoolOptions, config?: Configuration);
    /**
     * Gets the minimum number of tasks running in parallel.
     */
    get minConcurrency(): number;
    /**
     * Sets the minimum number of tasks running in parallel.
     *
     * *WARNING:* If you set this value too high with respect to the available system memory and CPU, your code might run extremely slow or crash.
     * If you're not sure, just keep the default value and the concurrency will scale up automatically.
     */
    set minConcurrency(value: number);
    /**
     * Gets the maximum number of tasks running in parallel.
     */
    get maxConcurrency(): number;
    /**
     * Sets the maximum number of tasks running in parallel.
     */
    set maxConcurrency(value: number);
    /**
     * Gets the desired concurrency for the pool,
     * which is an estimated number of parallel tasks that the system can currently support.
     */
    get desiredConcurrency(): number;
    /**
     * Sets the desired concurrency for the pool, i.e. the number of tasks that should be running
     * in parallel if there's large enough supply of tasks.
     */
    set desiredConcurrency(value: number);
    /**
     * Gets the the number of parallel tasks currently running in the pool.
     */
    get currentConcurrency(): number;
    /**
     * Runs the auto-scaled pool. Returns a promise that gets resolved or rejected once
     * all the tasks are finished or one of them fails.
     */
    run(): Promise<void>;
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
    abort(): Promise<void>;
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
    pause(timeoutSecs?: number): Promise<void>;
    /**
     * Resumes the operation of the autoscaled-pool by allowing more tasks to be run.
     * Used together with {@apilink AutoscaledPool.pause}
     *
     * Tasks will automatically start running again in `options.maybeRunIntervalSecs`.
     */
    resume(): void;
    /**
     * Starts a new task
     * if the number of running tasks (current concurrency) is lower than desired concurrency
     * and the system is not currently overloaded
     * and this.isTaskReadyFunction() returns true.
     *
     * It doesn't allow multiple concurrent runs of this method.
     */
    protected _maybeRunTask(intervalCallback?: () => void): Promise<void>;
    /**
     * Gets called every autoScaleIntervalSecs and evaluates the current system status.
     * If the system IS NOT overloaded and the settings allow it, it scales up.
     * If the system IS overloaded and the settings allow it, it scales down.
     */
    protected _autoscale(intervalCallback: () => void): void;
    /**
     * Scales the pool up by increasing
     * the desired concurrency by the scaleUpStepRatio.
     *
     * @param systemStatus for logging
     */
    protected _scaleUp(systemStatus: SystemInfo): void;
    /**
     * Scales the pool down by decreasing
     * the desired concurrency by the scaleDownStepRatio.
     *
     * @param systemStatus for logging
     */
    protected _scaleDown(systemStatus: SystemInfo): void;
    /**
     * If there are no running tasks and this.isFinishedFunction() returns true then closes
     * the pool and resolves the pool's promise returned by the run() method.
     *
     * It doesn't allow multiple concurrent runs of this method.
     */
    protected _maybeFinish(): Promise<void>;
    /**
     * Cleans up resources.
     */
    protected _destroy(): Promise<void>;
    protected _incrementTasksDonePerSecond(intervalCallback: () => void): void;
    protected get _isOverMaxRequestLimit(): boolean;
}
//# sourceMappingURL=autoscaled_pool.d.ts.map