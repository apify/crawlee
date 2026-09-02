import { z } from 'zod';

import type { BetterIntervalID } from '@apify/utilities';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';

import type { CrawleeLogger } from '../log.js';
import { serviceLocator } from '../service_locator.js';
import { parseArgument, schemas, validators } from '../validators.js';
import type { LoadSignal } from './load_signal.js';
import { Snapshotter } from './snapshotter.js';
import type { LoadSignalsOptions } from './snapshotter.js';
import type { SystemInfo } from './system_status.js';
import { SystemStatus } from './system_status.js';

const concurrencySchema = z.number().int().gte(1).optional();

// `schemas.anyObject` passes values through by reference, so the load signal instances inside
// `loadSignals` and class instances like loggers keep their prototype.
const concurrencySystemOptionsSchema = z.strictObject({
    maxConcurrency: z.number().int().gte(1).default(200),
    minConcurrency: z.number().int().gte(1).default(1),
    desiredConcurrency: z.number().int().gte(1).optional(),
    desiredConcurrencyRatio: z.number().gt(0).lt(1).default(0.9),
    scaleUpStepRatio: z.number().gt(0).lt(1).default(0.05),
    scaleDownStepRatio: z.number().gt(0).lt(1).default(0.05),
    loggingIntervalSecs: schemas.anyNumber
        .refine((value) => value > 0, 'Expected a number greater than 0')
        .nullish()
        .default(60),
    autoscaleIntervalSecs: schemas.anyNumber
        .refine((value) => value > 0, 'Expected a number greater than 0')
        .default(10),
    loadSignals: schemas.anyObject.default(() => ({})),
    snapshotHistorySecs: schemas.anyNumber.refine((value) => value > 0, 'Expected a number greater than 0').optional(),
    currentHistorySecs: schemas.anyNumber.refine((value) => value > 0, 'Expected a number greater than 0').optional(),
    log: validators.logger.default(() => serviceLocator.getLogger()),
    maxTasksPerMinute: z
        .union([z.number().int().gte(1), z.literal(Number.POSITIVE_INFINITY)])
        .default(Number.POSITIVE_INFINITY),
});

export interface ConcurrencySystemOptions {
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
     * Specifies a period in which the instance logs its state, in seconds.
     * Set to `null` to disable periodic logging.
     * @default 60
     */
    loggingIntervalSecs?: number | null;

    /**
     * Defines in seconds how often the system should attempt to adjust the desired concurrency
     * based on the latest system status. Setting it lower than 1 might have a severe impact on performance.
     * We suggest using a value from 5 to 20.
     * @default 10
     */
    autoscaleIntervalSecs?: number;

    /**
     * The signals that tell the system whether the machine is overloaded: per-resource tuning for the built-in four
     * (memory, event loop, CPU, storage backend) plus any {@apilink LoadSignalsOptions.custom|`custom`}
     * implementations of your own. See {@apilink LoadSignalsOptions}.
     */
    loadSignals?: LoadSignalsOptions;

    /**
     * How far back the **autoscaling** decisions look, in seconds — the window the historical system status is
     * evaluated over, and therefore how much history the signals retain (the memory cost of raising it).
     * @default 30
     */
    snapshotHistorySecs?: number;

    /**
     * How far back the **task-gating** decision looks, in seconds — the window used to judge whether the system is
     * overloaded *right now*, before dispatching one more task. Deliberately shorter than
     * {@apilink ConcurrencySystemOptions.snapshotHistorySecs|`snapshotHistorySecs`}, so that dispatch reacts to
     * spikes quickly while scaling stays stable.
     * @default 5
     */
    currentHistorySecs?: number;

    /**
     * The maximum number of tasks per minute the system can run.
     * By default, this is set to `Infinity`, but you can pass any positive, non-zero integer.
     */
    maxTasksPerMinute?: number;

    log?: CrawleeLogger;
}

