import ow from 'ow';

import { addTimeoutToPromise } from '@apify/timeout';
import type { BetterIntervalID } from '@apify/utilities';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';

import type { ConcurrencySystem } from './concurrency_system.js';
import { CriticalError } from '../errors.js';
import type { CrawleeLogger } from '../log.js';
import { serviceLocator } from '../service_locator.js';

/**
 * The task-readiness predicates a consumer may supply to steer an {@apilink AutoscaledPool}'s run loop. These are the
 * parts of the loop a higher-level driver (e.g. a crawler) legitimately overrides, as opposed to the crawler-owned
 * `runTaskFunction`. Kept as its own interface so such drivers can expose exactly this subset without utility types.
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

/**
 * Everything that describes the pool's *task loop* — the work it runs and how often — without the (injected)
 * {@apilink ConcurrencySystem} governor. A driver that builds the pool but supplies the governor separately (e.g.
 * {@apilink BasicCrawler}) holds exactly this, so it needs no `Omit`/`Pick` gymnastics.
 */
export interface AutoscaledPoolTaskLoopOptions extends AutoscaledPoolPredicateOptions {
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

export interface AutoscaledPoolOptions extends AutoscaledPoolTaskLoopOptions {
    /**
     * The {@apilink ConcurrencySystem} that governs how much this pool may scale — the load-and-budget "governor"
     * that decides whether there is free compute for one more task. **Required.** Share a single instance across
     * multiple pools (and therefore multiple crawlers) to cap their *combined* concurrency against one budget instead
     * of each pool scaling independently.
     *
     * All concurrency/scaling/snapshotter configuration (min/max/desired concurrency, scaling ratios, `maxTasksPerMinute`,
     * snapshotter and system-status tuning) lives on the {@apilink ConcurrencySystem}, not here — the pool only owns the
     * task loop (`runTaskFunction`/`isTaskReadyFunction`/`isFinishedFunction`) and its cadence.
     */
    concurrencySystem: ConcurrencySystem;
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
    private readonly log: CrawleeLogger;

    // Configurable properties.
    private readonly maybeRunIntervalMillis: number;
    private readonly taskTimeoutMillis: number;
    private readonly runTaskFunction: () => Promise<unknown>;
    private readonly isFinishedFunction: () => Promise<boolean>;
    private readonly isTaskReadyFunction: () => Promise<boolean>;

    private readonly concurrencySystem: ConcurrencySystem;

    // Internal properties.
    private isStopped = false;
    private resolve: ((val?: unknown) => void) | null = null;
    private reject: ((reason?: unknown) => void) | null = null;
    private maybeRunInterval!: BetterIntervalID;
    private queryingIsTaskReady!: boolean;
    private queryingIsFinished!: boolean;

    /**
     * This pool's *own* in-flight task count. Distinct from {@apilink AutoscaledPool.currentConcurrency}, which reflects
     * the (possibly shared) governor's total across every borrowing pool — `pause()` and `maybeFinish()` care only
     * about this pool draining, not about work happening in other pools sharing the same budget.
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
     * The load-and-budget governor backing this pool. Read it to inject the *same* budget into another pool
     * (see {@apilink AutoscaledPoolOptions.concurrencySystem}) so their combined compute is capped.
     */
    get system(): ConcurrencySystem {
        return this.concurrencySystem;
    }

    /**
     * Gets the minimum number of tasks running in parallel.
     */
    get minConcurrency(): number {
        return this.concurrencySystem.minConcurrency;
    }

    /**
     * Sets the minimum number of tasks running in parallel.
     *
     * *WARNING:* If you set this value too high with respect to the available system memory and CPU, your code might run extremely slow or crash.
     * If you're not sure, just keep the default value and the concurrency will scale up automatically.
     */
    set minConcurrency(value: number) {
        this.concurrencySystem.minConcurrency = value;
    }

    /**
     * Gets the maximum number of tasks running in parallel.
     */
    get maxConcurrency(): number {
        return this.concurrencySystem.maxConcurrency;
    }

    /**
     * Sets the maximum number of tasks running in parallel.
     */
    set maxConcurrency(value: number) {
        this.concurrencySystem.maxConcurrency = value;
    }

    /**
     * Gets the desired concurrency for the pool,
     * which is an estimated number of parallel tasks that the system can currently support.
     */
    get desiredConcurrency(): number {
        return this.concurrencySystem.desiredConcurrency;
    }

    /**
     * Sets the desired concurrency for the pool, i.e. the number of tasks that should be running
     * in parallel if there's large enough supply of tasks.
     */
    set desiredConcurrency(value: number) {
        this.concurrencySystem.desiredConcurrency = value;
    }

    /**
     * Gets the number of parallel tasks currently running in the pool.
     */
    get currentConcurrency(): number {
        return this.concurrencySystem.currentConcurrency;
    }

    /**
     * Runs the auto-scaled pool. Returns a promise that gets resolved or rejected once
     * all the tasks are finished or one of them fails.
     */
    async run(): Promise<void> {
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
        // - the shared budget has no room (desired concurrency reached, or system overloaded past minConcurrency).
        if (!this.concurrencySystem.hasCapacityForTask()) {
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
            return this.maybeFinish();
        }

        // - we have already reached the maximum tasks per minute
        // we need to check this *after* checking if a task is ready to prevent hanging the pool
        // for an extra minute if there are no more tasks
        if (this.concurrencySystem.isOverMaxRequestLimit) {
            this.log.perf('Task will not run. Maximum tasks per minute reached.');
            return done();
        }

        // - the shared budget may have been spent while we awaited `isTaskReadyFunction` — with several pools
        // borrowing one ConcurrencySystem, another pool can book the last free slot during that gap. The booking
        // is therefore an atomic re-check-and-increment on the system; the `hasCapacityForTask()` call above is
        // only a cheap early-out that avoids querying task readiness in vain.
        if (!this.concurrencySystem.tryRegisterTaskStart()) {
            return done();
        }

        try {
            // Everything's fine. Run task.
            this.ownConcurrency++;
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
            this.concurrencySystem.registerTaskEnd();
            this.ownConcurrency--;
            // Run task after the previous one finished.
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
