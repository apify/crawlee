import type { ConcurrencyConsumer, IConcurrencySystem, LoadSignal, LoadSignalStartContext } from '@crawlee/core';
import { AutoscaledPool, ConcurrencySystem, EventLoopLoadSignal, SnapshotStore } from '@crawlee/core';
import { sleep } from '@crawlee/utils';

import log from '@apify/log';

describe('ConcurrencySystem', () => {
    let logLevel: number;
    beforeAll(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    afterAll(() => {
        log.setLevel(logLevel);
    });

    describe('budget accounting', () => {
        test('hasCapacityForTask() gates on desired concurrency', () => {
            const system = new ConcurrencySystem({ minConcurrency: 1, maxConcurrency: 10, desiredConcurrency: 2 });

            expect(system.hasCapacityForTask()).toBe(true);
            expect(system.tryRegisterTaskStart()).toBe(true);
            expect(system.currentConcurrency).toBe(1);
            expect(system.hasCapacityForTask()).toBe(true);
            expect(system.tryRegisterTaskStart()).toBe(true);
            expect(system.currentConcurrency).toBe(2);
            // Desired concurrency reached - no more room.
            expect(system.hasCapacityForTask()).toBe(false);

            system.registerTaskEnd();
            expect(system.currentConcurrency).toBe(1);
            expect(system.hasCapacityForTask()).toBe(true);
        });

        test('tryRegisterTaskStart() refuses to book past the budget', () => {
            const system = new ConcurrencySystem({ minConcurrency: 1, maxConcurrency: 10, desiredConcurrency: 1 });

            expect(system.tryRegisterTaskStart()).toBe(true);
            // The budget is spent - a booking attempt (e.g. by a second pool sharing the system) must fail
            // atomically instead of overshooting the shared cap.
            expect(system.tryRegisterTaskStart()).toBe(false);
            expect(system.currentConcurrency).toBe(1);

            system.registerTaskEnd();
            expect(system.tryRegisterTaskStart()).toBe(true);
            expect(system.currentConcurrency).toBe(1);
        });

        test('tryRegisterTaskStart() enforces maxTasksPerMinute', () => {
            const system = new ConcurrencySystem({ minConcurrency: 5, maxTasksPerMinute: 2 });

            expect(system.tryRegisterTaskStart()).toBe(true);
            expect(system.tryRegisterTaskStart()).toBe(true);
            // Two starts within the current minute reach the cap - further bookings are refused even though there
            // is concurrency budget to spare, and ending a task changes nothing (the cap counts starts, not slots).
            expect(system.tryRegisterTaskStart()).toBe(false);
            system.registerTaskEnd();
            expect(system.tryRegisterTaskStart()).toBe(false);
            expect(system.currentConcurrency).toBe(1);
        });

        test('maxTasksPerMinute === Infinity never limits', () => {
            const system = new ConcurrencySystem({
                minConcurrency: 1000,
                maxConcurrency: 1000,
                maxTasksPerMinute: Infinity,
            });
            for (let i = 0; i < 1000; i++) expect(system.tryRegisterTaskStart()).toBe(true);
        });
    });

    describe('runtime tuning', () => {
        test('lowering maxConcurrency takes effect immediately', () => {
            const system = new ConcurrencySystem({ minConcurrency: 1, maxConcurrency: 100, desiredConcurrency: 50 });

            // Dispatch gates on `desiredConcurrency`, so a ceiling that left it stranded at 50 would be no ceiling at
            // all - and nothing would ever bring it down, since scaling up is blocked at the ceiling and scaling down
            // needs a load signal to report overload.
            system.maxConcurrency = 10;

            expect(system.maxConcurrency).toBe(10);
            expect(system.desiredConcurrency).toBe(10);

            for (let i = 0; i < 10; i++) expect(system.tryRegisterTaskStart()).toBe(true);
            expect(system.tryRegisterTaskStart()).toBe(false);
        });

        test('raising minConcurrency takes effect immediately', () => {
            const system = new ConcurrencySystem({ minConcurrency: 1, maxConcurrency: 100, desiredConcurrency: 5 });

            system.minConcurrency = 20;

            expect(system.desiredConcurrency).toBe(20);
        });

        test('desiredConcurrency is held within the current bounds', () => {
            const system = new ConcurrencySystem({ minConcurrency: 5, maxConcurrency: 50 });

            system.desiredConcurrency = 500;
            expect(system.desiredConcurrency).toBe(50);

            system.desiredConcurrency = 1;
            expect(system.desiredConcurrency).toBe(5);
        });

        test('the maximum wins a contradictory pair of bounds', () => {
            const system = new ConcurrencySystem({ minConcurrency: 10, maxConcurrency: 100, desiredConcurrency: 50 });

            // `maxConcurrency` is the limit callers set to protect something, so it outranks a now-unreachable minimum.
            system.maxConcurrency = 4;

            expect(system.desiredConcurrency).toBe(4);
        });

        test('the constructor honours both bounds', () => {
            // A ceiling below the requested starting point wins...
            expect(new ConcurrencySystem({ maxConcurrency: 3, desiredConcurrency: 10 }).desiredConcurrency).toBe(3);
            // ...and so does a floor above it, rather than starting below the minimum the caller asked for.
            expect(new ConcurrencySystem({ minConcurrency: 10, desiredConcurrency: 3 }).desiredConcurrency).toBe(10);
        });
    });

    describe('load signals', () => {
        test('signals are told the widest window they will be sampled over', async () => {
            const contexts: LoadSignalStartContext[] = [];
            const signal: LoadSignal = {
                name: 'proxyHealth',
                overloadedRatio: 0.3,
                async start(context) {
                    contexts.push(context);
                },
                async stop() {},
                getSample: () => [],
            };

            // The autoscaling window is the wider of the two here.
            const system = new ConcurrencySystem({
                loadSignals: { custom: [signal] },
                currentHistorySecs: 5,
                snapshotHistorySecs: 45,
            });
            await system.start();
            await system.stop();

            expect(contexts).toEqual([{ maxSampleWindowMillis: 45_000 }]);

            // ...and when the gating window is the wider one, retention has to cover that instead.
            const gatingHeavy = new ConcurrencySystem({
                loadSignals: { custom: [signal] },
                currentHistorySecs: 60,
                snapshotHistorySecs: 30,
            });
            await gatingHeavy.start();
            await gatingHeavy.stop();

            expect(contexts[1]).toEqual({ maxSampleWindowMillis: 60_000 });
        });

        test('a custom signal cannot shadow an enabled built-in, but can replace a disabled one', async () => {
            const now = Date.now();

            // The reported `limitRatio` is the signal's own `overloadedRatio`, so an unmistakable value identifies
            // which signal ended up owning the `memInfo` field.
            const memorySignal = (): LoadSignal => ({
                name: 'memInfo',
                overloadedRatio: 0.99,
                async start() {},
                async stop() {},
                getSample: () => [
                    { createdAt: new Date(now - 1_000), isOverloaded: true },
                    { createdAt: new Date(now), isOverloaded: true },
                ],
            });

            expect(() => new ConcurrencySystem({ loadSignals: { custom: [memorySignal()] } })).toThrow(
                'Duplicate load signal name "memInfo"',
            );

            const system = new ConcurrencySystem({
                loadSignals: { memory: false, custom: [memorySignal()] },
            });

            const status = system.getCurrentStatus();

            // The replacement owns the vacated field and gates the system, rather than being reported separately.
            expect(status.memInfo).toEqual({ isOverloaded: true, limitRatio: 0.99, actualRatio: 1 });
            expect(status.loadSignalInfo).toBeUndefined();
            expect(status.isSystemIdle).toBe(false);

            // The other three built-ins are untouched — each still reports under its own default ratio.
            expect(status.eventLoopInfo.limitRatio).toBe(0.6);
            expect(status.cpuInfo.limitRatio).toBe(0.4);
            expect(status.storageBackendInfo.limitRatio).toBe(0.3);
        });

        test('built-in signals can be switched off with `false`', async () => {
            const system = new ConcurrencySystem({
                loadSignals: { storageBackend: false, eventLoop: false },
            });

            await system.start();
            try {
                // A disabled signal cannot report overload, so the status shows it as idle rather than omitting it.
                const status = system.getCurrentStatus();
                expect(status.storageBackendInfo).toEqual({ isOverloaded: false, limitRatio: 0, actualRatio: 0 });
                expect(status.eventLoopInfo).toEqual({ isOverloaded: false, limitRatio: 0, actualRatio: 0 });
                expect(status.isSystemIdle).toBe(true);

                // The two that stayed on are distinguishable from the placeholders above: `limitRatio` is the
                // reporting signal's own `overloadedRatio`, which no disabled signal is around to supply.
                expect(status.memInfo.limitRatio).toBe(0.2);
                expect(status.cpuInfo.limitRatio).toBe(0.4);
            } finally {
                await system.stop();
            }
        });

        test('switching every built-in signal off leaves the system permanently idle', async () => {
            const system = new ConcurrencySystem({
                loadSignals: { memory: false, eventLoop: false, cpu: false, storageBackend: false },
            });

            // @ts-expect-error Accessing private prop
            expect(system.snapshotter.getLoadSignals()).toEqual([]);

            await system.start();
            try {
                expect(system.getCurrentStatus().isSystemIdle).toBe(true);
                expect(system.hasCapacityForTask()).toBe(true);
            } finally {
                await system.stop();
            }
        });

        test('a SnapshotStore-based signal sizes its retention from the start context', async () => {
            const store = new SnapshotStore();
            const t0 = new Date(1_000_000);
            store.push({ createdAt: t0, isOverloaded: false });
            // Before starting, retention is unbounded so a 200s gap is NOT pruned.
            store.push({ createdAt: new Date(1_200_000), isOverloaded: false });
            expect(store.getAll()).toHaveLength(2);

            const system = new ConcurrencySystem({
                loadSignals: {
                    custom: [
                        {
                            name: 'custom',
                            overloadedRatio: 0.3,
                            async start({ maxSampleWindowMillis }) {
                                store.useSampleWindow(maxSampleWindowMillis);
                            },
                            async stop() {},
                            getSample: (ms) => store.getSample(ms),
                        },
                    ],
                },
                snapshotHistorySecs: 90,
            });
            await system.start();
            await system.stop();

            // After learning its 90s window, adding a snapshot 100s after t0 prunes t0.
            store.push({ createdAt: new Date(1_200_000 + 100_000), isOverloaded: false });
            expect(store.getAll().some((s) => s.createdAt.getTime() === t0.getTime())).toBe(false);
        });

        test('a restarted built-in signal is not judged on measurements from before the downtime', async () => {
            const signal = new EventLoopLoadSignal();
            await signal.start({ maxSampleWindowMillis: 30_000 });
            signal.handle(() => {});

            const beforeStop = signal.getSample();
            expect(beforeStop.length).toBeGreaterThan(0);
            const lastBeforeStop = +beforeStop[beforeStop.length - 1].createdAt;

            // Stopping leaves the finished session readable - worth having when working out why a crawl never
            // scaled up.
            await signal.stop();
            expect(signal.getSample()).toEqual(beforeStop);

            await sleep(20);
            await signal.start({ maxSampleWindowMillis: 30_000 });
            signal.handle(() => {});

            // Starting, though, wipes the slate, so neither the delta the handler computes nor the sample the system
            // evaluates can span the downtime. Pruning is relative to the newest snapshot rather than the wall clock,
            // so stale entries would otherwise be evaluated forever as if they were current - and here the gap would
            // be billed to the event loop as blocked time, via exactly the stop/start pair the docs recommend for
            // quiescing a system during a long pause.
            expect(signal.getSample().every((snapshot) => +snapshot.createdAt > lastBeforeStop)).toBe(true);
            expect(signal.getSample().some((snapshot) => snapshot.isOverloaded)).toBe(false);

            await signal.stop();
        });
    });

    describe('lifecycle', () => {
        test('start()/stop() are idempotent', async () => {
            const system = new ConcurrencySystem();
            // @ts-expect-error Accessing private prop
            const snapshotter = system.snapshotter;
            const startSpy = vitest.spyOn(snapshotter, 'start');
            const stopSpy = vitest.spyOn(snapshotter, 'stop');

            // A second start() on an already-running system is a no-op...
            await system.start();
            await system.start();
            expect(startSpy).toHaveBeenCalledTimes(1);

            // ...and so is a second stop().
            await system.stop();
            await system.stop();
            expect(stopSpy).toHaveBeenCalledTimes(1);
        });

        test('stop() is a no-op when never started', async () => {
            const system = new ConcurrencySystem();
            // @ts-expect-error Accessing private prop
            const stopSpy = vitest.spyOn(system.snapshotter, 'stop');
            await system.stop();
            expect(stopSpy).not.toHaveBeenCalled();
        });

        test('isRunning reflects the lifecycle', async () => {
            const system = new ConcurrencySystem();
            expect(system.isRunning).toBe(false);

            await system.start();
            expect(system.isRunning).toBe(true);

            await system.stop();
            expect(system.isRunning).toBe(false);
        });

        test('concurrent start() calls await a single startup', async () => {
            let release!: () => void;
            const blocked = new Promise<void>((resolve) => {
                release = resolve;
            });
            let startCount = 0;

            const signal: LoadSignal = {
                name: 'slowSignal',
                overloadedRatio: 0.5,
                async start() {
                    startCount++;
                    await blocked;
                },
                async stop() {},
                getSample: () => [],
            };

            const system = new ConcurrencySystem({ loadSignals: { custom: [signal] } });

            const first = system.start();
            const second = system.start();

            // A second owner booting the same shared system has to wait the first boot out - returning early here
            // would let it run tasks against signals that are not collecting yet.
            expect(system.isRunning).toBe(false);

            release();
            await Promise.all([first, second]);

            expect(startCount).toBe(1);
            expect(system.isRunning).toBe(true);

            await system.stop();
        });

        test('a failed startup leaves nothing running and can be retried', async () => {
            let attempts = 0;
            const signal: LoadSignal = {
                name: 'flakySignal',
                overloadedRatio: 0.5,
                async start() {
                    attempts++;
                    if (attempts === 1) throw new Error('signal boot failed');
                },
                async stop() {},
                getSample: () => [],
            };

            const system = new ConcurrencySystem({ loadSignals: { custom: [signal] } });
            // @ts-expect-error Accessing private prop
            const snapshotterStop = vitest.spyOn(system.snapshotter, 'stop');

            await expect(system.start()).rejects.toThrow('signal boot failed');

            // The built-in signals started before the custom one blew up, so the failed attempt has to unwind them
            // instead of leaving their intervals behind - and must not report a system that is up.
            expect(snapshotterStop).toHaveBeenCalledTimes(1);
            expect(system.isRunning).toBe(false);

            // A retry has to actually retry, rather than resolving instantly against the memoized failure.
            await system.start();
            expect(attempts).toBe(2);
            expect(system.isRunning).toBe(true);

            await system.stop();
        });

        test('start() after stop() restarts the system', async () => {
            const system = new ConcurrencySystem();
            // @ts-expect-error Accessing private prop
            const snapshotterStart = vitest.spyOn(system.snapshotter, 'start');

            await system.start();
            await system.stop();
            await system.start();

            expect(snapshotterStart).toHaveBeenCalledTimes(2);
            expect(system.isRunning).toBe(true);

            await system.stop();
        });

        test('a restart does not inherit the previous session\u2019s per-minute task count', async () => {
            const system = new ConcurrencySystem({ minConcurrency: 5, maxTasksPerMinute: 2 });
            await system.start();

            expect(system.tryRegisterTaskStart()).toBe(true);
            expect(system.tryRegisterTaskStart()).toBe(true);
            expect(system.tryRegisterTaskStart()).toBe(false);
            system.registerTaskEnd();
            system.registerTaskEnd();

            await system.stop();
            await system.start();

            // The ageing interval is cleared while the system is down, so the window never advances past the starts
            // booked before the stop. Without a reset those would still count against "this minute" and trip the cap
            // immediately, however long the downtime was.
            expect(system.tryRegisterTaskStart()).toBe(true);

            await system.stop();
        });

        test('capacity queried on a stopped system warns once per session', async () => {
            const system = new ConcurrencySystem();
            // @ts-expect-error Accessing private prop
            const warning = vitest.spyOn(system.log, 'warning');

            await system.start();
            system.hasCapacityForTask();
            // A running system is the normal case and must stay quiet.
            expect(warning).not.toHaveBeenCalled();

            // A pool only checks `isRunning` when `run()` is called, so a system stopped underneath a live pool is
            // otherwise undetectable - the frozen overload verdict just silently pins its concurrency.
            await system.stop();
            system.hasCapacityForTask();
            system.tryRegisterTaskStart();
            expect(warning).toHaveBeenCalledTimes(1);
            expect(warning.mock.calls[0][0]).toMatch(/not running/);

            // Re-armed by the next boot, so a later mistake is reported again.
            await system.start();
            await system.stop();
            system.hasCapacityForTask();
            expect(warning).toHaveBeenCalledTimes(2);
        });

        test('stop() called mid-startup still tears the system down', async () => {
            let release!: () => void;
            const blocked = new Promise<void>((resolve) => {
                release = resolve;
            });
            const signalStop = vitest.fn(async () => {});

            const signal: LoadSignal = {
                name: 'slowSignal',
                overloadedRatio: 0.5,
                async start() {
                    await blocked;
                },
                stop: signalStop,
                getSample: () => [],
            };

            const system = new ConcurrencySystem({ loadSignals: { custom: [signal] } });

            const starting = system.start();
            const stopping = system.stop();

            release();
            await Promise.all([starting, stopping]);

            // The teardown waits the boot out instead of racing it, so whatever the signals registered on the way up
            // is stopped rather than orphaned.
            expect(signalStop).toHaveBeenCalled();
            expect(system.isRunning).toBe(false);
        });

        test('a pool refuses to run against a system that was never started', async () => {
            const system = new ConcurrencySystem();
            const runTaskFunction = vitest.fn(async () => {});

            const pool = new AutoscaledPool({
                concurrencySystem: system,
                consumer: { id: 'pool' },
                runTaskFunction,
                isFinishedFunction: async () => false,
                isTaskReadyFunction: async () => true,
            });

            // Forgetting to start an injected system would pin concurrency for the whole run, so fail loudly
            // before any work happens instead of silently misbehaving.
            await expect(pool.run()).rejects.toThrow(/has not been started/);
            expect(runTaskFunction).not.toHaveBeenCalled();
        });

        test('a pool runs happily against a started system', async () => {
            const system = new ConcurrencySystem();
            await system.start();

            let done = 0;
            const pool = new AutoscaledPool({
                concurrencySystem: system,
                consumer: { id: 'pool' },
                runTaskFunction: async () => {
                    done++;
                },
                isFinishedFunction: async () => done > 0,
                isTaskReadyFunction: async () => done === 0,
            });

            await expect(pool.run()).resolves.toBeUndefined();
            await system.stop();
        });

        test('a governor with no startup lifecycle is accepted', async () => {
            // An implementation that needs no starting reports `isRunning: true` and is otherwise free of lifecycle.
            let done = 0;
            const pool = new AutoscaledPool({
                concurrencySystem: {
                    desiredConcurrency: 1,
                    currentConcurrency: 0,
                    isRunning: true,
                    hasCapacityForTask: () => true,
                    tryRegisterTaskStart: () => true,
                    registerTaskEnd: () => {},
                },
                consumer: { id: 'pool' },
                runTaskFunction: async () => {
                    done++;
                },
                isFinishedFunction: async () => done > 0,
                isTaskReadyFunction: async () => done === 0,
            });

            await expect(pool.run()).resolves.toBeUndefined();
        });
    });

    describe('shared across pools', () => {
        test('a shared system caps the combined concurrency of two pools', async () => {
            // One shared budget of 4; two pools that would each happily run 4 in parallel.
            const system = new ConcurrencySystem({ minConcurrency: 4, maxConcurrency: 4, desiredConcurrency: 4 });

            let combinedCurrent = 0;
            let combinedPeak = 0;

            const makePool = (id: string, taskCount: number) => {
                let done = 0;
                const runTaskFunction = async () => {
                    combinedCurrent++;
                    combinedPeak = Math.max(combinedPeak, combinedCurrent);
                    await sleep(5);
                    done++;
                    combinedCurrent--;
                };

                return new AutoscaledPool({
                    concurrencySystem: system,
                    consumer: { id },
                    runTaskFunction,
                    isFinishedFunction: async () => done >= taskCount,
                    isTaskReadyFunction: async () => done < taskCount,
                });
            };

            // The pool no longer owns the system's lifecycle — as the shared owner, the caller starts and stops it.
            await system.start();
            await Promise.all([makePool('first', 30).run(), makePool('second', 30).run()]);
            await system.stop();

            // The two pools together must never exceed the single shared budget.
            expect(combinedPeak).toBeLessThanOrEqual(4);
        });

        test('a pool that ran out of work finishes while another one saturates the shared budget', async () => {
            // A budget of exactly one slot, so the hog below holds all of it for as long as we let it.
            const system = new ConcurrencySystem({ minConcurrency: 1, maxConcurrency: 1, desiredConcurrency: 1 });

            let releaseHog: () => void;
            const hogReleased = new Promise<void>((resolve) => {
                releaseHog = resolve;
            });

            let hogStarted: () => void;
            const hogRunning = new Promise<void>((resolve) => {
                hogStarted = resolve;
            });

            let hogFinished = false;
            const hog = new AutoscaledPool({
                concurrencySystem: system,
                consumer: { id: 'hog' },
                runTaskFunction: async () => {
                    hogStarted();
                    await hogReleased;
                    hogFinished = true;
                },
                isFinishedFunction: async () => hogFinished,
                isTaskReadyFunction: async () => !hogFinished,
            });

            // Nothing to do and finished from the outset - the only thing that could keep this from resolving is the
            // shared budget, which this pool is not waiting on for anything.
            const drained = new AutoscaledPool({
                concurrencySystem: system,
                consumer: { id: 'drained' },
                runTaskFunction: async () => {},
                isFinishedFunction: async () => true,
                isTaskReadyFunction: async () => false,
            });

            await system.start();
            const hogPromise = hog.run();
            await hogRunning;

            // The single slot is now booked by the hog and stays booked. A borrower with no in-flight work of its own
            // has nothing to wait for, so it must still be able to observe that it is finished.
            await expect(drained.run()).resolves.toBeUndefined();

            releaseHog!();
            await hogPromise;
            await system.stop();
        });

        test('every capacity query and booking tells the governor which pool it is for', async () => {
            const calls: { method: string; consumerId: string }[] = [];
            const record = (method: string, consumer: ConcurrencyConsumer) => {
                calls.push({ method, consumerId: consumer.id });
            };

            const governor: IConcurrencySystem = {
                desiredConcurrency: 2,
                currentConcurrency: 0,
                isRunning: true,
                hasCapacityForTask: (consumer) => {
                    record('hasCapacityForTask', consumer);
                    return true;
                },
                tryRegisterTaskStart: (consumer) => {
                    record('tryRegisterTaskStart', consumer);
                    return true;
                },
                registerTaskEnd: (consumer) => record('registerTaskEnd', consumer),
            };

            const makePool = (consumer: ConcurrencyConsumer) => {
                let done = 0;
                return new AutoscaledPool({
                    concurrencySystem: governor,
                    consumer,
                    runTaskFunction: async () => {
                        done++;
                    },
                    isFinishedFunction: async () => done > 0,
                    isTaskReadyFunction: async () => done === 0,
                });
            };

            await makePool({ id: 'crawler-a' }).run();
            await makePool({ id: 'crawler-b' }).run();

            // The whole point of the identity: a governor can attribute every query and booking to a pool, rather
            // than just counting them.
            for (const id of ['crawler-a', 'crawler-b']) {
                expect(calls).toContainEqual({ method: 'hasCapacityForTask', consumerId: id });
                expect(calls).toContainEqual({ method: 'tryRegisterTaskStart', consumerId: id });
                expect(calls).toContainEqual({ method: 'registerTaskEnd', consumerId: id });
            }
        });

        test('tuning a shared governor is reflected by every borrowing pool', () => {
            const system = new ConcurrencySystem();

            const makeBorrower = (id: string) =>
                new AutoscaledPool({
                    concurrencySystem: system,
                    consumer: { id },
                    runTaskFunction: async () => {},
                    isFinishedFunction: async () => true,
                    isTaskReadyFunction: async () => false,
                });

            const first = makeBorrower('first');
            const second = makeBorrower('second');

            // Tuning happens on the governor its owner holds; the pools only report it, read-only.
            system.desiredConcurrency = 42;
            expect(first.desiredConcurrency).toBe(42);
            expect(second.desiredConcurrency).toBe(42);
        });
    });
});
