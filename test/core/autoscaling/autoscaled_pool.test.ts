import type {
    AutoscaledPoolOptions,
    ConcurrencyConsumer,
    ConcurrencySystemOptions,
    LoadSignal,
    LoadSnapshot,
} from '@crawlee/core';
import { AutoscaledPool, ConcurrencySystem, CriticalError } from '@crawlee/core';
import { sleep } from '@crawlee/utils';

import log from '@apify/log';

/**
 * Test helper mirroring how {@apilink BasicCrawler} drives a pool: `concurrencyOptions` build a {@apilink
 * ConcurrencySystem}, `poolOptions` configure the pool itself. Kept as two separate bags routed to their own
 * constructors. Tests that need the system directly can read `pool.system`.
 *
 * The pool no longer owns the system's lifecycle, so the helper awaits `start()` on the freshly-built system (the
 * pool assumes it's already running) and registers an `onTestFinished` hook to `stop()` it, so snapshotter intervals
 * don't leak between tests. Must be called from within a test (or a `beforeEach`).
 */
async function makePool(
    poolOptions: Omit<AutoscaledPoolOptions, 'concurrencySystem' | 'consumer'> & { consumer?: ConcurrencyConsumer },
    concurrencyOptions: ConcurrencySystemOptions = {},
): Promise<AutoscaledPool> {
    const concurrencySystem = new ConcurrencySystem(concurrencyOptions);
    await concurrencySystem.start();
    onTestFinished(async () => concurrencySystem.stop());

    // The identity only matters to a governor that allocates per consumer, which `ConcurrencySystem` does not - so
    // tests get a stock one unless they say otherwise.
    return new AutoscaledPool({ consumer: { id: 'test-pool' }, ...poolOptions, concurrencySystem });
}

/**
 * The concrete governor behind a pool. The pool exposes only the read-only {@apilink IConcurrencySystem} telemetry —
 * tests that tune or inspect scaling policy (min/max concurrency, ratios) reach for the canonical implementation.
 */
function systemOf(pool: AutoscaledPool): ConcurrencySystem {
    return pool.system as ConcurrencySystem;
}

