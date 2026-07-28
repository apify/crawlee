import type { LoadSignal, LoadSignalStartContext } from '@crawlee/core';
import { AutoscaledPool, ConcurrencySystem, SnapshotStore } from '@crawlee/core';
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

        test('a SnapshotStore-based signal sizes its retention from the start context', async () => {
            const store = new SnapshotStore();
            // Before starting, the store falls back to its own default.
            // @ts-expect-error Accessing private prop
            expect(store.historyMillis).toBe(30_000);

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

            // No out-of-band knowledge needed - the window came from the system that drives the signal.
            // @ts-expect-error Accessing private prop
            expect(store.historyMillis).toBe(90_000);
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

        test('a pool refuses to run against a system that was never started', async () => {
            const system = new ConcurrencySystem();
            const runTaskFunction = vitest.fn(async () => {});

            const pool = new AutoscaledPool({
                concurrencySystem: system,
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
            // `isRunning` is optional in the IConcurrencySystem contract - a governor that needs no starting simply
            // omits it, and only an explicit `false` is treated as an error.
            let done = 0;
            const pool = new AutoscaledPool({
                concurrencySystem: {
                    desiredConcurrency: 1,
                    currentConcurrency: 0,
                    hasCapacityForTask: () => true,
                    tryRegisterTaskStart: () => true,
                    registerTaskEnd: () => {},
                },
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

            const makePool = (taskCount: number) => {
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
                    runTaskFunction,
                    isFinishedFunction: async () => done >= taskCount,
                    isTaskReadyFunction: async () => done < taskCount,
                });
            };

            // The pool no longer owns the system's lifecycle — as the shared owner, the caller starts and stops it.
            await system.start();
            await Promise.all([makePool(30).run(), makePool(30).run()]);
            await system.stop();

            // The two pools together must never exceed the single shared budget.
            expect(combinedPeak).toBeLessThanOrEqual(4);
        });

        test('AutoscaledPool exposes its governor via `system` for re-injection', () => {
            const system = new ConcurrencySystem();

            const first = new AutoscaledPool({
                concurrencySystem: system,
                runTaskFunction: async () => {},
                isFinishedFunction: async () => true,
                isTaskReadyFunction: async () => false,
            });

            const second = new AutoscaledPool({
                concurrencySystem: first.system,
                runTaskFunction: async () => {},
                isFinishedFunction: async () => true,
                isTaskReadyFunction: async () => false,
            });

            expect(second.system).toBe(system);

            // Tuning happens on the (shared) governor; every borrowing pool reflects it read-only.
            system.desiredConcurrency = 42;
            expect(first.desiredConcurrency).toBe(42);
            expect(second.desiredConcurrency).toBe(42);
        });
    });
});
