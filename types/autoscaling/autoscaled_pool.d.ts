export default AutoscaledPool;
export type AutoscaledPoolOptions = {
    /**
     * A function that performs an asynchronous resource-intensive task.
     * The function must either be labeled `async` or return a promise.
     */
    runTaskFunction: Function;
    /**
     * A function that indicates whether `runTaskFunction` should be called.
     * This function is called every time there is free capacity for a new task and it should
     * indicate whether it should start a new task or not by resolving to either `true` or `false`.
     * Besides its obvious use, it is also useful for task throttling to save resources.
     */
    isTaskReadyFunction: Function;
    /**
     * A function that is called only when there are no tasks to be processed.
     * If it resolves to `true` then the pool's run finishes. Being called only
     * when there are no tasks being processed means that as long as `isTaskReadyFunction()`
     * keeps resolving to `true`, `isFinishedFunction()` will never be called.
     * To abort a run, use the {@link AutoscaledPool#abort} method.
     */
    isFinishedFunction: Function;
    /**
     * The minimum number of tasks running in parallel.
     *
     * *WARNING:* If you set this value too high with respect to the available system memory and CPU, your code might run extremely slow or crash.
     * If you're not sure, just keep the default value and the concurrency will scale up automatically.
     */
    minConcurrency?: number;
    /**
     * The maximum number of tasks running in parallel.
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
     */
    desiredConcurrencyRatio?: number;
    /**
     * Defines the fractional amount of desired concurrency to be added with each scaling up.
     * The minimum scaling step is one.
     */
    scaleUpStepRatio?: number;
    /**
     * Defines the amount of desired concurrency to be subtracted with each scaling down.
     * The minimum scaling step is one.
     */
    scaleDownStepRatio?: number;
    /**
     * Indicates how often the pool should call the `runTaskFunction()` to start a new task, in seconds.
     * This has no effect on starting new tasks immediately after a task completes.
     */
    maybeRunIntervalSecs?: number;
    /**
     * Specifies a period in which the instance logs its state, in seconds.
     * Set to `null` to disable periodic logging.
     */
    loggingIntervalSecs?: number;
    /**
     * Defines in seconds how often the pool should attempt to adjust the desired concurrency
     * based on the latest system status. Setting it lower than 1 might have a severe impact on performance.
     * We suggest using a value from 5 to 20.
     */
    autoscaleIntervalSecs?: number;
    /**
     * Options to be passed down to the {@link Snapshotter} constructor. This is useful for fine-tuning
     * the snapshot intervals and history.
     */
    snapshotterOptions?: SnapshotterOptions;
    /**
     * Options to be passed down to the {@link SystemStatus} constructor. This is useful for fine-tuning
     * the system status reports. If a custom snapshotter is set in the options, it will be used
     * by the pool.
     */
    systemStatusOptions?: SystemStatusOptions;
};
/**
 * @typedef AutoscaledPoolOptions
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
 *   To abort a run, use the {@link AutoscaledPool#abort} method.
 *
 * @property {number} [minConcurrency=1]
 *   The minimum number of tasks running in parallel.
 *
 *   *WARNING:* If you set this value too high with respect to the available system memory and CPU, your code might run extremely slow or crash.
 *   If you're not sure, just keep the default value and the concurrency will scale up automatically.
 * @property {number} [maxConcurrency=1000]
 *   The maximum number of tasks running in parallel.
 * @property {number} [desiredConcurrency]
 *   The desired number of tasks that should be running parallel on the start of the pool,
 *   if there is a large enough supply of them.
 *   By default, it is `minConcurrency`.
 * @property {number} [desiredConcurrencyRatio=0.95]
 *   Minimum level of desired concurrency to reach before more scaling up is allowed.
 * @property {number} [scaleUpStepRatio=0.05]
 *   Defines the fractional amount of desired concurrency to be added with each scaling up.
 *   The minimum scaling step is one.
 * @property {number} [scaleDownStepRatio=0.05]
 *   Defines the amount of desired concurrency to be subtracted with each scaling down.
 *   The minimum scaling step is one.
 * @property {number} [maybeRunIntervalSecs=0.5]
 *   Indicates how often the pool should call the `runTaskFunction()` to start a new task, in seconds.
 *   This has no effect on starting new tasks immediately after a task completes.
 * @property {number} [loggingIntervalSecs=60]
 *   Specifies a period in which the instance logs its state, in seconds.
 *   Set to `null` to disable periodic logging.
 * @property {number} [autoscaleIntervalSecs=10]
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
 * {@link AutoscaledPoolOptions#runTaskFunction},
 * {@link AutoscaledPoolOptions#isTaskReadyFunction} and
 * {@link AutoscaledPoolOptions#isFinishedFunction}.
 *
 * The auto-scaled pool is started by calling the {@link AutoscaledPool#run} function.
 * The pool periodically queries the {@link AutoscaledPoolOptions#isTaskReadyFunction} function
 * for more tasks, managing optimal concurrency, until the function resolves to `false`. The pool then queries
 * the {@link AutoscaledPoolOptions#isFinishedFunction}. If it resolves to `true`, the run finishes after all running tasks complete.
 * If it resolves to `false`, it assumes there will be more tasks available later and keeps periodically querying for tasks.
 * If any of the tasks throws then the {@link AutoscaledPool#run} function rejects the promise with an error.
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
declare class AutoscaledPool {
    /**
     * @param {AutoscaledPoolOptions} options All `AutoscaledPool` configuration options.
     */
    constructor(options?: AutoscaledPoolOptions);
    desiredConcurrencyRatio: any;
    scaleUpStepRatio: any;
    scaleDownStepRatio: any;
    maybeRunIntervalMillis: number;
    loggingIntervalMillis: number;
    autoscaleIntervalMillis: number;
    runTaskFunction: any;
    isFinishedFunction: any;
    isTaskReadyFunction: any;
    _minConcurrency: any;
    _maxConcurrency: any;
    _desiredConcurrency: any;
    _currentConcurrency: number;
    isStopped: boolean;
    lastLoggingTime: number;
    resolve: ((value?: any) => void) | null;
    reject: ((reason?: any) => void) | null;
    /**
     * Gets called every autoScaleIntervalSecs and evaluates the current system status.
     * If the system IS NOT overloaded and the settings allow it, it scales up.
     * If the system IS overloaded and the settings allow it, it scales down.
     *
     * @ignore
     */
    _autoscale(intervalCallback: any): any;
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
    _maybeRunTask(intervalCallback: any): Promise<void>;
    snapshotter: any;
    systemStatus: SystemStatus;
    /**
     * @ignore
     */
    setMaxConcurrency(maxConcurrency: any): void;
    /**
     * @ignore
     */
    setMinConcurrency(minConcurrency: any): void;
    /**
     * Sets the minimum number of tasks running in parallel.
     *
     * *WARNING:* If you set this value too high with respect to the available system memory and CPU, your code might run extremely slow or crash.
     * If you're not sure, just keep the default value and the concurrency will scale up automatically.
     *
     * @param {number} value
     */
    set minConcurrency(arg: number);
    /**
     * Gets the minimum number of tasks running in parallel.
     *
     * @return {number}
     */
    get minConcurrency(): number;
    /**
     * Sets the maximum number of tasks running in parallel.
     *
     * @param {number} value
     */
    set maxConcurrency(arg: number);
    /**
     * Gets the maximum number of tasks running in parallel.
     *
     * @return {number}
     */
    get maxConcurrency(): number;
    /**
     * Sets the desired concurrency for the pool, i.e. the number of tasks that should be running
     * in parallel if there's large enough supply of tasks.
     *
     * @param {number} value
     */
    set desiredConcurrency(arg: number);
    /**
     * Gets the desired concurrency for the pool,
     * which is an estimated number of parallel tasks that the system can currently support.
     *
     * @return {number}
     */
    get desiredConcurrency(): number;
    /**
     * Gets the the number of parallel tasks currently running in the pool.
     *
     * @return {number}
     */
    get currentConcurrency(): number;
    /**
     * Runs the auto-scaled pool. Returns a promise that gets resolved or rejected once
     * all the tasks are finished or one of them fails.
     *
     * @return {Promise<void>}
     */
    run(): Promise<void>;
    poolPromise: Promise<any> | undefined;
    autoscaleInterval: any;
    maybeRunInterval: any;
    /**
     * Aborts the run of the auto-scaled pool and destroys it. The promise returned from
     * the {@link AutoscaledPool#run} function will immediately resolve, no more new tasks
     * will be spawned and all running tasks will be left in their current state.
     *
     * Due to the nature of the tasks, auto-scaled pool cannot reliably guarantee abortion
     * of all the running tasks, therefore, no abortion is attempted and some of the tasks
     * may finish, while others may not. Essentially, auto-scaled pool doesn't care about
     * their state after the invocation of `.abort()`, but that does not mean that some
     * parts of their asynchronous chains of commands will not execute.
     *
     * @return {Promise<void>}
     */
    abort(): Promise<void>;
    /**
     * Prevents the auto-scaled pool from starting new tasks, but allows the running ones to finish
     * (unlike abort, which terminates them). Used together with {@link AutoscaledPool#resume}
     *
     * The function's promise will resolve once all running tasks have completed and the pool
     * is effectively idle. If the `timeoutSecs` argument is provided, the promise will reject
     * with a timeout error after the `timeoutSecs` seconds.
     *
     * The promise returned from the {@link AutoscaledPool#run} function will not resolve
     * when `.pause()` is invoked (unlike abort, which resolves it).
     *
     * @param {number} [timeoutSecs]
     * @return {Promise<void>}
     */
    pause(timeoutSecs?: number | undefined): Promise<void>;
    /**
     * Resumes the operation of the autoscaled-pool by allowing more tasks to be run.
     * Used together with {@link AutoscaledPool#pause}
     *
     * Tasks will automatically start running again in `options.maybeRunIntervalSecs`.
     */
    resume(): void;
    queryingIsTaskReady: boolean | undefined;
    /**
     * Scales the pool up by increasing
     * the desired concurrency by the scaleUpStepRatio.
     *
     * @param {Object} systemStatus for logging
     * @ignore
     */
    _scaleUp(systemStatus: Object): void;
    /**
     * Scales the pool down by decreasing
     * the desired concurrency by the scaleDownStepRatio.
     *
     * @param {Object} systemStatus for logging
     * @ignore
     */
    _scaleDown(systemStatus: Object): void;
    /**
     * If there are no running tasks and this.isFinishedFunction() returns true then closes
     * the pool and resolves the pool's promise returned by the run() method.
     *
     * It doesn't allow multiple concurrent runs of this method.
     *
     * @ignore
     */
    _maybeFinish(): Promise<void>;
    queryingIsFinished: boolean | undefined;
    /**
     * Cleans up resources.
     *
     * @ignore
     */
    _destroy(): Promise<void>;
}
import { SnapshotterOptions } from "./snapshotter";
import { SystemStatusOptions } from "./system_status";
import SystemStatus from "./system_status";
