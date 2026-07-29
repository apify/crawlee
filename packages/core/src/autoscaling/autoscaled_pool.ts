import ow from 'ow';

import { addTimeoutToPromise } from '@apify/timeout';
import type { BetterIntervalID } from '@apify/utilities';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';

import type { IConcurrencySystem } from './concurrency_system.js';
import { CriticalError } from '../errors.js';
import type { CrawleeLogger } from '../log.js';
import { serviceLocator } from '../service_locator.js';

/**
 * The task-readiness predicates a consumer may supply to steer an {@apilink AutoscaledPool}'s run loop — the parts of
 * the loop a higher-level driver (e.g. a crawler) legitimately overrides, as opposed to the crawler-owned
 * `runTaskFunction`.
 */
export interface AutoscaledPoolPredicateOptions {
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
}

export interface AutoscaledPoolOptions extends AutoscaledPoolPredicateOptions {
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
 * {@apilink AutoscaledPoolPredicateOptions.isTaskReadyFunction|`isTaskReadyFunction`} and
 * {@apilink AutoscaledPoolPredicateOptions.isFinishedFunction|`isFinishedFunction`}.
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
 * @category Scaling
 */
export class AutoscaledPool {
    private readonly log: CrawleeLogger;

    // Configurable properties.
    private readonly maybeRunIntervalMillis: number;
    private readonly taskTimeoutMillis: number;
    private readonly runTaskFunction: () => Promise<unknown>;
    private readonly isFinishedFunction: () => Promise<boolean>;
    private readonly isTaskReadyFunction: () => Promise<boolean>;

    private readonly concurrencySystem: IConcurrencySystem;

    // Internal properties.
    private isStopped = false;
    private resolve: ((val?: unknown) => void) | null = null;
    private reject: ((reason?: unknown) => void) | null = null;
    private maybeRunInterval!: BetterIntervalID;
    private queryingIsTaskReady!: boolean;
    private queryingIsFinished!: boolean;

    /**
     * This pool's *own* in-flight task count, as opposed to {@apilink AutoscaledPool.currentConcurrency}, which is the
     * (possibly shared) governor's total. `pause()` and `maybeFinish()` care only about this pool draining.
     */
    private ownConcurrency = 0;

    constructor(options: AutoscaledPoolOptions) {
        ow(
            options,
            ow.object.exactShape({
                runTaskFunction: ow.function,
                isFinishedFunction: ow.function,
                isTaskReadyFunction: ow.function,
                maybeRunIntervalSecs: ow.optional.number.greaterThan(0),
                taskTimeoutSecs: ow.optional.number.greaterThanOrEqual(0),
                log: ow.optional.object,
                concurrencySystem: ow.object,
            }),
        );

        const {
            runTaskFunction,
            isFinishedFunction,
            isTaskReadyFunction,
            maybeRunIntervalSecs = 0.5,
            taskTimeoutSecs = 0,
            log = serviceLocator.getLogger(),
            concurrencySystem,
        } = options;

        this.log = log.child({ prefix: 'AutoscaledPool' });

        // Configurable properties.
        this.maybeRunIntervalMillis = maybeRunIntervalSecs * 1000;
        this.taskTimeoutMillis = taskTimeoutSecs * 1000;
        this.runTaskFunction = runTaskFunction;
        this.isFinishedFunction = isFinishedFunction;
        this.isTaskReadyFunction = isTaskReadyFunction;

        this.concurrencySystem = concurrencySystem;

        // Internal properties.
        this.isStopped = false;
        this.resolve = null;
        this.reject = null;
        this.maybeRunTask = this.maybeRunTask.bind(this);
    }

    /**
     * The governor backing this pool, as supplied to the constructor — exposed as the read-only
     * {@apilink IConcurrencySystem} contract.
     *
     * This and the two getters below are telemetry only: concurrency is configured and tuned on the concrete
     * {@apilink ConcurrencySystem} its owner holds, never through the pool.
     */
    get system(): IConcurrencySystem {
        return this.concurrencySystem;
    }

    /** The estimated number of parallel tasks the governor can currently support. */
    get desiredConcurrency(): number {
        return this.concurrencySystem.desiredConcurrency;
    }

    /**
     * The number of parallel tasks currently booked against the governor. When it is shared, this counts every
     * borrowing pool's tasks, not just this one's.
     */
    get currentConcurrency(): number {
        return this.concurrencySystem.currentConcurrency;
    }

    /**
     * Runs the auto-scaled pool. Returns a promise that gets resolved or rejected once
     * all the tasks are finished or one of them fails.
     *
     * Throws if the {@apilink IConcurrencySystem|concurrency system} it borrows was never started — the pool assumes
     * a running governor and cannot start one it does not own.
     */
    async run(): Promise<void> {
        // Checked here, on an awaited path — the capacity queries inside the task loop run from intervals and
        // `setImmediate`, where a throw would become an unhandled rejection and hang `run()` forever.
        if (!this.concurrencySystem.isRunning) {
            throw new CriticalError(
                'The ConcurrencySystem this AutoscaledPool borrows has not been started, so system load would not be ' +
                    'monitored and the concurrency would never be adjusted. Whoever creates a ConcurrencySystem owns ' +
                    'its lifecycle: call `await concurrencySystem.start()` before running the pools or crawlers that ' +
                    'use it, and `await concurrencySystem.stop()` once they are all done.',
            );
        }

        const poolPromise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });

