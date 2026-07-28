import type { AutoscaledPoolTaskLoopOptions, ConcurrencySystemOptions, LoadSignal, LoadSnapshot } from '@crawlee/core';
import { AutoscaledPool, ConcurrencySystem } from '@crawlee/core';
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
    poolOptions: AutoscaledPoolTaskLoopOptions,
    concurrencyOptions: ConcurrencySystemOptions = {},
): Promise<AutoscaledPool> {
    const concurrencySystem = new ConcurrencySystem(concurrencyOptions);
    await concurrencySystem.start();
    onTestFinished(async () => concurrencySystem.stop());

    return new AutoscaledPool({ ...poolOptions, concurrencySystem });
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

        expect(pool.minConcurrency).toBe(3);
        expect(pool.maxConcurrency).toBe(13);
        expect(pool.desiredConcurrency).toBe(9);

        const promise = pool.run();

        // Test setting concurrency
        pool.minConcurrency = 4;
        pool.maxConcurrency = 14;
        pool.desiredConcurrency = 7;

        expect(pool.minConcurrency).toBe(4);
        expect(pool.maxConcurrency).toBe(14);
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
            pool.system._autoscale(cb);
            expect(pool.desiredConcurrency).toBe(2);

            // @ts-expect-error Calling private method on the governor
            pool.system._autoscale(cb);
            expect(pool.desiredConcurrency).toBe(2); // because currentConcurrency is not high enough;

            // @ts-expect-error Overwriting readonly private prop
            pool.system._currentConcurrency = 2;
            // @ts-expect-error Calling private method on the governor
            pool.system._autoscale(cb);
            expect(pool.desiredConcurrency).toBe(3);

            systemStatus.okNow = false; // this should have no effect
            // @ts-expect-error Overwriting readonly private prop
            pool.system._currentConcurrency = 3;
            // @ts-expect-error Calling private method on the governor
            pool.system._autoscale(cb);
            expect(pool.desiredConcurrency).toBe(4);

            systemStatus.okLately = false;
            // @ts-expect-error Calling private method on the governor
            pool.system._autoscale(cb);
            expect(pool.desiredConcurrency).toBe(3);
        });

        test('works with high values', () => {
            // Should not scale because current concurrency is too low.
            pool.desiredConcurrency = 50;
            // @ts-expect-error Overwriting readonly private prop
            pool.system._currentConcurrency =
                // @ts-expect-error Accessing private prop on the governor
                Math.floor(pool.desiredConcurrency * pool.system.desiredConcurrencyRatio) - 1;
            systemStatus.okLately = true;
            // @ts-expect-error Calling private method on the governor
            pool.system._autoscale(cb);
            expect(pool.desiredConcurrency).toBe(50);

            // Should scale because we bumped up current concurrency.
            // @ts-expect-error Overwriting readonly private prop
            pool.system._currentConcurrency =
                // @ts-expect-error Accessing private prop on the governor
                Math.floor(pool.desiredConcurrency * pool.system.desiredConcurrencyRatio);
            let newConcurrency =
                // @ts-expect-error Accessing private prop on the governor
                pool.desiredConcurrency + Math.ceil(pool.desiredConcurrency * pool.system.scaleUpStepRatio);
            // @ts-expect-error Calling private method on the governor
            pool.system._autoscale(cb);
            expect(pool.desiredConcurrency).toEqual(newConcurrency);

            // Should scale down.
            systemStatus.okLately = false;
            newConcurrency =
                // @ts-expect-error Accessing private prop on the governor
                pool.desiredConcurrency - Math.ceil(pool.desiredConcurrency * pool.system.scaleDownStepRatio);
            // @ts-expect-error Calling private method on the governor
            pool.system._autoscale(cb);
            expect(pool.desiredConcurrency).toEqual(newConcurrency);
        });

        test('works at minConcurrency when currently overloaded', async () => {
            let limit = 5;
            let concurrencyLog: number[] = [];
            let count = 0;
            // @ts-expect-error Overwriting readonly private prop on the governor
            pool.system.systemStatus.okNow = false;
            // @ts-expect-error Overwriting readonly private prop
            pool.runTaskFunction = async () => {
                await sleep(10);
                count++;
            };
            // @ts-expect-error Overwriting readonly private prop
            pool.isFinishedFunction = async () => count >= limit;
            // @ts-expect-error Overwriting readonly private prop
            pool.isTaskReadyFunction = async () => count < limit;
            pool.desiredConcurrency = 10;

            // Spy on the governor's concurrency accounting - that is where per-task current concurrency now lives.
            // @ts-expect-error Overwriting readonly private prop on the governor
            pool.system._currentConcurrency = pool.currentConcurrency;
            Object.defineProperty(pool.system, 'currentConcurrency', {
                get() {
                    return this._currentConcurrency;
                },
                set(v) {
                    concurrencyLog.push(v);
                    this._currentConcurrency = v;
                },
            });

            expect(pool.currentConcurrency).toBe(0);

            await pool.run();
            expect(concurrencyLog.some((n) => n > 1)).toBe(false);

            limit = 50;
            concurrencyLog = [];
            count = 0;
            pool.minConcurrency = 5;

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
            },
            { minConcurrency: 3 },
        );

        // @ts-expect-error Overwriting readonly private prop
        pool.maybeRunIntervalMillis = 5;

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
            },
            { maxConcurrency: 1 },
        );
        // @ts-expect-error Overwriting readonly private prop
        pool.maybeRunIntervalMillis = 1;
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
        pool.system._autoscale(() => {});
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
                { minConcurrency: 1, maxConcurrency: 10, systemStatusOptions: { loadSignals: [signal] } },
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
                { minConcurrency: 1, maxConcurrency: 10, systemStatusOptions: { loadSignals: [signal] } },
            );

            // `getCurrentStatus()` is telemetry on the concrete governor, not part of the pool-facing interface.
            const status = (pool.system as ConcurrencySystem).getCurrentStatus();
            expect(status.loadSignalInfo?.navTimeout?.isOverloaded).toBe(true);

            await pool.run();
        });
    });
});