/**
 * Identifies *who* is asking a governor for capacity: one {@apilink AutoscaledPool}, or the crawler driving it. The
 * same object is passed on every call a pool makes, so per-consumer state can be keyed off it or off its `id`.
 * @category Scaling
 */
export interface ConcurrencyConsumer {
    /** Process-unique and human-readable — a crawler's is its {@apilink BasicCrawlerOptions.id|`id`} option. */
    readonly id: string;
}

/**
 * The contract between an {@apilink AutoscaledPool} and its concurrency "governor" — the object that answers *is
 * there free compute for one more task?* and tracks the budget that tasks are booked against.
 * {@apilink ConcurrencySystem} is the canonical implementation; the interface lets alternate governors be substituted
 * without depending on its internals.
 *
 * Every allocation method is told which {@apilink ConcurrencyConsumer|consumer} is asking, so an implementation can
 * allocate per consumer. {@apilink ConcurrencySystem} does not: it serves whoever asks first, which can starve a pool
 * that joins a saturated system late.
 * @category Scaling
 */
export interface IConcurrencySystem {
    /**
     * The number of tasks that should currently be running in parallel, assuming a sufficient supply of them. How it
     * is derived is up to the implementation, hence read-only here — but it must always be at least `1`, or a pool
     * could never start the first task.
     */
    readonly desiredConcurrency: number;

    /** The number of parallel tasks currently booked against this governor, regardless of which pool booked them. */
    readonly currentConcurrency: number;

    /**
     * Whether the governor is ready to be booked against. {@apilink AutoscaledPool.run|`pool.run()`} refuses to run
     * when this is `false`. An implementation with no startup lifecycle simply reports `true`.
     */
    readonly isRunning: boolean;

    /**
     * May **one more** task start right now, on behalf of `consumer`? A cheap pre-check the pool consults before
     * querying task readiness.
     *
     * Must **not** enforce rate limits that only make sense for ready tasks (e.g. a per-minute task cap): the pool
     * calls this before knowing whether any task is ready, so refusing here would stall an already-empty queue.
     *
     * Must also return `true` whenever `consumer` has nothing in flight of its own. A `false` sends that pool straight
     * to its finished-check **without** consulting `isTaskReadyFunction`, so a governor that starves an idle pool can
     * make its `run()` resolve while work is still pending. Tracking bookings per consumer answers that directly;
     * {@apilink ConcurrencySystem}, which does not, instead never refuses while
     * {@apilink IConcurrencySystem.currentConcurrency|`currentConcurrency`} is `0`.
     */
    hasCapacityForTask(consumer: ConcurrencyConsumer): boolean;

    /**
     * Books a task against the budget for `consumer`, returning `false` (without booking) when there is no room — the
     * budget is spent, the consumer is over its share, or an implementation-specific rate limit was reached.
     *
     * Must be an *atomic* (synchronous) check-and-book: several pools may share one governor, and a check separated
     * from the booking by an `await` lets two of them claim the last free slot at once.
     */
    tryRegisterTaskStart(consumer: ConcurrencyConsumer): boolean;

    /** Returns a task's slot to `consumer`'s budget. Called once the task settles (resolve or reject). */
    registerTaskEnd(consumer: ConcurrencyConsumer): void;
}

/**
 * The shareable "governor" behind an {@apilink AutoscaledPool}: it decides whether there is free compute for one more
 * task by combining live system load (via an internal {@apilink Snapshotter}) with a concurrency budget it autoscales
 * over time.
 *
 * Sharing one instance between several pools (and therefore several crawlers) caps their *combined* compute, instead
 * of letting each scale independently and oversubscribe the machine.
 *
 * Whoever builds the instance owns its lifecycle: call {@apilink ConcurrencySystem.start|`start()`} before any
 * borrowing pool runs and {@apilink ConcurrencySystem.stop|`stop()`} once they are all done (crawlers do this for the
 * default system they build, never for an injected one). Both calls are idempotent, and the first `stop()` tears the
 * system down for every borrower.
 * @category Scaling
 */