describe('AutoscaledPool', () => {
    let logLevel: number;
    beforeAll(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    afterAll(() => {
        log.setLevel(logLevel);
    });

    test('should work with concurrency 1', async () => {
        const range = [...Array(10).keys()];
        const result: number[] = [];

        let isFinished = false;

        const runTaskFunction = async () => {
            if (range.length === 1) {
                isFinished = true;
            }

            return new Promise((resolve) => {
                const item = range.shift()!;
                result.push(item);
                setTimeout(resolve, 5);
            });
        };

        const pool = await makePool(
            {
                runTaskFunction,
                isFinishedFunction: async () => Promise.resolve(isFinished),
                isTaskReadyFunction: async () => Promise.resolve(!isFinished),
            },
            { minConcurrency: 1, maxConcurrency: 1 },
        );
        await pool.run();

        expect(result).toEqual([...Array(10).keys()]);
    });

    test('should work with concurrency 10', async () => {
        const range = [...Array(100).keys()];
        const result: number[] = [];

        let isFinished = false;

        const runTaskFunction = async () => {
            if (range.length === 1) {
                isFinished = true;
            }

            return new Promise((resolve) => {
                const item = range.shift()!;
                result.push(item);
                setTimeout(resolve, 5);
            });
        };

        const pool = await makePool(
            {
                runTaskFunction,
                isFinishedFunction: async () => Promise.resolve(isFinished),
                isTaskReadyFunction: async () => Promise.resolve(!isFinished),
            },
            { minConcurrency: 10, maxConcurrency: 10 },
        );

        await pool.run();

        expect(result).toEqual([...Array(100).keys()]);
    });

    test('enables setting concurrency', async () => {
        const range = [...Array(100).keys()];
        const result: number[] = [];

        let isFinished = false;

        const runTaskFunction = async () => {
            if (range.length === 1) {
                isFinished = true;
            }

            return new Promise((resolve) => {
                const item = range.shift()!;
                result.push(item);
                setTimeout(resolve, 5);
            });
        };

        const pool = await makePool(
            {
                runTaskFunction,
                isFinishedFunction: async () => isFinished,
                isTaskReadyFunction: async () => !isFinished,
            },
            // Test initial concurrency setting
            { minConcurrency: 3, maxConcurrency: 13, desiredConcurrency: 9 },
        );

        const system = systemOf(pool);
        expect(system.minConcurrency).toBe(3);
        expect(system.maxConcurrency).toBe(13);
        expect(pool.desiredConcurrency).toBe(9);

        const promise = pool.run();

        // Concurrency is tuned on the governor; the pool only reflects it as read-only telemetry.
        system.minConcurrency = 4;
        system.maxConcurrency = 14;
        system.desiredConcurrency = 7;

        expect(system.minConcurrency).toBe(4);
        expect(system.maxConcurrency).toBe(14);
        expect(pool.desiredConcurrency).toBe(7);

        await promise;

        expect(result).toEqual([...Array(100).keys()]);
    });

    describe('should scale correctly', () => {
        class MockSystemStatus {
            okNow: boolean;
            okLately: boolean;
            getCurrentStatus: () => { isSystemIdle: boolean };
            getHistoricalStatus: () => { isSystemIdle: boolean };

            constructor(okNow: boolean, okLately: boolean) {
                this.okNow = okNow;
                this.okLately = okLately;
                this.getCurrentStatus = () => ({ isSystemIdle: this.okNow });
                this.getHistoricalStatus = () => ({ isSystemIdle: this.okLately });
            }
        }

        let pool: AutoscaledPool;
        let systemStatus: MockSystemStatus;
        const cb = () => {};
        beforeEach(async () => {
            systemStatus = new MockSystemStatus(true, true);
            pool = await makePool(
                {
                    runTaskFunction: async () => {},
                    isFinishedFunction: async () => false,
                    isTaskReadyFunction: async () => true,
                },
                { minConcurrency: 1, maxConcurrency: 100 },
            );
            // Autoscaling now lives on the shared governor; mock its system status.
            // @ts-expect-error Mock
            pool.system.systemStatus = systemStatus;
        });

        test('works with low values', () => {
            // @ts-expect-error Calling private method on the governor
            pool.system.autoscale(cb);
            expect(pool.desiredConcurrency).toBe(2);

            // @ts-expect-error Calling private method on the governor
            pool.system.autoscale(cb);
            expect(pool.desiredConcurrency).toBe(2); // because currentConcurrency is not high enough;

            systemOf(pool).tryRegisterTaskStart();
            systemOf(pool).tryRegisterTaskStart();
            // @ts-expect-error Calling private method on the governor
            pool.system.autoscale(cb);
            expect(pool.desiredConcurrency).toBe(3);

            systemStatus.okNow = false; // this should have no effect
            systemOf(pool).tryRegisterTaskStart();
            // @ts-expect-error Calling private method on the governor
            pool.system.autoscale(cb);
            expect(pool.desiredConcurrency).toBe(4);

            systemStatus.okLately = false;
            // @ts-expect-error Calling private method on the governor
            pool.system.autoscale(cb);
            expect(pool.desiredConcurrency).toBe(3);
        });

        test('works with high values', () => {
            // Should not scale because current concurrency is too low.
            systemOf(pool).desiredConcurrency = 50;
            const targetConcurrency = Math.floor(
                // @ts-expect-error Accessing private prop on the governor
                pool.desiredConcurrency * pool.system.desiredConcurrencyRatio,
            );
            for (let i = 0; i < targetConcurrency - 1; i++) {
                systemOf(pool).tryRegisterTaskStart();
            }
            systemStatus.okLately = true;
            // @ts-expect-error Calling private method on the governor
            pool.system.autoscale(cb);
            expect(pool.desiredConcurrency).toBe(50);

            // Should scale because we bumped up current concurrency.
            systemOf(pool).tryRegisterTaskStart();
            let newConcurrency =
                // @ts-expect-error Accessing private prop on the governor
                pool.desiredConcurrency + Math.ceil(pool.desiredConcurrency * pool.system.scaleUpStepRatio);
            // @ts-expect-error Calling private method on the governor
            pool.system.autoscale(cb);
            expect(pool.desiredConcurrency).toEqual(newConcurrency);

            // Should scale down.
            systemStatus.okLately = false;
            newConcurrency =
                // @ts-expect-error Accessing private prop on the governor
                pool.desiredConcurrency - Math.ceil(pool.desiredConcurrency * pool.system.scaleDownStepRatio);
            // @ts-expect-error Calling private method on the governor
            pool.system.autoscale(cb);
            expect(pool.desiredConcurrency).toEqual(newConcurrency);
        });

        test('works at minConcurrency when currently overloaded', async () => {
            let limit = 5;
            let concurrencyLog: number[] = [];
            let count = 0;

            // The task loop is configuration, so this test builds its own pool instead of reusing the shared one.
            pool = await makePool(
                {
                    runTaskFunction: async () => {
                        await sleep(10);
                        count++;
                    },
                    isFinishedFunction: async () => count >= limit,
                    isTaskReadyFunction: async () => count < limit,
                },
                { minConcurrency: 1, maxConcurrency: 100 },
            );
            // @ts-expect-error Mock
            pool.system.systemStatus = systemStatus;
            systemStatus.okNow = false;
            systemOf(pool).desiredConcurrency = 10;

            const origStart = pool.system.tryRegisterTaskStart.bind(pool.system);
            const origEnd = pool.system.registerTaskEnd.bind(pool.system);
            vitest.spyOn(pool.system, 'tryRegisterTaskStart').mockImplementation((consumer) => {
                const res = origStart(consumer);
                concurrencyLog.push(pool.system.currentConcurrency);
                return res;
            });
            vitest.spyOn(pool.system, 'registerTaskEnd').mockImplementation((consumer) => {
                origEnd(consumer);
                concurrencyLog.push(pool.system.currentConcurrency);
            });

            expect(pool.currentConcurrency).toBe(0);

            await pool.run();
            expect(concurrencyLog.some((n) => n > 1)).toBe(false);

            limit = 50;
            concurrencyLog = [];
            count = 0;
            systemOf(pool).minConcurrency = 5;

            await pool.run();
            expect(concurrencyLog.some((n) => n > 5)).toBe(false);
        });
    });

    describe('should throw', () => {
        // Turn off unnecessary error logging.
        let originalLevel: number;
        beforeAll(() => {
            originalLevel = log.getLevel();
            log.setLevel(log.LEVELS.OFF);
        });

        afterAll(() => {
            log.setLevel(originalLevel);
        });

        test('when some of the promises throws', async () => {
            let counter = 0;
            const runTaskFunction = async () => {
                counter++;
                await sleep(1);
                if (counter > 20) throw new Error('some-promise-error');
            };

            const pool = await makePool(
                {
                    runTaskFunction,
                    isFinishedFunction: async () => counter > 200,
                    isTaskReadyFunction: async () => true,
                },
                { maxConcurrency: 5, minConcurrency: 5 },
            );

            await expect(pool.run()).rejects.toThrow('some-promise-error');
        });

        test('when runTaskFunction throws', async () => {
            const runTaskFunction = async () => {
                await sleep(3);
                throw new Error('some-runtask-error');
            };

            const pool = await makePool(
                {
                    runTaskFunction,
                    isFinishedFunction: async () => false,
                    isTaskReadyFunction: async () => true,
                },
                { maxConcurrency: 1 },
            );

            await expect(pool.run()).rejects.toThrow('some-runtask-error');
        });

        test('and still returns the failed task’s slot to the governor', async () => {
            const pool = await makePool(
                {
                    runTaskFunction: async () => {
                        await sleep(1);
                        throw new Error('some-runtask-error');
                    },
                    isFinishedFunction: async () => false,
                    isTaskReadyFunction: async () => true,
                },
                { minConcurrency: 1, maxConcurrency: 1, desiredConcurrency: 1 },
            );

            await expect(pool.run()).rejects.toThrow('some-runtask-error');

            // A slot leaked on the error path is never recovered - with a shared ConcurrencySystem it permanently
            // shrinks the budget of every other pool borrowing it.
            expect(systemOf(pool).currentConcurrency).toBe(0);
            expect(systemOf(pool).hasCapacityForTask()).toBe(true);
        });

        test('and still returns the slot when the task throws a CriticalError', async () => {
            // CriticalError takes a different branch out of the task loop (it is deliberately not logged), which is
            // exactly where the slot used to leak.
            const pool = await makePool(
                {
                    runTaskFunction: async () => {
                        await sleep(1);
                        throw new CriticalError('some-critical-error');
                    },
                    isFinishedFunction: async () => false,
                    isTaskReadyFunction: async () => true,
                },
                { minConcurrency: 1, maxConcurrency: 1, desiredConcurrency: 1 },
            );

            await expect(pool.run()).rejects.toThrow('some-critical-error');

            expect(pool.currentConcurrency).toBe(0);
            expect(systemOf(pool).currentConcurrency).toBe(0);
        });

        test('and still returns the slot when the task times out', async () => {
            const pool = await makePool(
                {
                    runTaskFunction: async () => sleep(1e3),
                    taskTimeoutSecs: 0.05,
                    isFinishedFunction: async () => false,
                    isTaskReadyFunction: async () => true,
                },
                { minConcurrency: 1, maxConcurrency: 1, desiredConcurrency: 1 },
            );

            await expect(pool.run()).rejects.toThrow('runTaskFunction timed out');

            // The abandoned task is left to its own devices, but its slot is not.
            expect(systemOf(pool).currentConcurrency).toBe(0);
        });

        test('and a failing pool does not shrink a shared budget', async () => {
            const system = new ConcurrencySystem({ minConcurrency: 2, maxConcurrency: 2, desiredConcurrency: 2 });
            await system.start();
            onTestFinished(async () => system.stop());

            const failing = new AutoscaledPool({
                concurrencySystem: system,
                consumer: { id: 'failing' },
                runTaskFunction: async () => {
                    await sleep(1);
                    throw new Error('some-runtask-error');
                },
                isFinishedFunction: async () => false,
                isTaskReadyFunction: async () => true,
            });

            await expect(failing.run()).rejects.toThrow('some-runtask-error');

            // The survivor must still be able to reach the full shared concurrency of 2.
            let done = 0;
            let peak = 0;
            let current = 0;
            const survivor = new AutoscaledPool({
                concurrencySystem: system,
                consumer: { id: 'survivor' },
                runTaskFunction: async () => {
                    current++;
                    peak = Math.max(peak, current);
                    await sleep(5);
                    done++;
                    current--;
                },
                isFinishedFunction: async () => done >= 10,
                isTaskReadyFunction: async () => done < 10,
            });

            await survivor.run();
            expect(peak).toBe(2);
        });

        test('when isFinishedFunction throws', async () => {
            let count = 0;
            const pool = await makePool(
                {
                    runTaskFunction: async () => {
                        count++;
                    },
                    isFinishedFunction: async () => {
                        throw new Error('some-finished-error');
                    },
                    isTaskReadyFunction: async () => {
                        return count < 1;
                    },
                },
                { maxConcurrency: 1 },
            );

            await expect(pool.run()).rejects.toThrow('some-finished-error');
        });

        test('when isTaskReadyFunction throws', async () => {
            let count = 0;
            const pool = await makePool(
                {
                    runTaskFunction: async () => {
                        count++;
                    },
                    isFinishedFunction: async () => false,
                    isTaskReadyFunction: async () => {
                        if (count > 1) throw new Error('some-ready-error');
                        else return true;
                    },
                },
                { maxConcurrency: 1 },
            );

            await expect(pool.run()).rejects.toThrow('some-ready-error');
        });
    });

    test('should not handle tasks added after isFinishedFunction returned true', async () => {
        const isFinished = async () => count > 10;
        let count = 0;

        // Run the pool and close it after 3s.
        const pool = await makePool(
            {
                runTaskFunction: async () =>
                    sleep(1).then(() => {
                        count++;
                    }),
                isFinishedFunction: isFinished,
                isTaskReadyFunction: async () => !(await isFinished()),
                // Speed up the test.
                maybeRunIntervalSecs: 0.005,
            },
            { minConcurrency: 3 },
        );

        await pool.run();
        await sleep(10);
        expect(count).toBeGreaterThanOrEqual(11);
        // Check finished tasks.
        expect(count).toBeLessThanOrEqual(13);
    });

    test('should break and resume when the task queue is empty for a while', async () => {
        const finished: number[] = [];
        let isFinished = false;
        let isTaskReady = true;

        let counter = 0;
        const pool = await makePool(
            {
                runTaskFunction: async () => {
                    await sleep(1);
                    if (counter === 10) {
                        isTaskReady = false;
                        setTimeout(() => {
                            isTaskReady = true;
                        }, 10);
                    }
                    if (counter === 19) {
                        isTaskReady = false;
                        isFinished = true;
                    }
                    counter++;
                    finished.push(Date.now());
                },
                isFinishedFunction: async () => isFinished,
                isTaskReadyFunction: async () => !isFinished && isTaskReady,
                // Speed up the test.
                maybeRunIntervalSecs: 0.001,
            },
            { maxConcurrency: 1 },
        );
        await pool.run();

        // Check finished tasks.
        expect(finished).toHaveLength(20);
        expect(finished[11] - finished[10]).toBeGreaterThan(9);
    });

    test('should work with loggingIntervalSecs = null', async () => {
        const pool = await makePool(
            {
                runTaskFunction: async () => Promise.resolve(),
                isFinishedFunction: async () => Promise.resolve(false),
                isTaskReadyFunction: async () => Promise.resolve(true),
            },
            { minConcurrency: 1, maxConcurrency: 100, loggingIntervalSecs: null },
        );
        // @ts-expect-error Calling private method on the governor
        pool.system.autoscale(() => {});
        expect(pool.desiredConcurrency).toBe(2);
    });

    test('should abort', async () => {
        let finished = false;
        let aborted = false;
        const pool = await makePool({
            runTaskFunction: async () => {
                if (!aborted) {
                    await pool.abort();
                    aborted = true;
                }
            },
            isFinishedFunction: async () => {
                finished = true;
                return true;
            },
            isTaskReadyFunction: async () => !aborted,
        });
        await pool.run();
        expect(finished).toBe(false);
    });

    test('should only finish after tasks complete', async () => {
        let started = false;
        let completed = false;

        const pool = await makePool({
            runTaskFunction: async () => {
                started = true;
                await sleep(100);
                completed = true;
            },

            isFinishedFunction: async () => {
                return started;
            },

            isTaskReadyFunction: async () => {
                return !started;
            },
        });

        await pool.run();
        expect(started).toBe(true);
        expect(completed).toBe(true);
    });

    test('should pause and resume', async () => {
        let count = 0;
        const results: number[] = [];
        let pauseResolve: (value: unknown) => void;
        const pausePromise = new Promise((res) => {
            pauseResolve = res;
        });

        const pool = await makePool(
            {
                maybeRunIntervalSecs: 0.01,
                runTaskFunction: async () => {
                    results.push(count++);
                    if (count === 20) {
                        void pool.pause().then(pauseResolve);
                    }
                },
                isFinishedFunction: async () => !(count < 50),
                isTaskReadyFunction: async () => count < 50,
            },
            { minConcurrency: 10 },
        );

        let finished = false;
        const runPromise = pool.run();
        void runPromise.then(() => {
            finished = true;
        });
        await pausePromise;
        expect(count).toBe(20);
        expect(finished).toBe(false);
        expect(results).toHaveLength(count);
        results.forEach((r, i) => expect(r).toEqual(i));

        pool.resume();
        await runPromise;
        expect(count).toBe(50);
        expect(finished).toBe(true);
        expect(results).toHaveLength(count);
        results.forEach((r, i) => expect(r).toEqual(i));
    });

    test('should timeout after taskTimeoutSecs', async () => {
        const runTaskFunction = async () => {
            await sleep(1e3);
            return 1;
        };

        const pool = await makePool(
            {
                runTaskFunction,
                taskTimeoutSecs: 0.1,
                isFinishedFunction: async () => false,
                isTaskReadyFunction: async () => true,
            },
            { minConcurrency: 1, maxConcurrency: 1 },
        );

        const now = Date.now();
        await expect(pool.run()).rejects.toThrow('runTaskFunction timed out after 0.1 seconds.');
        expect(Date.now() - now).toBeGreaterThanOrEqual(100);
    });

    test('should not timeout if taskTimeoutSecs === 0', async () => {
        let finished = false;

        const runTaskFunction = async () => {
            await sleep(1e3);
            finished = true;
            return 1;
        };
        const pool = await makePool(
            {
                runTaskFunction,
                taskTimeoutSecs: 0,
                isFinishedFunction: async () => finished,
                isTaskReadyFunction: async () => !finished,
            },
            { minConcurrency: 1, maxConcurrency: 1 },
        );

        const now = Date.now();
        await expect(pool.run()).resolves.toBeUndefined();
        expect(Date.now() - now).toBeGreaterThanOrEqual(1e3);
    }, 10e3);

    test('should not timeout if taskTimeoutSecs not explicitly set', async () => {
        let finished = false;

        const runTaskFunction = async () => {
            await sleep(1e3);
            finished = true;
            return 1;
        };

        const pool = await makePool(
            {
                runTaskFunction,
                isFinishedFunction: async () => finished,
                isTaskReadyFunction: async () => !finished,
            },
            { minConcurrency: 1, maxConcurrency: 1 },
        );

        const now = Date.now();
        await expect(pool.run()).resolves.toBeUndefined();
        expect(Date.now() - now).toBeGreaterThanOrEqual(1e3);
    }, 10e3);

    describe('custom load signals', () => {
        /** Creates a minimal fake LoadSignal with static pre-seeded snapshots. */
        function createFakeLoadSignal(name: string, { overloadedRatio = 0.3, isOverloaded = false } = {}): LoadSignal {
            const now = Date.now();
            const snapshots: LoadSnapshot[] = Array.from({ length: 5 }, (_, i) => ({
                createdAt: new Date(now - (5 - i) * 100),
                isOverloaded,
            }));

            return {
                name,
                overloadedRatio,
                async start() {},
                async stop() {},
                getSample(sampleDurationMillis?: number) {
                    if (!sampleDurationMillis) return snapshots;
                    const cutoff = Date.now() - sampleDurationMillis;
                    return snapshots.filter((s) => +s.createdAt >= cutoff);
                },
            };
        }

        test('overloaded signal prevents concurrency from scaling up', async () => {
            const signal = createFakeLoadSignal('proxyHealth', { isOverloaded: true });

            let count = 0;
            const pool = await makePool(
                {
                    runTaskFunction: async () => {
                        count++;
                        await sleep(10);
                    },
                    isFinishedFunction: async () => count >= 50,
                    isTaskReadyFunction: async () => count < 50,
                },
                { minConcurrency: 1, maxConcurrency: 10, loadSignals: { custom: [signal] } },
            );

            await pool.run();

            expect(pool.desiredConcurrency).toBe(1);
        });

        test('signal info appears in SystemStatus.getCurrentStatus()', async () => {
            const signal = createFakeLoadSignal('navTimeout', { overloadedRatio: 0.2, isOverloaded: true });

            let count = 0;
            const pool = await makePool(
                {
                    runTaskFunction: async () => {
                        count++;
                        await sleep(10);
                    },
                    isFinishedFunction: async () => count >= 10,
                    isTaskReadyFunction: async () => count < 10,
                },
                { minConcurrency: 1, maxConcurrency: 10, loadSignals: { custom: [signal] } },
            );

            // `getCurrentStatus()` is telemetry on the concrete governor, not part of the pool-facing interface.
            const status = (pool.system as ConcurrencySystem).getCurrentStatus();
            expect(status.loadSignalInfo?.navTimeout?.isOverloaded).toBe(true);

            await pool.run();
        });
    });
});