        // This is here because if we scale down to let's say 1, then after each promise is finished
        // this.maybeRunTask() doesn't trigger another one. So if that 1 instance gets stuck it results
        // in the crawler getting stuck and even after scaling up it never triggers another promise.
        this.maybeRunInterval = betterSetInterval(this.maybeRunTask, this.maybeRunIntervalMillis);

        try {
            await poolPromise;
        } finally {
            // If resolve is null, the pool is already destroyed.
            if (this.resolve) await this.destroy();
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
            await this.destroy();
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
     *
     * > *NOTE:* Pausing the pool does not suspend the (possibly shared) {@apilink ConcurrencySystem} — its
     * autoscaling and resource monitoring keep running, since other pools borrowing the same system may still be
     * active. To silence the system entirely during a long pause, its owner can `stop()` it and `start()` it again
     * before resuming.
     */
    async pause(timeoutSecs?: number): Promise<void> {
        if (this.isStopped) return;
        this.isStopped = true;
        await new Promise<void>((resolve, reject) => {
            let timeout: NodeJS.Timeout;
            let interval: NodeJS.Timeout;
            if (timeoutSecs) {
                timeout = setTimeout(() => {
                    // Clean up the polling interval to prevent it from leaking on timeout.
                    clearInterval(interval);
                    const err = new Error(
                        "The pool's running tasks did not finish" +
                            `in ${timeoutSecs} secs after pool.pause() invocation.`,
                    );
                    reject(err);
                }, timeoutSecs);
            }

            interval = setInterval(() => {
                if (this.ownConcurrency <= 0) {
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
     * Explicitly check the queue for new tasks. The AutoscaledPool checks the queue for new tasks periodically,
     * every `maybeRunIntervalSecs` seconds. If you want to trigger the processing immediately, use this method.
     */
    async notify(): Promise<void> {
        setImmediate(this.maybeRunTask);
    }

    /**
     * Starts a new task
     * if the number of running tasks (current concurrency) is lower than desired concurrency
     * and the system is not currently overloaded
     * and this.isTaskReadyFunction() returns true.
     *
     * It doesn't allow multiple concurrent runs of this method.
     */
    private async maybeRunTask(intervalCallback?: () => void): Promise<void> {
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
        // - the budget has room.
        if (!this.concurrencySystem.hasCapacityForTask()) {
            done();
            // A shared governor's budget can stay saturated by another pool indefinitely, so we still have to be able
            // to notice that *this* pool has run out of work — `maybeFinish()` is the only thing that ever resolves
            // `run()`. It no-ops while this pool has tasks of its own in flight, which is every case in which an
            // unshared governor reports no capacity.
            return this.maybeFinish();
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
            return this.maybeFinish();
        }

        // - the budget still has room. Re-checked atomically, because another pool sharing the governor may have taken
        // the last free slot while we awaited `isTaskReadyFunction` above.
        if (!this.concurrencySystem.tryRegisterTaskStart()) {
            return done();
        }

        this.ownConcurrency++;

        try {
            // Everything's fine. Run task.
            // Try to run next task to build up concurrency,
            // but defer it so it doesn't create a cycle.
            setImmediate(this.maybeRunTask);

            // We need to restart interval here, so that it doesn't get blocked by a stalled task.
            done();

            // Execute the current task.
            this.log.perf('Running a task.');

            if (this.taskTimeoutMillis > 0) {
                await addTimeoutToPromise(
                    async () => this.runTaskFunction(),
                    this.taskTimeoutMillis,
                    `runTaskFunction timed out after ${this.taskTimeoutMillis / 1000} seconds.`,
                );
            } else {
                await this.runTaskFunction();
            }

            this.log.perf('Task finished.');
            // Run task after the previous one finished. Only on success: a failed task rejects the pool, and
            // nudging the loop afterwards could start work on an already destroyed pool.
            setImmediate(this.maybeRunTask);
        } catch (e) {
            const err = e as Error;
            this.log.perf('Running a task failed.');
            // We might have already rejected this promise.
            if (this.reject) {
                // No need to log all concurrent errors.
                if (
                    // avoid reprinting the same critical error multiple times, as it will be printed by Nodejs at the end anyway
                    !(e instanceof CriticalError)
                ) {
                    this.log.exception(err, 'runTaskFunction failed.');
                }
                this.reject(err);
            }
        } finally {
            this.concurrencySystem.registerTaskEnd();
            this.ownConcurrency--;
        }

        return undefined;
    }

    /**
     * If there are no running tasks and this.isFinishedFunction() returns true then closes
     * the pool and resolves the pool's promise returned by the run() method.
     *
     * It doesn't allow multiple concurrent runs of this method.
     */
    private async maybeFinish(): Promise<void> {
        if (this.queryingIsFinished) return;
        if (this.ownConcurrency > 0) return;

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
    private async destroy(): Promise<void> {
        this.resolve = null;
        this.reject = null;

        betterClearInterval(this.maybeRunInterval);
    }
}