export class ConcurrencySystem implements IConcurrencySystem {
    private readonly log: CrawleeLogger;

    private readonly desiredConcurrencyRatio: number;
    private readonly scaleUpStepRatio: number;
    private readonly scaleDownStepRatio: number;
    readonly #loggingIntervalMillis: number;
    readonly #autoscaleIntervalMillis: number;
    private readonly maxTasksPerMinute: number;

    #minConcurrency: number;
    #maxConcurrency: number;
    #desiredConcurrency: number;
    #currentConcurrency = 0;
    #lastLoggingTime?: number;
    #tasksPerMinute: number[] = Array.from({ length: 60 }, () => 0);

    private readonly snapshotter: Snapshotter;
    readonly #loadSignals: LoadSignal[];
    private readonly systemStatus: SystemStatus;

    #autoscaleInterval?: BetterIntervalID;
    #tasksDonePerSecondInterval?: BetterIntervalID;

    /** Whether the snapshotter and autoscaling intervals are currently running. */
    #running = false;

    /** The in-flight (or completed) startup, memoized so concurrent `start()` calls await one boot. */
    #startPromise?: Promise<void>;

    /** Set once per session, so a pool outliving `stop()` is reported once rather than every half second. */
    #warnedAboutQueryWhileStopped = false;

    constructor(options: ConcurrencySystemOptions = {}) {
        const {
            maxConcurrency,
            minConcurrency,
            desiredConcurrency,
            desiredConcurrencyRatio,
            scaleUpStepRatio,
            scaleDownStepRatio,
            loggingIntervalSecs,
            autoscaleIntervalSecs,
            loadSignals,
            snapshotHistorySecs,
            currentHistorySecs,
            log,
            maxTasksPerMinute,
        } = parseArgument(options, concurrencySystemOptionsSchema, 'ConcurrencySystemOptions');

        this.log = log.child({ prefix: 'ConcurrencySystem' });

        this.desiredConcurrencyRatio = desiredConcurrencyRatio;
        this.scaleUpStepRatio = scaleUpStepRatio;
        this.scaleDownStepRatio = scaleDownStepRatio;
        this.#loggingIntervalMillis = (loggingIntervalSecs ?? 0) * 1000;
        this.#autoscaleIntervalMillis = autoscaleIntervalSecs * 1000;
        this.maxTasksPerMinute = maxTasksPerMinute;

        this.#minConcurrency = minConcurrency;
        this.#maxConcurrency = maxConcurrency;
        this.#desiredConcurrency = desiredConcurrency ?? minConcurrency;
        this.clampDesiredConcurrency();

        this.autoscale = this.autoscale.bind(this);
        this.incrementTasksDonePerSecond = this.incrementTasksDonePerSecond.bind(this);

        // The built-in signals are collected by the snapshotter; custom ones are simply evaluated alongside them.
        const { custom: customLoadSignals = [], ...builtinSignalOptions } = loadSignals;

        this.snapshotter = new Snapshotter(builtinSignalOptions);
        this.#loadSignals = customLoadSignals;
        this.systemStatus = new SystemStatus({
            snapshotter: this.snapshotter,
            loadSignals: customLoadSignals,
            currentHistorySecs,
            // Both windows are requested from the signals explicitly, so a signal's own retention can neither widen
            // nor (given the start context below) narrow what it contributes.
            historySecs: snapshotHistorySecs,
        });
    }

    /**
     * Gets the minimum number of tasks running in parallel.
     */
    get minConcurrency(): number {
        return this.#minConcurrency;
    }

