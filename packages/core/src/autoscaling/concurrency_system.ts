import ow from 'ow';

import type { BetterIntervalID } from '@apify/utilities';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';

import type { CrawleeLogger } from '../log.js';
import { serviceLocator } from '../service_locator.js';
import type { LoadSignal } from './load_signal.js';
import { Snapshotter } from './snapshotter.js';
import type { SnapshotterOptions } from './snapshotter.js';
import type { SystemInfo, SystemStatusOptions } from './system_status.js';
import { SystemStatus } from './system_status.js';

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
     * The maximum number of tasks per minute the system can run.
     * By default, this is set to `Infinity`, but you can pass any positive, non-zero integer.
     */
    maxTasksPerMinute?: number;

    log?: CrawleeLogger;
}

/**
 * The shareable "governor" behind an {@apilink AutoscaledPool}. It answers the single question that decides whether
 * more work may start right now — *is there free compute for one more task?* — by combining live system load (via a
 * {@apilink Snapshotter}/{@apilink SystemStatus}) with a concurrency budget it autoscales over time.
 *
 * Splitting this out of {@apilink AutoscaledPool} lets several pools (and therefore several crawlers) share **one**
 * budget so their *combined* compute is capped, instead of each crawler scaling independently and oversubscribing the
 * machine. Everything task-source specific — the `runTaskFunction`, the ready/finished checks, the `run()` promise —
 * stays in the pool; only the load-and-budget accounting lives here.
 *
 * A system has a single lifecycle owner, not per-borrower reference counting: whoever built the instance calls
 * {@apilink ConcurrencySystem.start|`start()`} before any borrowing pool runs and
 * {@apilink ConcurrencySystem.stop|`stop()`} once they are all done (crawlers do this for the default system they
 * build, and never for an injected one). Both calls are idempotent, but the first `stop()` tears the snapshotter down
 * for every borrower — borrowers must not manage a shared system's lifecycle themselves.
 * @category Scaling
 */
export class ConcurrencySystem {
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
    private readonly systemStatus: SystemStatus;

    private autoscaleInterval?: BetterIntervalID;
    private tasksDonePerSecondInterval?: BetterIntervalID;

    /**
     * Whether the snapshotter and autoscaling intervals are currently running. Guards against a redundant
     * {@apilink ConcurrencySystem.start|`start()`}/{@apilink ConcurrencySystem.stop|`stop()`} pair being a problem, so
     * whoever owns the system (a crawler for its default, or the caller for a shared/injected one) can bracket its
     * lifecycle without bookkeeping.
     */
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
                systemStatusOptions: ow.optional.object,
                snapshotterOptions: ow.optional.object,
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
            systemStatusOptions,
            snapshotterOptions,
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

        const ssoCopy: SystemStatusOptions = { ...systemStatusOptions };
        ssoCopy.snapshotter ??= new Snapshotter({
            ...snapshotterOptions,
            log: this.log,
        });
        this.snapshotter = ssoCopy.snapshotter;
        this.loadSignals = ssoCopy.loadSignals ?? [];
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

    /**
     * Gets the number of parallel tasks currently running against this system (summed across every borrowing pool).
     */
    get currentConcurrency(): number {
        return this._currentConcurrency;
    }

    /**
     * Boots the underlying snapshotter and the autoscaling interval. Idempotent — calling it on an
     * already-running system is a no-op, so a shared system started by its owner isn't restarted when handed to
     * another consumer.
     */
    async start(): Promise<void> {
        if (this.running) {
            return;
        }
        this.running = true;

        await this.snapshotter.start();
        await Promise.all(this.loadSignals.map(async (s) => s.start()));

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
     * The core, shareable decision: may **one more** task start right now? Returns `false` when the shared budget is
     * spent (desired concurrency reached), when the machine is overloaded past `minConcurrency`, or when the
     * per-minute task cap is hit — the exact gate {@apilink AutoscaledPool} consults before dispatching a task.
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

    /**
     * Whether the per-minute task cap has been reached. Checked after a task is known to be ready, so an empty queue
     * never blocks the pool for a whole extra minute.
     */
    get isOverMaxRequestLimit(): boolean {
        if (this.maxTasksPerMinute === Infinity) {
            return false;
        }

        return this._tasksPerMinute.reduce((acc, curr) => acc + curr, 0) >= this.maxTasksPerMinute;
    }

    /**
     * Atomically books a task against the shared budget: re-checks
     * {@apilink ConcurrencySystem.hasCapacityForTask|`hasCapacityForTask()`} and increments the current concurrency in
     * one synchronous step, returning `false` (without booking) when the budget is spent. Call right before the task
     * actually runs, and only run it if this returns `true`.
     *
     * The check-and-book must be a single operation — with several pools borrowing one system, a capacity check
     * followed by an `await` (e.g. a task-readiness query) and only then a booking would let two pools book the last
     * free slot at once, overshooting the shared budget.
     */
    tryRegisterTaskStart(): boolean {
        if (!this.hasCapacityForTask()) {
            return false;
        }

        this._currentConcurrency++;
        this._tasksPerMinute[0]++;
        return true;
    }

    /**
     * Returns a task's slot to the shared budget. Call once the task settles (resolve or reject).
     */
    registerTaskEnd(): void {
        this._currentConcurrency--;
    }

    /**
     * Reads the current live system status (used by the pool for logging/telemetry).
     */
    getCurrentStatus(): SystemInfo {
        return this.systemStatus.getCurrentStatus();
    }

    /**
     * Evaluates the current historical system status and scales the shared desired concurrency up or down
     * accordingly. Driven by the autoscaling interval started in {@apilink ConcurrencySystem.start|`start()`}.
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
