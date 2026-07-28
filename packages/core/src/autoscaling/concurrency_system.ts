import ow from 'ow';

import type { BetterIntervalID } from '@apify/utilities';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';

import type { CrawleeLogger } from '../log.js';
import { serviceLocator } from '../service_locator.js';
import type { LoadSignal } from './load_signal.js';
import { DEFAULT_SNAPSHOT_HISTORY_SECS, Snapshotter } from './snapshotter.js';
import type { SnapshotterOptions } from './snapshotter.js';
import type { SystemInfo } from './system_status.js';
import { DEFAULT_CURRENT_HISTORY_SECS, SystemStatus } from './system_status.js';

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
     * Fine-tuning of the built-in resource monitoring (per-signal snapshot intervals, overload limits and ratios,
     * and the snapshot history window). See {@apilink SnapshotterOptions}.
     */
    snapshotterOptions?: SnapshotterOptions;

    /**
     * Custom {@apilink LoadSignal} implementations, evaluated alongside the built-in memory, CPU, event loop and
     * client signals. If any signal reports overload, the system is considered overloaded. The system drives the
     * lifecycle of the supplied signals (they are started and stopped together with it).
     */
    loadSignals?: LoadSignal[];

    /**
     * How far back the current system status looks when deciding whether the system is overloaded *right now*
     * (as opposed to the full snapshot history the autoscaling decisions use), in seconds.
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
 * The contract between an {@apilink AutoscaledPool} and its concurrency "governor" — the object that answers *is
 * there free compute for one more task?* and tracks the budget that tasks are booked against.
 * {@apilink ConcurrencySystem} is the canonical implementation; the interface lets alternate governors be substituted
 * without depending on its internals.
 *
 * {@apilink IConcurrencySystem.tryRegisterTaskStart|`tryRegisterTaskStart()`} must be an *atomic* (synchronous)
 * check-and-book — several pools may share one governor, and a check separated from the booking by an `await` lets two
 * of them claim the last free slot at once.
 * @category Scaling
 */
export interface IConcurrencySystem {
    /**
     * The number of tasks that should currently be running in parallel, assuming a sufficient supply of them. How it
     * is derived (autoscaling, fixed configuration, an external signal) is up to the implementation — which is why it
     * is read-only here: tuning knobs live on the concrete instance its owner holds.
     */
    readonly desiredConcurrency: number;

    /**
     * The number of parallel tasks currently booked against this governor, regardless of which pool booked them.
     */
    readonly currentConcurrency: number;

    /**
     * Whether a governor that needs starting has actually been started. {@apilink AutoscaledPool.run|`pool.run()`}
     * refuses to run when this is `false`, rather than proceed against a governor that is not yet functional. Omit the
     * member entirely if the implementation has no startup lifecycle; only an explicit `false` is treated as an error.
     */
    readonly isRunning?: boolean;

    /**
     * May **one more** task start right now? A cheap pre-check the pool consults before querying task readiness; the
     * booking itself happens in {@apilink IConcurrencySystem.tryRegisterTaskStart|`tryRegisterTaskStart()`}.
     *
     * Must **not** enforce rate limits that only make sense for ready tasks (e.g. a per-minute task cap) — the pool
     * calls this before knowing whether any task is ready, so a refusal here would stall an already-empty queue.
     */
    hasCapacityForTask(): boolean;

    /**
     * Atomically books a task against the budget, returning `false` (without booking) when there is no room — either
     * the concurrency budget is spent, or an implementation-specific rate limit (e.g. a cap on tasks per minute) was
     * reached.
     */
    tryRegisterTaskStart(): boolean;

    /**
     * Returns a task's slot to the budget. Called once the task settles (resolve or reject).
     */
    registerTaskEnd(): void;
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
    private readonly loggingIntervalMillis: number;
    private readonly autoscaleIntervalMillis: number;
    private readonly maxTasksPerMinute: number;

    private _minConcurrency: number;
    private _maxConcurrency: number;
    private _desiredConcurrency: number;
    private _currentConcurrency = 0;
    private lastLoggingTime?: number;
    private _tasksPerMinute: number[] = Array.from({ length: 60 }, () => 0);

    private readonly snapshotter: Snapshotter;
    private readonly loadSignals: LoadSignal[];

    /**
     * The longest window any signal will be sampled over, handed to each of them at
     * {@apilink ConcurrencySystem.start|`start()`} so they retain exactly that much history.
     */
    private readonly maxSampleWindowMillis: number;
    private readonly systemStatus: SystemStatus;

    private autoscaleInterval?: BetterIntervalID;
    private tasksDonePerSecondInterval?: BetterIntervalID;