    /**
     * Sets the minimum number of tasks running in parallel.
     *
     * *WARNING:* If you set this value too high with respect to the available system memory and CPU, your code might run extremely slow or crash.
     * If you're not sure, just keep the default value and the concurrency will scale up automatically.
     */
    set minConcurrency(value: number) {
        parseArgument(value, concurrencySchema);
        this.#minConcurrency = value;
        this.clampDesiredConcurrency();
    }

    /**
     * Gets the maximum number of tasks running in parallel.
     */
    get maxConcurrency(): number {
        return this.#maxConcurrency;
    }

    /**
     * Sets the maximum number of tasks running in parallel. Lowering it below the current
     * {@apilink ConcurrencySystem.desiredConcurrency|`desiredConcurrency`} pulls that down to the new ceiling too, so
     * the change takes effect immediately (in-flight tasks are never cancelled — the budget simply drains to the new
     * limit as they settle).
     */
    set maxConcurrency(value: number) {
        parseArgument(value, concurrencySchema);
        this.#maxConcurrency = value;
        this.clampDesiredConcurrency();
    }

    /**
     * Gets the desired concurrency for the system,
     * which is an estimated number of parallel tasks that the system can currently support.
     */
    get desiredConcurrency(): number {
        return this.#desiredConcurrency;
    }

    /**
     * Sets the desired concurrency for the system, i.e. the number of tasks that should be running
     * in parallel if there's large enough supply of tasks.
     */
    set desiredConcurrency(value: number) {
        parseArgument(value, concurrencySchema);
        this.#desiredConcurrency = value;
        this.clampDesiredConcurrency();
    }

    /**
     * Re-establishes `minConcurrency <= desiredConcurrency <= maxConcurrency` after any of the three is retuned.
     * Dispatch gates on the desired value alone, so one stranded above `maxConcurrency` would make the ceiling
     * meaningless. A contradictory pair (`minConcurrency > maxConcurrency`) resolves in favour of the maximum, since
     * that is the limit callers set in order to protect something.
     */
    private clampDesiredConcurrency(): void {
        const atLeastMin = Math.max(this.#desiredConcurrency, this.#minConcurrency);
        this.#desiredConcurrency = Math.min(atLeastMin, this.#maxConcurrency);
    }

    get currentConcurrency(): number {
        return this.#currentConcurrency;
    }

    /** Whether the system is currently monitoring load and autoscaling the budget. */
    get isRunning(): boolean {
        return this.#running;
    }

    /**
     * Boots the underlying snapshotter and the autoscaling interval. Idempotent, so a shared system isn't restarted
     * when handed to another consumer; concurrent callers await one startup. Rejects, leaving nothing running, if a
     * signal fails to start.
     */
    async start(): Promise<void> {
        // Unwound and dropped again on failure, so a later `start()` retries instead of resolving instantly against
        // a system that is down.
        this.#startPromise ??= this.boot().catch(async (error) => {
            this.#startPromise = undefined;
            await this.shutDown();
            throw error;
        });

