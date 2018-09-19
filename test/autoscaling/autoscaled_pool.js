import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'underscore';
import { delayPromise } from 'apify-shared/utilities';
import log from 'apify-shared/log';
import AutoscaledPool from '../../build/autoscaling/autoscaled_pool';

/* eslint-disable no-underscore-dangle */

chai.use(chaiAsPromised);

describe('AutoscaledPool', () => {
    let logLevel;
    before(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    after(() => {
        log.setLevel(logLevel);
    });

    it('should work with concurrency 1', async () => {
        const range = _.range(0, 10);
        const result = [];

        let isFinished = false;

        const runTaskFunction = () => {
            if (range.length === 1) {
                isFinished = true;
            }

            return new Promise((resolve) => {
                const item = range.shift();
                result.push(item);
                setTimeout(resolve, 5);
            });
        };

        const pool = new AutoscaledPool({
            minConcurrency: 1,
            maxConcurrency: 1,
            runTaskFunction,
            isFinishedFunction: () => Promise.resolve(isFinished),
            isTaskReadyFunction: () => Promise.resolve(!isFinished),
        });
        const startedAt = Date.now();
        await pool.run();

        expect(result).to.be.eql(_.range(0, 10));
        expect(Date.now() - startedAt).to.be.within(50, 200);
    });

    it('should work with concurrency 10', async () => {
        const range = _.range(0, 100);
        const result = [];

        let isFinished = false;

        const runTaskFunction = () => {
            if (range.length === 1) {
                isFinished = true;
            }

            return new Promise((resolve) => {
                const item = range.shift();
                result.push(item);
                setTimeout(resolve, 5);
            });
        };

        const pool = new AutoscaledPool({
            minConcurrency: 10,
            maxConcurrency: 10,
            runTaskFunction,
            isFinishedFunction: () => Promise.resolve(isFinished),
            isTaskReadyFunction: () => Promise.resolve(!isFinished),
        });

        const startedAt = Date.now();
        await pool.run();

        expect(result).to.be.eql(_.range(0, 100));
        expect(Date.now() - startedAt).to.be.within(50, 200);
    });

    describe('should scale correctly', () => {
        class MockSystemStatus {
            constructor(okNow, okLately) {
                this.okNow = okNow;
                this.okLately = okLately;
                this.getCurrentStatus = () => ({ isSystemIdle: this.okNow });
                this.getHistoricalStatus = () => ({ isSystemIdle: this.okLately });
            }
        }

        let pool;
        let systemStatus;
        const cb = () => {};
        beforeEach(() => {
            systemStatus = new MockSystemStatus(true, true);
            pool = new AutoscaledPool({
                minConcurrency: 1,
                maxConcurrency: 100,
                runTaskFunction: () => Promise.resolve(),
                isFinishedFunction: () => Promise.resolve(false),
                isTaskReadyFunction: () => Promise.resolve(true),
            });
            pool.systemStatus = systemStatus;
        });

        it('works with low values', () => {
            pool._autoscale(cb);
            expect(pool.desiredConcurrency).to.be.eql(2);

            pool._autoscale(cb);
            expect(pool.desiredConcurrency).to.be.eql(2); // because currentConcurrency is not high enough;

            pool.currentConcurrency = 2;
            pool._autoscale(cb);
            expect(pool.desiredConcurrency).to.be.eql(3);

            systemStatus.okNow = false; // this should have no effect
            pool.currentConcurrency = 3;
            pool._autoscale(cb);
            expect(pool.desiredConcurrency).to.be.eql(4);

            systemStatus.okLately = false;
            pool._autoscale(cb);
            expect(pool.desiredConcurrency).to.be.eql(3);
        });

        it('works with high values', () => {
            // Should not scale because current concurrency is too low.
            pool.desiredConcurrency = 50;
            pool.currentConcurrency = Math.floor(pool.desiredConcurrency * pool.desiredConcurrencyRatio) - 1;
            systemStatus.okLately = true;
            pool._autoscale(cb);
            expect(pool.desiredConcurrency).to.be.eql(50);

            // Should scale because we bumped up current concurrency.
            pool.currentConcurrency = Math.floor(pool.desiredConcurrency * pool.desiredConcurrencyRatio);
            let newConcurrency = pool.desiredConcurrency + Math.ceil(pool.desiredConcurrency * pool.scaleUpStepRatio);
            pool._autoscale(cb);
            expect(pool.desiredConcurrency).to.be.eql(newConcurrency);

            // Should scale down.
            systemStatus.okLately = false;
            newConcurrency = pool.desiredConcurrency - Math.ceil(pool.desiredConcurrency * pool.scaleDownStepRatio);
            pool._autoscale(cb);
            expect(pool.desiredConcurrency).to.be.eql(newConcurrency);
        });
    });

    describe('should throw', () => {
        // Turn off unnecessary error logging.
        let originalLevel;
        before(() => {
            originalLevel = log.getLevel();
            log.setLevel(log.LEVELS.OFF);
        });

        after(() => {
            log.setLevel(originalLevel);
        });

        it('when some of the promises throws', async () => {
            let counter = 0;
            const runTaskFunction = () => {
                counter++;

                if (counter > 100) return;

                if (counter === 100) {
                    const err = new Error('some-promise-error');

                    return new Promise((resolve, reject) => setTimeout(reject(err), 3));
                }

                return delayPromise(3);
            };

            const pool = new AutoscaledPool({
                minConcurrency: 10,
                maxConcurrency: 10,
                runTaskFunction,
                isFinishedFunction: () => Promise.resolve(false),
                isTaskReadyFunction: () => Promise.resolve(true),
            });

            await expect(pool.run()).to.be.rejectedWith('some-promise-error');
        });

        it('when runTaskFunction throws', async () => {
            const runTaskFunction = () => {
                throw new Error('some-runtask-error');
            };

            const pool = new AutoscaledPool({
                minConcurrency: 10,
                maxConcurrency: 10,
                runTaskFunction,
                isFinishedFunction: () => Promise.resolve(false),
                isTaskReadyFunction: () => Promise.resolve(true),
            });


            await expect(pool.run()).to.be.rejectedWith('some-runtask-error');
        });
    });


    it('should not handle tasks added after isFinishedFunction returned true', async () => {
        const tasks = [];
        const finished = [];

        let isFinished = false;

        // Prepare 3 tasks.
        tasks.push(() => delayPromise(10).then(() => finished.push(0)));
        tasks.push(() => delayPromise(10).then(() => finished.push(1)));
        tasks.push(() => delayPromise(10).then(() => finished.push(2)));

        // Run the pool and close it after 3s.
        const pool = new AutoscaledPool({
            minConcurrency: 3,
            runTaskFunction: () => {
                const task = tasks.shift();
                if (!task) return;
                return task();
            },
            isFinishedFunction: () => Promise.resolve(isFinished),
            isTaskReadyFunction: () => Promise.resolve(!isFinished),
        });
        pool.maybeRunIntervalMillis = 5;

        const poolPromise = pool.run();
        // This is an important part of the test to see if the tasks do not get
        // stuck in a microtask cycle. Do not refactor this to some other scheduling.
        setTimeout(() => {
            isFinished = true;
        }, 50);
        // Add 2 tasks after 70ms.
        setTimeout(() => tasks.push(() => delayPromise(5).then(() => finished.push(3))), 70);
        setTimeout(() => tasks.push(() => delayPromise(5).then(() => finished.push(4))), 70);
        // Make sure tasks were not added.
        await delayPromise(100);

        // Check finished tasks.
        await poolPromise;
        expect(finished).to.be.eql([0, 1, 2]);
    });

    it('should break and resume when the task queue is empty for a while', async () => {
        const tasks = [];
        const finished = [];

        let isFinished = false;
        let isTaskReady = true;

        const getTask = (id) => {
            return () => delayPromise(10).then(() => finished.push(id));
        };

        // Start 3 tasks immediately.
        tasks.push(getTask(0));
        tasks.push(getTask(1));
        setTimeout(() => tasks.push(getTask(2)), 20);

        setTimeout(() => {
            isTaskReady = false;
        }, 50);

        // Add 2 tasks after 80ms.
        setTimeout(() => tasks.push(getTask(3)), 80);
        setTimeout(() => tasks.push(getTask(4)), 80);

        // Remove tasks and set isTaskReady=true to accept a new task.
        setTimeout(() => {
            tasks.pop();
            tasks.pop();
            isTaskReady = true;
        }, 120);

        // Add one more task.
        setTimeout(() => tasks.push(getTask(5)), 150);

        // Finish.
        setTimeout(() => {
            isFinished = true;
        }, 200);

        // Run the pool and close it after 3s.
        const pool = new AutoscaledPool({
            minConcurrency: 3,
            runTaskFunction: () => {
                const task = tasks.shift();

                if (!task) return;

                return task();
            },
            isFinishedFunction: () => Promise.resolve(isFinished),
            isTaskReadyFunction: () => Promise.resolve(!isFinished && isTaskReady),
        });
        pool.maybeRunIntervalMillis = 5;
        await pool.run();

        // Check finished tasks.
        expect(finished).to.be.eql([0, 1, 2, 5]);
    });

    it('should work with loggingIntervalMillis = null', async () => {
        const pool = new AutoscaledPool({
            minConcurrency: 1,
            maxConcurrency: 100,
            runTaskFunction: () => Promise.resolve(),
            isFinishedFunction: () => Promise.resolve(false),
            isTaskReadyFunction: () => Promise.resolve(true),
            loggingIntervalMillis: null,
        });
        pool._autoscale(() => {});
        expect(pool.desiredConcurrency).to.be.eql(2);
    });
});

/* eslint-enable no-underscore-dangle */