    /** Whether the snapshotter and autoscaling intervals are currently running. */
    private running = false;

    constructor(options: ConcurrencySystemOptions = {}) {
        ow(
            options,
            ow.object.exactShape({
                maxConcurrency: ow.optional.number.integer.greaterThanOrEqual(1),
                minConcurrency: ow.optional.number.integer.greaterThanOrEqual(1),
                desiredConcurrency: ow.optional.number.integer.greaterThanOrEqual(1),
                desiredConcurrencyRatio: ow.optional.number.greaterThan(0).lessThan(1),
                scaleUpStepRatio: ow.optional.number.greaterThan(0).lessThan(1),
                scaleDownStepRatio: ow.optional.number.greaterThan(0).lessThan(1),
                loggingIntervalSecs: ow.any(ow.number.greaterThan(0), ow.nullOrUndefined),
                autoscaleIntervalSecs: ow.optional.number.greaterThan(0),
                snapshotterOptions: ow.optional.object,
                loadSignals: ow.optional.array,
                currentHistorySecs: ow.optional.number.greaterThan(0),
                log: ow.optional.object,
                maxTasksPerMinute: ow.optional.number.integerOrInfinite.greaterThanOrEqual(1),
            }),
        );

        const {
            maxConcurrency = 200,
            minConcurrency = 1,
            desiredConcurrency,
            desiredConcurrencyRatio = 0.9,
            scaleUpStepRatio = 0.05,
            scaleDownStepRatio = 0.05,
            loggingIntervalSecs = 60,
            autoscaleIntervalSecs = 10,
            snapshotterOptions,
            loadSignals = [],
            currentHistorySecs,
            log = serviceLocator.getLogger(),
            maxTasksPerMinute = Infinity,
        } = options;

        this.log = log.child({ prefix: 'ConcurrencySystem' });

        this.desiredConcurrencyRatio = desiredConcurrencyRatio;
        this.scaleUpStepRatio = scaleUpStepRatio;
        this.scaleDownStepRatio = scaleDownStepRatio;
        this.loggingIntervalMillis = (loggingIntervalSecs ?? 0) * 1000;
        this.autoscaleIntervalMillis = autoscaleIntervalSecs * 1000;
        this.maxTasksPerMinute = maxTasksPerMinute;

        this._minConcurrency = minConcurrency;
        this._maxConcurrency = maxConcurrency;
        this._desiredConcurrency = Math.min(desiredConcurrency ?? minConcurrency, maxConcurrency);

        this._autoscale = this._autoscale.bind(this);
        this._incrementTasksDonePerSecond = this._incrementTasksDonePerSecond.bind(this);

        this.snapshotter = new Snapshotter({
            ...snapshotterOptions,
            log: this.log,
        });
        this.loadSignals = loadSignals;
        this.systemStatus = new SystemStatus({
            snapshotter: this.snapshotter,
            loadSignals,
            currentHistorySecs,
            // Both windows are requested from the signals explicitly, so a signal's own retention can neither widen
            // nor (given the start context below) narrow what it contributes.
            historySecs: snapshotterOptions?.snapshotHistorySecs,
        });

        // Signals are told how much history to keep when they start: exactly the longest window they will be sampled
        // over, so nobody has to guess a retention value that matches this system's configuration.
        this.maxSampleWindowMillis =
            Math.max(
                currentHistorySecs ?? DEFAULT_CURRENT_HISTORY_SECS,
                snapshotterOptions?.snapshotHistorySecs ?? DEFAULT_SNAPSHOT_HISTORY_SECS,
            ) * 1000;
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
     * Gets the desired concurrency for the system,
     * which is an estimated number of parallel tasks that the system can currently support.
     */
    get desiredConcurrency(): number {
        return this._desiredConcurrency;
    }

    /**
     * Sets the desired concurrency for the system, i.e. the number of tasks that should be running
     * in parallel if there's large enough supply of tasks.
     */
    set desiredConcurrency(value: number) {
        ow(value, ow.optional.number.integer.greaterThanOrEqual(1));
        this._desiredConcurrency = value;
    }

    get currentConcurrency(): number {
        return this._currentConcurrency;
    }

    /** Whether the system is currently monitoring load and autoscaling the budget. */
    get isRunning(): boolean {
        return this.running;
    }

    /**
     * Boots the underlying snapshotter and the autoscaling interval. Idempotent, so a shared system isn't restarted
     * when handed to another consumer.
     */
    async start(): Promise<void> {
        if (this.running) {
            return;
        }
        this.running = true;

        const startContext = { maxSampleWindowMillis: this.maxSampleWindowMillis };
        await this.snapshotter.start(startContext);
        await Promise.all(this.loadSignals.map(async (s) => s.start(startContext)));

        this.autoscaleInterval = betterSetInterval(this._autoscale, this.autoscaleIntervalMillis);

        if (this.maxTasksPerMinute !== Infinity) {
            this.tasksDonePerSecondInterval = betterSetInterval(this._incrementTasksDonePerSecond, 1000);
        }
    }

    /**
     * Stops the snapshotter and intervals. Idempotent and safe to call even if the system was never started.
     */
    async stop(): Promise<void> {
        if (!this.running) {
            return;
        }
        this.running = false;

        if (this.autoscaleInterval) betterClearInterval(this.autoscaleInterval);
        if (this.tasksDonePerSecondInterval) betterClearInterval(this.tasksDonePerSecondInterval);
        await this.snapshotter.stop();
        await Promise.all(this.loadSignals.map(async (s) => s.stop()));
    }

    /**
     * May **one more** task start right now? Returns `false` when the shared budget is spent (desired concurrency
     * reached) or when the machine is overloaded past `minConcurrency`.
     */
    hasCapacityForTask(): boolean {
        if (this._currentConcurrency >= this._desiredConcurrency) {
            this.log.perf('Task will not run. Desired concurrency achieved.');
            return false;
        }

        const currentStatus = this.systemStatus.getCurrentStatus();
        const { isSystemIdle } = currentStatus;
        if (!isSystemIdle && this._currentConcurrency >= this._minConcurrency) {
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

        return this._tasksPerMinute.reduce((acc, curr) => acc + curr, 0) >= this.maxTasksPerMinute;
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
    tryRegisterTaskStart(): boolean {
        if (!this.hasCapacityForTask()) {
            return false;
        }

        if (this.isOverMaxRequestLimit) {
            this.log.perf('Task will not run. Maximum tasks per minute reached.');
            return false;
        }

        this._currentConcurrency++;
        this._tasksPerMinute[0]++;
        return true;
    }

    registerTaskEnd(): void {
        this._currentConcurrency--;
    }

    /** Reads the current live system status (used by the pool for logging/telemetry). */
    getCurrentStatus(): SystemInfo {
        return this.systemStatus.getCurrentStatus();
    }

    /**
     * Evaluates the historical system status and scales the shared desired concurrency up or down accordingly. Driven
     * by the autoscaling interval started in {@apilink ConcurrencySystem.start|`start()`}.
     */
    private _autoscale(intervalCallback: () => void): void {
        if (this.isOverMaxRequestLimit) return intervalCallback();

        const systemStatus = this.systemStatus.getHistoricalStatus();
        const { isSystemIdle } = systemStatus;
        const weAreNotAtMax = this._desiredConcurrency < this._maxConcurrency;
        const minCurrentConcurrency = Math.floor(this._desiredConcurrency * this.desiredConcurrencyRatio);
        const weAreReachingDesiredConcurrency = this._currentConcurrency >= minCurrentConcurrency;

        if (isSystemIdle && weAreNotAtMax && weAreReachingDesiredConcurrency) this._scaleUp(systemStatus);

        const isSystemOverloaded = !isSystemIdle;
        const weAreNotAtMin = this._desiredConcurrency > this._minConcurrency;

        if (isSystemOverloaded && weAreNotAtMin) this._scaleDown(systemStatus);

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

        return intervalCallback();
    }

    /**
     * Scales the system up by increasing the desired concurrency by the scaleUpStepRatio.
     */
    private _scaleUp(systemStatus: SystemInfo): void {
        const step = Math.ceil(this._desiredConcurrency * this.scaleUpStepRatio);
        this._desiredConcurrency = Math.min(this._maxConcurrency, this._desiredConcurrency + step);
        this.log.debug('scaling up', {
            oldConcurrency: this._desiredConcurrency - step,
            newConcurrency: this._desiredConcurrency,
            systemStatus,
        });
    }

    /**
     * Scales the system down by decreasing the desired concurrency by the scaleDownStepRatio.
     */
    private _scaleDown(systemStatus: SystemInfo): void {
        const step = Math.ceil(this._desiredConcurrency * this.scaleDownStepRatio);
        this._desiredConcurrency = Math.max(this._minConcurrency, this._desiredConcurrency - step);
        this.log.debug('scaling down', {
            oldConcurrency: this._desiredConcurrency + step,
            newConcurrency: this._desiredConcurrency,
            systemStatus,
        });
    }

    private _incrementTasksDonePerSecond(intervalCallback: () => void): void {
        this._tasksPerMinute.unshift(0);
        this._tasksPerMinute.pop();

        return intervalCallback();
    }
}