        await this.#startPromise;
    }

    private async boot(): Promise<void> {
        // Per-session measurement state, reset so a restarted system isn't judged on the previous session. The
        // per-minute window matters most: its ageing interval is cleared while we are down, so starts from before an
        // arbitrarily long stop would otherwise still count against "this minute" and trip the cap immediately.
        this.#tasksPerMinute = Array.from({ length: 60 }, () => 0);
        this.#lastLoggingTime = undefined;
        this.#warnedAboutQueryWhileStopped = false;

        // Signals are told how much history to keep when they start: exactly the longest window they will be sampled
        // over, so nobody has to guess a retention value that matches this system's configuration.
        const startContext = { maxSampleWindowMillis: this.systemStatus.maxSampleWindowMillis };
        await this.snapshotter.start(startContext);
        await Promise.all(this.#loadSignals.map(async (s) => s.start(startContext)));

        this.#autoscaleInterval = betterSetInterval(this.autoscale, this.#autoscaleIntervalMillis);

        if (this.maxTasksPerMinute !== Infinity) {
            this.#tasksDonePerSecondInterval = betterSetInterval(this.incrementTasksDonePerSecond, 1000);
        }

        // Last, so `isRunning` never claims a system whose signals aren't collecting yet.
        this.#running = true;
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await this.stop();
    }

    /**
     * Stops the snapshotter and intervals. Idempotent and safe to call even if the system was never started.
     */
    async stop(): Promise<void> {
        if (this.#startPromise === undefined) {
            return;
        }

        // Waited out rather than interrupted, or the intervals a starting signal is about to register outlive us.
        await this.#startPromise.catch(() => {});
        this.#startPromise = undefined;
        this.#running = false;

        await this.shutDown();
    }

    private async shutDown(): Promise<void> {
        if (this.#autoscaleInterval) betterClearInterval(this.#autoscaleInterval);
        if (this.#tasksDonePerSecondInterval) betterClearInterval(this.#tasksDonePerSecondInterval);
        await this.snapshotter.stop();
        await Promise.all(this.#loadSignals.map(async (s) => s.stop()));
    }

    /**
     * Reports, once per session, that capacity is being queried on a system that isn't running — a mistake nothing
     * else catches, since {@apilink AutoscaledPool.run|`pool.run()`} only checks
     * {@apilink ConcurrencySystem.isRunning|`isRunning`} on the way in. Both the overload verdict and
     * `desiredConcurrency` are frozen at that point, so the borrowing pool would otherwise just quietly mis-scale.
     */
    private warnIfNotRunning(): void {
        if (this.#running || this.#warnedAboutQueryWhileStopped) {
            return;
        }

        this.#warnedAboutQueryWhileStopped = true;
        this.log.warning(
            'Capacity is being queried on a ConcurrencySystem that is not running, so system load is no longer being ' +
                'monitored and the concurrency will no longer be adjusted. Whoever creates a ConcurrencySystem owns ' +
                'its lifecycle: call `await concurrencySystem.stop()` only once every pool and crawler borrowing it ' +
                'has finished.',
        );
    }

    /**
     * May **one more** task start right now? Returns `false` when the shared budget is spent (desired concurrency
     * reached) or when the machine is overloaded past `minConcurrency`.
     *
     * One budget for the whole machine, so the asking consumer is ignored — and therefore optional here, unlike in the
     * interface, letting the answer be queried directly.
     */
    hasCapacityForTask(_consumer?: ConcurrencyConsumer): boolean {
        this.warnIfNotRunning();

        if (this.#currentConcurrency >= this.#desiredConcurrency) {
            this.log.perf('Task will not run. Desired concurrency achieved.');
            return false;
        }

        const currentStatus = this.systemStatus.getCurrentStatus();
        const { isSystemIdle } = currentStatus;
        if (!isSystemIdle && this.#currentConcurrency >= this.#minConcurrency) {
            this.log.perf(
                'Task will not be run. System is overloaded.',
                currentStatus as unknown as Record<string, unknown>,
            );
            return false;
        }

        return true;
    }

    /** Whether the per-minute task cap has been reached. */
    private get isOverMaxRequestLimit(): boolean {
        if (this.maxTasksPerMinute === Infinity) {
            return false;
        }

        return this.#tasksPerMinute.reduce((acc, curr) => acc + curr, 0) >= this.maxTasksPerMinute;
    }

    /**
     * Atomically books a task against the shared budget: re-checks
     * {@apilink ConcurrencySystem.hasCapacityForTask|`hasCapacityForTask()`} plus the per-minute task cap and
     * increments the current concurrency in one synchronous step, returning `false` (without booking) when there is no
     * room. Call right before the task actually runs.
     *
     * The cap is enforced here rather than in the pre-check so that an empty queue never blocks the pool for a whole
     * extra minute.
     */
    tryRegisterTaskStart(consumer?: ConcurrencyConsumer): boolean {
        if (!this.hasCapacityForTask(consumer)) {
            return false;
        }

        if (this.isOverMaxRequestLimit) {
            this.log.perf('Task will not run. Maximum tasks per minute reached.');
            return false;
        }

        this.#currentConcurrency++;
        this.#tasksPerMinute[0]++;
        return true;
    }

    /** Returns a slot to the shared budget, whoever booked it. */
    registerTaskEnd(_consumer?: ConcurrencyConsumer): void {
        this.#currentConcurrency--;
    }

    /**
     * What the system currently makes of the machine: the per-signal overload verdicts, evaluated over the
     * task-gating window, exactly as {@apilink ConcurrencySystem.hasCapacityForTask|`hasCapacityForTask()`} sees them.
     * The one public window into load monitoring — useful for answering *why* a crawl is not scaling up.
     */
    getCurrentStatus(): SystemInfo {
        return this.systemStatus.getCurrentStatus();
    }

    /**
     * Evaluates the historical system status and scales the shared desired concurrency up or down accordingly. Driven
     * by the autoscaling interval started in {@apilink ConcurrencySystem.start|`start()`}.
     */
    private autoscale(intervalCallback: () => void): void {
        if (this.isOverMaxRequestLimit) return intervalCallback();

        const systemStatus = this.systemStatus.getHistoricalStatus();
        const { isSystemIdle } = systemStatus;
        const weAreNotAtMax = this.#desiredConcurrency < this.#maxConcurrency;
        const minCurrentConcurrency = Math.floor(this.#desiredConcurrency * this.desiredConcurrencyRatio);
        const weAreReachingDesiredConcurrency = this.#currentConcurrency >= minCurrentConcurrency;

        if (isSystemIdle && weAreNotAtMax && weAreReachingDesiredConcurrency) this.scaleUp(systemStatus);

        const isSystemOverloaded = !isSystemIdle;
        const weAreNotAtMin = this.#desiredConcurrency > this.#minConcurrency;

        if (isSystemOverloaded && weAreNotAtMin) this.scaleDown(systemStatus);

        if (this.#loggingIntervalMillis > 0) {
            const now = Date.now();

            if (this.#lastLoggingTime == null) {
                this.#lastLoggingTime = now;
            } else if (now > this.#lastLoggingTime + this.#loggingIntervalMillis) {
                this.#lastLoggingTime = now;
                this.log.info('state', {
                    currentConcurrency: this.#currentConcurrency,
                    desiredConcurrency: this.#desiredConcurrency,
                    systemStatus,
                });
            }
        }

        return intervalCallback();
    }

    /**
     * Scales the system up by increasing the desired concurrency by the scaleUpStepRatio.
     */
    private scaleUp(systemStatus: SystemInfo): void {
        const step = Math.ceil(this.#desiredConcurrency * this.scaleUpStepRatio);
        this.#desiredConcurrency = Math.min(this.#maxConcurrency, this.#desiredConcurrency + step);
        this.log.debug('scaling up', {
            oldConcurrency: this.#desiredConcurrency - step,
            newConcurrency: this.#desiredConcurrency,
            systemStatus,
        });
    }

    /**
     * Scales the system down by decreasing the desired concurrency by the scaleDownStepRatio.
     */
    private scaleDown(systemStatus: SystemInfo): void {
        const step = Math.ceil(this.#desiredConcurrency * this.scaleDownStepRatio);
        this.#desiredConcurrency = Math.max(this.#minConcurrency, this.#desiredConcurrency - step);
        this.log.debug('scaling down', {
            oldConcurrency: this.#desiredConcurrency + step,
            newConcurrency: this.#desiredConcurrency,
            systemStatus,
        });
    }

    private incrementTasksDonePerSecond(intervalCallback: () => void): void {
        this.#tasksPerMinute.unshift(0);
        this.#tasksPerMinute.pop();

        return intervalCallback();
    }
}
