import type { ConcurrencyConsumer, IConcurrencySystem } from './concurrency_system.js';
import type { CrawleeLogger } from '../log.js';
/**
 * The two predicates that steer a task loop: *is there work ready?* and *are we done?* These are the parts of the loop
 * a caller legitimately overrides, as opposed to the task itself (`runTaskFunction`), which the loop's driver owns.
 */
export interface TaskLoopPredicates {
    /**
     * A function that indicates whether `runTaskFunction` should be called.
     * This function is called every time there is free capacity for a new task and it should
     * indicate whether it should start a new task or not by resolving to either `true` or `false`.
     * Besides its obvious use, it is also useful for task throttling to save resources.
     */
    isTaskReadyFunction?: () => Promise<boolean>;
    /**
     * A function that is called only when there are no tasks to be processed.
     * If it resolves to `true` then the run finishes. Being called only
     * when there are no tasks being processed means that as long as `isTaskReadyFunction()`
     * keeps resolving to `true`, `isFinishedFunction()` will never be called.
     */
    isFinishedFunction?: () => Promise<boolean>;
    /**
     * How often the pool should check if a new task is ready, in seconds.
     * @default 0.5
     */
    maybeRunIntervalSecs?: number;
}
/** @internal */
export interface AutoscaledPoolOptions extends TaskLoopPredicates {
    /**
     * The governor that decides whether there is free compute for one more task. Typically a
     * {@apilink ConcurrencySystem}, but any {@apilink IConcurrencySystem} works. Share a single instance across
     * multiple pools (and therefore multiple crawlers) to cap their *combined* concurrency against one budget.
     *
     * All concurrency/scaling/snapshotter configuration lives on the governor — the pool only owns the task loop and
     * its cadence.
     */
    concurrencySystem: IConcurrencySystem;
    /**
     * Who this pool is, presented to the governor on every capacity query and booking so that a shared one can tell
     * several pools apart. Worth naming meaningfully — a governor that allocates per consumer reports this `id`.
     */
    consumer: ConcurrencyConsumer;
    /**
     * A function that performs an asynchronous resource-intensive task.
     * The function must either be labeled `async` or return a promise.
     */
    runTaskFunction?: () => Promise<unknown>;
    /**
     * Indicates how often the pool should call the `runTaskFunction()` to start a new task, in seconds.
     * This has no effect on starting new tasks immediately after a task completes.
     * @default 0.5
     */
    maybeRunIntervalSecs?: number;
    /**
     * Timeout in which the `runTaskFunction` needs to finish, given in seconds.
     * @default 0
     */
    taskTimeoutSecs?: number;
    log?: CrawleeLogger;
}
/**
 * Manages a pool of asynchronous resource-intensive tasks that are executed in parallel.
 * The pool only starts new tasks while its {@apilink IConcurrencySystem|concurrency system} reports free capacity —
 * that governor is what monitors CPU, memory and event loop load and autoscales the concurrency budget.
 *
 * Before running the pool, you need to implement the following three functions:
 * {@apilink AutoscaledPoolOptions.runTaskFunction|`runTaskFunction`},
 * {@apilink TaskLoopPredicates.isTaskReadyFunction|`isTaskReadyFunction`} and
 * {@apilink TaskLoopPredicates.isFinishedFunction|`isFinishedFunction`}.
 *
 * The auto-scaled pool is started by calling the {@apilink AutoscaledPool.run} function.
 * The pool periodically queries `isTaskReadyFunction` for more tasks, managing optimal concurrency, until the function
 * resolves to `false`. The pool then queries `isFinishedFunction`. If it resolves to `true`, the run finishes after all
 * running tasks complete. If it resolves to `false`, it assumes there will be more tasks available later and keeps
 * periodically querying for tasks.
 * If any of the tasks throws then the {@apilink AutoscaledPool.run} function rejects the promise with an error.
 *
 * The pool evaluates whether it should start a new task every time one of the tasks finishes
 * and also in the interval set by the `options.maybeRunIntervalSecs` parameter.
 *
 * **Example usage:**
 *
 * ```javascript
 * const concurrencySystem = new ConcurrencySystem({ maxConcurrency: 50 });
 * await concurrencySystem.start();
 *
 * const pool = new AutoscaledPool({
 *     concurrencySystem,
 *     consumer: { id: 'my-pool' },
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
 * try {
 *     await pool.run();
 * } finally {
 *     await concurrencySystem.stop();
 * }
 * ```
 *
 * @internal
 */
export declare class AutoscaledPool {
    #private;
    constructor(options: AutoscaledPoolOptions);
    /**
     * The governor backing this pool, as supplied to the constructor — exposed as the read-only
     * {@apilink IConcurrencySystem} contract.
     *
     * This and the two getters below are telemetry only: concurrency is configured and tuned on the concrete
     * {@apilink ConcurrencySystem} its owner holds, never through the pool.
     */
    get system(): IConcurrencySystem;
    /** The estimated number of parallel tasks the governor can currently support. */
    get desiredConcurrency(): number;
    /**
     * The number of parallel tasks currently booked against the governor. When it is shared, this counts every
     * borrowing pool's tasks, not just this one's.
     */
    get currentConcurrency(): number;
    /**
     * Runs the auto-scaled pool. Returns a promise that gets resolved or rejected once
     * all the tasks are finished or one of them fails.
     *
     * Throws if the {@apilink IConcurrencySystem|concurrency system} it borrows was never started — the pool assumes
     * a running governor and cannot start one it does not own.
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
     *
     * > *NOTE:* Pausing the pool does not suspend the (possibly shared) {@apilink ConcurrencySystem} — its
     * autoscaling and resource monitoring keep running, since other pools borrowing it may still be active. To silence
     * it during a long pause, its owner can `stop()` and `start()` it again.
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
     * Explicitly check the queue for new tasks. The AutoscaledPool checks the queue for new tasks periodically,
     * every `maybeRunIntervalSecs` seconds. If you want to trigger the processing immediately, use this method.
     */
    notify(): Promise<void>;
    /**
     * Starts a new task
     * if the number of running tasks (current concurrency) is lower than desired concurrency
     * and the system is not currently overloaded
     * and `isTaskReadyFunction()` returns true.
     *
     * It doesn't allow multiple concurrent runs of this method.
     */
    private maybeRunTask;
    /**
     * If there are no running tasks and `isFinishedFunction()` returns true then closes
     * the pool and resolves the pool's promise returned by the run() method.
     *
     * It doesn't allow multiple concurrent runs of this method.
     */
    private maybeFinish;
    /**
     * Cleans up resources.
     */
    private destroy;
}
