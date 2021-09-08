/* eslint-disable no-underscore-dangle */

import os from 'os';
import sinon from 'sinon';
import { ACTOR_EVENT_NAMES, ENV_VARS } from '@apify/consts';
import log from '../../build/utils_log';
import * as Apify from '../../build/index';
import events from '../../build/events';
import Snapshotter from '../../build/autoscaling/snapshotter';
import * as utils from '../../build/utils';

const toBytes = (x) => x * 1024 * 1024;

describe('Snapshotter', () => {
    let logLevel;
    beforeAll(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    afterAll(() => {
        log.setLevel(logLevel);
    });

    test('should collect snapshots with some values', async () => {
        // mock client data
        const oldStats = utils.apifyClient.stats;
        utils.apifyClient.stats = {};
        utils.apifyClient.stats.rateLimitErrors = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

        const snapshotter = new Snapshotter();
        await snapshotter.start();

        await Apify.utils.sleep(625);
        utils.apifyClient.stats.rateLimitErrors = [0, 0, 2, 0, 0, 0, 0, 0, 0, 0];
        await Apify.utils.sleep(625);

        await snapshotter.stop();
        const memorySnapshots = snapshotter.getMemorySample();
        const eventLoopSnapshots = snapshotter.getEventLoopSample();
        const cpuSnapshots = snapshotter.getCpuSample();
        const clientSnapshots = snapshotter.getClientSample();

        expect(Array.isArray(cpuSnapshots)).toBe(true);
        expect(cpuSnapshots.length).toBeGreaterThanOrEqual(1);
        cpuSnapshots.forEach((ss) => {
            expect(ss.createdAt).toBeInstanceOf(Date);
            expect(typeof ss.isOverloaded).toBe('boolean');
            expect(typeof ss.usedRatio).toBe('number');
        });

        expect(Array.isArray(memorySnapshots)).toBe(true);
        expect(memorySnapshots.length).toBeGreaterThanOrEqual(1);
        memorySnapshots.forEach((ss) => {
            expect(ss.createdAt).toBeInstanceOf(Date);
            expect(typeof ss.isOverloaded).toBe('boolean');
            expect(typeof ss.usedBytes).toBe('number');
        });

        expect(Array.isArray(eventLoopSnapshots)).toBe(true);
        expect(eventLoopSnapshots.length).toBeGreaterThanOrEqual(2);
        eventLoopSnapshots.forEach((ss) => {
            expect(ss.createdAt).toBeInstanceOf(Date);
            expect(typeof ss.isOverloaded).toBe('boolean');
            expect(typeof ss.exceededMillis).toBe('number');
        });

        expect(Array.isArray(clientSnapshots)).toBe(true);
        expect(clientSnapshots.length).toBeGreaterThanOrEqual(1);
        clientSnapshots.forEach((ss) => {
            expect(ss.createdAt).toBeInstanceOf(Date);
            expect(typeof ss.isOverloaded).toBe('boolean');
            expect(typeof ss.rateLimitErrorCount).toBe('number');
        });

        utils.apifyClient.stats = oldStats;
    });

    test('should override default timers', async () => {
        const options = {
            eventLoopSnapshotIntervalSecs: 0.05,
            memorySnapshotIntervalSecs: 0.1,
            cpuSnapshotIntervalSecs: 0.1,
        };
        const snapshotter = new Snapshotter(options);
        await snapshotter.start();
        await new Promise((resolve) => setTimeout(resolve, 500));
        await snapshotter.stop();
        // const memorySnapshots = snapshotter.getMemorySample();
        // const eventLoopSnapshots = snapshotter.getEventLoopSample();
        const cpuSnapshots = snapshotter.getCpuSample();

        expect(cpuSnapshots.length).toBeGreaterThanOrEqual(5);
        // TODO memory snapshots are async and there's no way to wait for the promises
        // so I'm turning this off for now, because the test is flaky. We can rewrite
        // this when we fully migrate to TS and get rid of the import mess that we
        // have now in the built index.js which prevents reasonable mocking.
        // expect(memorySnapshots.length).toBeGreaterThanOrEqual(5);
        // TODO this test is too flaky on windows, often resulting in 9, sometimes even 8
        // expect(eventLoopSnapshots.length).toBeGreaterThanOrEqual(10);
    });

    test('correctly marks CPU overloaded using Platform event', async () => {
        process.env[ENV_VARS.IS_AT_HOME] = '1';
        let count = 0;
        const emitAndWait = async (delay) => {
            events.emit(ACTOR_EVENT_NAMES.SYSTEM_INFO, {
                isCpuOverloaded: count % 2 === 0,
                createdAt: (new Date()).toISOString(),
                cpuCurrentUsage: 66.6,
            });
            count++;
            await Apify.utils.sleep(delay);
        };

        try {
            const snapshotter = new Snapshotter();
            await snapshotter.start();
            await emitAndWait(10);
            await emitAndWait(10);
            await emitAndWait(10);
            await emitAndWait(0);
            await snapshotter.stop();
            const cpuSnapshots = snapshotter.getCpuSample();

            expect(cpuSnapshots).toHaveLength(4);
            cpuSnapshots.forEach((ss, i) => {
                expect(ss.createdAt).toBeInstanceOf(Date);
                expect(typeof ss.isOverloaded).toBe('boolean');
                expect(ss.isOverloaded).toEqual(i % 2 === 0);
            });
        } finally {
            delete process.env[ENV_VARS.IS_AT_HOME];
        }
    });

    test('correctly marks CPU overloaded using OS metrics', () => {
        const mock = sinon.mock(os);
        const fakeCpu = [{
            times: {
                idle: 0,
                other: 0,
            },
        }];
        const { times } = fakeCpu[0];

        mock.expects('cpus').exactly(5).returns(fakeCpu);

        const noop = () => {};
        const snapshotter = new Snapshotter({ maxUsedCpuRatio: 0.5 });

        snapshotter._snapshotCpuOnLocal(noop);

        times.idle++;
        times.other++;
        snapshotter._snapshotCpuOnLocal(noop);

        times.other += 2;
        snapshotter._snapshotCpuOnLocal(noop);

        times.idle += 2;
        snapshotter._snapshotCpuOnLocal(noop);

        times.other += 4;
        snapshotter._snapshotCpuOnLocal(noop);

        const loopSnapshots = snapshotter.getCpuSample();

        expect(loopSnapshots.length).toBe(5);
        expect(loopSnapshots[0].isOverloaded).toBe(false);
        expect(loopSnapshots[1].isOverloaded).toBe(false);
        expect(loopSnapshots[2].isOverloaded).toBe(true);
        expect(loopSnapshots[3].isOverloaded).toBe(false);
        expect(loopSnapshots[4].isOverloaded).toBe(true);

        mock.verify();
    });

    test('correctly marks eventLoopOverloaded', () => {
        const clock = sinon.useFakeTimers();
        try {
            const noop = () => {};
            const snapshotter = new Snapshotter({ maxBlockedMillis: 5, eventLoopSnapshotIntervalSecs: 0 });
            snapshotter._snapshotEventLoop(noop);
            clock.tick(1);
            snapshotter._snapshotEventLoop(noop);
            clock.tick(2);
            snapshotter._snapshotEventLoop(noop);
            clock.tick(7);
            snapshotter._snapshotEventLoop(noop);
            clock.tick(3);
            snapshotter._snapshotEventLoop(noop);
            const loopSnapshots = snapshotter.getEventLoopSample();

            expect(loopSnapshots.length).toBe(5);
            expect(loopSnapshots[0].isOverloaded).toBe(false);
            expect(loopSnapshots[1].isOverloaded).toBe(false);
            expect(loopSnapshots[2].isOverloaded).toBe(false);
            expect(loopSnapshots[3].isOverloaded).toBe(true);
            expect(loopSnapshots[4].isOverloaded).toBe(false);
        } finally {
            clock.restore();
        }
    });

    test(
        'correctly marks memoryOverloaded using OS metrics',
        async () => { /* eslint-disable no-underscore-dangle */
            const noop = () => {};
            const memoryData = {
                mainProcessBytes: toBytes(1000),
                childProcessesBytes: toBytes(1000),
            };
            const getMem = async () => ({ ...memoryData });
            const stub = sinon.stub(utils, 'getMemoryInfo');
            stub.callsFake(getMem);

            process.env[ENV_VARS.MEMORY_MBYTES] = '10000';

            const snapshotter = new Snapshotter({ maxUsedMemoryRatio: 0.5 });
            await snapshotter._snapshotMemoryOnLocal(noop);
            memoryData.mainProcessBytes = toBytes(2000);
            await snapshotter._snapshotMemoryOnLocal(noop);
            memoryData.childProcessesBytes = toBytes(2000);
            await snapshotter._snapshotMemoryOnLocal(noop);
            memoryData.mainProcessBytes = toBytes(3001);
            await snapshotter._snapshotMemoryOnLocal(noop);
            memoryData.childProcessesBytes = toBytes(1999);
            await snapshotter._snapshotMemoryOnLocal(noop);
            const memorySnapshots = snapshotter.getMemorySample();

            expect(memorySnapshots.length).toBe(5);
            expect(memorySnapshots[0].isOverloaded).toBe(false);
            expect(memorySnapshots[1].isOverloaded).toBe(false);
            expect(memorySnapshots[2].isOverloaded).toBe(false);
            expect(memorySnapshots[3].isOverloaded).toBe(true);
            expect(memorySnapshots[4].isOverloaded).toBe(false);

            delete process.env[ENV_VARS.MEMORY_MBYTES];
        },
    );

    test('correctly logs critical memory overload', () => {
        const memoryDataOverloaded = {
            memCurrentBytes: toBytes(7600),
        };
        const memoryDataNotOverloaded = {
            memCurrentBytes: toBytes(7500),
        };
        let logged = false;
        process.env[ENV_VARS.MEMORY_MBYTES] = '10000';
        const snapshotter = new Snapshotter({ maxUsedMemoryRatio: 0.5 });
        const warning = () => { logged = true; };
        const stub = sinon.stub(snapshotter.log, 'warning');
        stub.callsFake(warning);

        snapshotter._memoryOverloadWarning(memoryDataOverloaded);
        expect(logged).toBe(true);

        logged = false;

        snapshotter._memoryOverloadWarning(memoryDataNotOverloaded);
        expect(logged).toBe(false);

        delete process.env[ENV_VARS.MEMORY_MBYTES];
    });

    test(
        'correctly marks clientOverloaded',
        () => { /* eslint-disable no-underscore-dangle */
            const noop = () => {};
            // mock client data
            const oldStats = utils.apifyClient.stats;
            utils.apifyClient.stats = {};
            utils.apifyClient.stats.rateLimitErrors = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

            const snapshotter = new Snapshotter({ maxClientErrors: 1 });
            snapshotter._snapshotClient(noop);
            utils.apifyClient.stats.rateLimitErrors = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
            snapshotter._snapshotClient(noop);
            utils.apifyClient.stats.rateLimitErrors = [10, 5, 2, 0, 0, 0, 0, 0, 0, 0];
            snapshotter._snapshotClient(noop);
            utils.apifyClient.stats.rateLimitErrors = [100, 24, 4, 2, 0, 0, 0, 0, 0, 0];
            snapshotter._snapshotClient(noop);

            const clientSnapshots = snapshotter.getClientSample();

            expect(clientSnapshots.length).toBe(4);
            expect(clientSnapshots[0].isOverloaded).toBe(false);
            expect(clientSnapshots[1].isOverloaded).toBe(false);
            expect(clientSnapshots[2].isOverloaded).toBe(false);
            expect(clientSnapshots[3].isOverloaded).toBe(true);

            utils.apifyClient.stats = oldStats;
        },
    );

    test('.get[.*]Sample limits amount of samples', async () => {
        const SAMPLE_SIZE_MILLIS = 120;
        const options = {
            eventLoopSnapshotIntervalSecs: 0.01,
            memorySnapshotIntervalSecs: 0.01,
        };
        const snapshotter = new Snapshotter(options);
        await snapshotter.start();
        await Apify.utils.sleep(300);
        await snapshotter.stop();
        const memorySnapshots = snapshotter.getMemorySample();
        const eventLoopSnapshots = snapshotter.getEventLoopSample();
        const memorySample = snapshotter.getMemorySample(SAMPLE_SIZE_MILLIS);
        const eventLoopSample = snapshotter.getEventLoopSample(SAMPLE_SIZE_MILLIS);

        expect(memorySnapshots.length).toBeGreaterThan(memorySample.length);
        expect(eventLoopSnapshots.length).toBeGreaterThan(eventLoopSample.length);
        for (let i = 0; i < eventLoopSample.length; i++) {
            const sample = eventLoopSample[eventLoopSample.length - 1 - i];
            const snapshot = eventLoopSnapshots[eventLoopSnapshots.length - 1 - i];
            expect(sample).toEqual(snapshot);
        }
        const diffBetween = eventLoopSample[eventLoopSample.length - 1].createdAt - eventLoopSnapshots[eventLoopSnapshots.length - 1].createdAt;
        const diffWithin = eventLoopSample[0].createdAt - eventLoopSample[eventLoopSample.length - 1].createdAt;
        expect(diffBetween).toBeLessThan(SAMPLE_SIZE_MILLIS);
        expect(diffWithin).toBeLessThan(SAMPLE_SIZE_MILLIS);
    });
});
