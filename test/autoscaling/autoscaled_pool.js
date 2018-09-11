import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'underscore';
import sinon from 'sinon';
import { delayPromise } from 'apify-shared/utilities';
import log from 'apify-shared/log';
import * as Apify from '../../build/index';
import { ACTOR_EVENT_NAMES } from '../../build/constants';
import * as utils from '../../build/utils';

/* eslint-disable no-underscore-dangle */

chai.use(chaiAsPromised);
const toBytes = x => x * 1024 * 1024;

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
                setTimeout(resolve, 10);
            });
        };

        const pool = new Apify.AutoscaledPool({
            minConcurrency: 1,
            maxConcurrency: 1,
            runTaskFunction,
            isFinishedFunction: () => Promise.resolve(isFinished),
            isTaskReadyFunction: () => Promise.resolve(!isFinished),
        });
        const startedAt = Date.now();
        await pool.run();

        expect(result).to.be.eql(_.range(0, 10));
        expect(Date.now() - startedAt).to.be.within(100, 200);
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
                setTimeout(resolve, 10);
            });
        };

        const pool = new Apify.AutoscaledPool({
            minConcurrency: 10,
            maxConcurrency: 10,
            runTaskFunction,
            isFinishedFunction: () => Promise.resolve(isFinished),
            isTaskReadyFunction: () => Promise.resolve(!isFinished),
        });

        const startedAt = Date.now();
        await pool.run();

        expect(result).to.be.eql(_.range(0, 100));
        expect(Date.now() - startedAt).to.be.within(100, 200);
    });

    class MockSystemStatus {
        constructor(okNow, okLately) {
            this.okNow = okNow;
            this.okLately = okLately;
            this.isOk = () => this.okNow;
            this.hasBeenOkLately = () => this.okLately;
        }
    }

    it('should autoscale correctly', async () => {
        const cb = () => {};
        const systemStatus = new MockSystemStatus(true, true);
        const pool = new Apify.AutoscaledPool({
            minConcurrency: 1,
            maxConcurrency: 100,
            runTaskFunction: () => Promise.resolve(),
            isFinishedFunction: () => Promise.resolve(false),
            isTaskReadyFunction: () => Promise.resolve(true),
        });
        pool.systemStatus = systemStatus;

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

        // Should not scale because current concurrency is too low.
        pool.desiredConcurrency = 50;
        pool.currentConcurrency = Math.floor(pool.desiredConcurrency * pool.desiredConcurrencyRatio) - 1;
        systemStatus.okLately = true;
        pool._autoscale(cb);
        expect(pool.desiredConcurrency).to.be.eql(50);

        // Should scale because we bumped up currConcurrency.
        pool.currentConcurrency = Math.floor(pool.desiredConcurrency * pool.desiredConcurrencyRatio);
        const newConcurrency = pool.desiredConcurrency + Math.ceil(pool.desiredConcurrency * pool.scaleUpStepRatio);
        pool._autoscale(cb);
        expect(pool.desiredConcurrency).to.be.eql(newConcurrency);
    });

    xit('should work with loggingIntervalMillis = null', async () => {
        const pool = new Apify.AutoscaledPool({
            ignoreMainProcess: true,
            minConcurrency: 1,
            maxConcurrency: 100,
            minFreeMemoryRatio: 0.1,
            runTaskFunction: () => Promise.resolve(),
            isFinishedFunction: () => Promise.resolve(false),
            isTaskReadyFunction: () => Promise.resolve(true),
            loggingIntervalMillis: null,
        });
        const mock = sinon.mock(utils);

        // Should not scale up.
        pool.concurrency = 1;
        pool.runningCount = 1;
        pool.intervalCounter = SCALE_UP_INTERVAL - 1;
        mock.expects('getMemoryInfo')
            .once()
            .returns(Promise.resolve({
                freeBytes: toBytes(5),
                totalBytes: toBytes(10),
                mainProcessBytes: 0,
            }));
        await pool._autoscale();
        expect(pool.concurrency).to.be.eql(1);

        mock.verify();
        mock.restore();
    });

    xit('should throw when some of the promises throws', async () => {
        let counter = 0;
        const runTaskFunction = () => {
            counter++;

            if (counter > 100) return;

            if (counter === 100) {
                const err = new Error('some-error');

                return new Promise((resolve, reject) => setTimeout(reject(err), 10));
            }

            return delayPromise(10);
        };

        const pool = new Apify.AutoscaledPool({
            minConcurrency: 10,
            maxConcurrency: 10,
            runTaskFunction,
            isFinishedFunction: () => Promise.resolve(false),
            isTaskReadyFunction: () => Promise.resolve(true),
        });

        await expect(pool.run()).to.be.rejectedWith('some-error');
    });

    xit('should throw when runTaskFunction throws', async () => {
        const runTaskFunction = () => {
            throw new Error('some-error');
        };

        const pool = new Apify.AutoscaledPool({
            minConcurrency: 10,
            maxConcurrency: 10,
            runTaskFunction,
            isFinishedFunction: () => Promise.resolve(false),
            isTaskReadyFunction: () => Promise.resolve(true),
        });

        await expect(pool.run()).to.be.rejectedWith('some-error');
    });

    xit('should scale down when CPU is overloaded', async () => {
        const pool = new Apify.AutoscaledPool({
            minConcurrency: 1,
            maxConcurrency: 100,
            minFreeMemoryRatio: 0.1,
            runTaskFunction: () => Promise.resolve(),
            isFinishedFunction: () => Promise.resolve(false),
            isTaskReadyFunction: () => Promise.resolve(true),
        });
        const mock = sinon.mock(utils);

        // Emit CPU overloaded events but not required amount so that we can still scale up.
        for (let i = 0; i < SCALE_DOWN_INTERVAL - 1; i++) {
            Apify.events.emit(ACTOR_EVENT_NAMES.CPU_INFO, { isCpuOverloaded: true });
        }

        // Should scale up.
        pool.intervalCounter = SCALE_UP_INTERVAL - 1;
        pool.runningCount = pool.concurrency;
        mock.expects('getMemoryInfo')
            .once()
            .returns(Promise.resolve({ freeBytes: toBytes(9.99), totalBytes: toBytes(10) }));
        await pool._autoscale();
        expect(pool.concurrency).to.be.eql(1 + SCALE_UP_MAX_STEP);

        // Should scale up.
        pool.intervalCounter = SCALE_UP_INTERVAL - 1;
        pool.runningCount = pool.concurrency;
        mock.expects('getMemoryInfo')
            .once()
            .returns(Promise.resolve({ freeBytes: toBytes(9.99), totalBytes: toBytes(10) }));
        await pool._autoscale();
        expect(pool.concurrency).to.be.eql(1 + (2 * SCALE_UP_MAX_STEP));

        // Emit final CPU overloaded = true event.
        Apify.events.emit(ACTOR_EVENT_NAMES.CPU_INFO, { isCpuOverloaded: true });

        // Should scale up but because of CPU overloaded event it always scales down.
        pool.runningCount = pool.concurrency;
        for (let i = 1; i <= 5; i++) {
            pool.intervalCounter = SCALE_UP_INTERVAL - 1;
            mock.expects('getMemoryInfo')
                .once()
                .returns(Promise.resolve({ freeBytes: toBytes(9.99), totalBytes: toBytes(10) }));
            await pool._autoscale(); //eslint-disable-line
            expect(pool.concurrency).to.be.eql((1 + (2 * SCALE_UP_MAX_STEP)) - i);
        }

        // Emit CPU overloaded = false event.
        Apify.events.emit(ACTOR_EVENT_NAMES.CPU_INFO, { isCpuOverloaded: false });

        // Should scale up again.
        pool.runningCount = pool.concurrency;
        pool.intervalCounter = SCALE_UP_INTERVAL - 1;
        mock.expects('getMemoryInfo')
            .once()
            .returns(Promise.resolve({ freeBytes: toBytes(9.99), totalBytes: toBytes(10) }));
        await pool._autoscale();
        expect(pool.concurrency).to.be.eql((1 + (3 * SCALE_UP_MAX_STEP)) - 5);

        mock.verify();
        mock.restore();
    });

    xit('should not handle tasks added after isFinishedFunction returned true', async () => {
        const tasks = [];
        const finished = [];

        let isFinished = false;

        // Start 3 tasks immediately.
        tasks.push(delayPromise(50).then(() => finished.push(0)));
        tasks.push(delayPromise(50).then(() => finished.push(1)));
        tasks.push(delayPromise(50).then(() => finished.push(2)));

        setTimeout(() => {
            isFinished = true;
        }, 200);

        // Add 2 tasks after 500ms.
        setTimeout(() => tasks.push(delayPromise(50).then(() => finished.push(3))), 300);
        setTimeout(() => tasks.push(delayPromise(50).then(() => finished.push(4))), 300);

        // Run the pool and close it after 3s.
        const pool = new Apify.AutoscaledPool({
            maybeRunIntervalMillis: 10,
            minConcurrency: 3,
            runTaskFunction: () => tasks.pop(),
            isFinishedFunction: () => Promise.resolve(isFinished),
            isTaskReadyFunction: () => Promise.resolve(true),
        });
        await pool.run();

        // Check finished tasks.
        expect(finished).to.be.eql([0, 1, 2]);
    });

    xit('should not handle tasks added if isTaskReadyFunction returned true', async () => {
        const tasks = [];
        const finished = [];

        let isFinished = false;
        let isTaskReady = true;

        const getTask = (id) => {
            return () => delayPromise(50).then(() => finished.push(id));
        };

        // Start 3 tasks immediately.
        tasks.push(getTask(0));
        tasks.push(getTask(1));
        setTimeout(() => tasks.push(getTask(2)), 150);

        setTimeout(() => {
            isTaskReady = false;
        }, 200);

        // Add 2 tasks after 500ms.
        setTimeout(() => tasks.push(getTask(3)), 300);
        setTimeout(() => tasks.push(getTask(4)), 300);

        // Remove tasks and se isTaskReady=true to accept a new task.
        setTimeout(() => {
            tasks.pop();
            tasks.pop();
            isTaskReady = true;
        }, 390);

        // Add one more task.
        setTimeout(() => tasks.push(getTask(5)), 400);

        // Finish.
        setTimeout(() => {
            isFinished = true;
        }, 500);

        // Run the pool and close it after 3s.
        const pool = new Apify.AutoscaledPool({
            maybeRunIntervalMillis: 10,
            minConcurrency: 3,
            runTaskFunction: () => {
                const task = tasks.shift();

                if (!task) return;

                return task();
            },
            isFinishedFunction: () => Promise.resolve(isFinished),
            isTaskReadyFunction: () => Promise.resolve(isTaskReady),
        });
        await pool.run();

        // Check finished tasks.
        expect(finished).to.be.eql([0, 1, 2, 5]);
    });
});

/* eslint-enable no-underscore-dangle */
