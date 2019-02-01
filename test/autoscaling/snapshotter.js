import { expect } from 'chai';
import sinon from 'sinon';
import log from 'apify-shared/log';
import { ACTOR_EVENT_NAMES, ENV_VARS } from 'apify-shared/consts';
import * as Apify from '../../build/index';
import events from '../../build/events';
import Snapshotter from '../../build/autoscaling/snapshotter';
import * as utils from '../../build/utils';

const toBytes = x => x * 1024 * 1024;

describe('Snapshotter', () => {
    let logLevel;
    before(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    after(() => {
        log.setLevel(logLevel);
    });

    it('should collect snapshots with some values', async () => {
        // mock client data
        const oldStats = utils.apifyClient.stats;
        utils.apifyClient.stats = {};
        utils.apifyClient.stats.rateLimitErrors = 0;

        const snapshotter = new Snapshotter();
        await snapshotter.start();

        await Apify.utils.sleep(625);
        utils.apifyClient.stats.rateLimitErrors = 2;
        await Apify.utils.sleep(625);

        await snapshotter.stop();
        const memorySnapshots = snapshotter.getMemorySample();
        const eventLoopSnapshots = snapshotter.getEventLoopSample();
        const cpuSnapshots = snapshotter.getCpuSample();
        const clientSnapshots = snapshotter.getClientSample();

        expect(cpuSnapshots).to.be.an('array');
        expect(cpuSnapshots).to.have.lengthOf(0);

        expect(memorySnapshots).to.be.an('array');
        expect(memorySnapshots).to.have.lengthOf(2);
        memorySnapshots.forEach((ss) => {
            expect(ss.createdAt).to.be.a('date');
            expect(ss.isOverloaded).to.be.a('boolean');
            expect(ss.totalBytes).to.be.a('number');
            expect(ss.usedBytes).to.be.a('number');
            expect(ss.freeBytes).to.be.a('number');
            expect(ss.mainProcessBytes).to.be.a('number');
            expect(ss.childProcessesBytes).to.be.a('number');
        });

        expect(eventLoopSnapshots).to.be.an('array');
        expect(eventLoopSnapshots).to.have.lengthOf(3);
        eventLoopSnapshots.forEach((ss) => {
            expect(ss.createdAt).to.be.a('date');
            expect(ss.isOverloaded).to.be.a('boolean');
            expect(ss.exceededMillis).to.be.a('number');
        });

        expect(clientSnapshots).to.be.an('array');
        expect(clientSnapshots).to.have.lengthOf(2);
        clientSnapshots.forEach((ss) => {
            expect(ss.createdAt).to.be.a('date');
            expect(ss.isOverloaded).to.be.a('boolean');
            expect(ss.rateLimitErrorCount).to.be.a('number');
        });

        utils.apifyClient.stats = oldStats;
    });

    it('should override default timers', async () => {
        const options = {
            eventLoopSnapshotIntervalSecs: 0.05,
            memorySnapshotIntervalSecs: 0.1,
            snapshotHistorySecs: 0.5,
        };
        const snapshotter = new Snapshotter(options);
        await snapshotter.start();
        await Apify.utils.sleep(600);
        await snapshotter.stop();
        const memorySnapshots = snapshotter.getMemorySample();
        const eventLoopSnapshots = snapshotter.getEventLoopSample();
        const cpuSnapshots = snapshotter.getCpuSample();

        expect(cpuSnapshots).to.have.lengthOf(0);
        expect(memorySnapshots.length).to.be.above(1);
        expect(eventLoopSnapshots.length).to.be.above(9);
    });

    it('should collect CPU events on Platform', async () => {
        process.env[ENV_VARS.IS_AT_HOME] = '1';
        let count = 0;
        const emitAndWait = async (delay) => {
            events.emit(ACTOR_EVENT_NAMES.CPU_INFO, {
                isCpuOverloaded: count % 2 === 0,
                createdAt: (new Date()).toISOString(),
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

            expect(cpuSnapshots).to.have.lengthOf(4);
            cpuSnapshots.forEach((ss, i) => {
                expect(ss.createdAt).to.be.a('date');
                expect(ss.isOverloaded).to.be.a('boolean');
                expect(ss.isOverloaded).to.be.eql(i % 2 === 0);
            });
        } finally {
            delete process.env[ENV_VARS.IS_AT_HOME];
        }
    });

    it('correctly marks eventLoopOverloaded', () => { /* eslint-disable no-underscore-dangle */
        const noop = () => {};
        const block = (millis) => {
            const start = Date.now();
            while (start + millis > Date.now()) { /* empty */ }
        };

        const snapshotter = new Snapshotter({ maxBlockedMillis: 5, eventLoopSnapshotIntervalSecs: 0 });
        snapshotter._snapshotEventLoop(noop);
        block(1);
        snapshotter._snapshotEventLoop(noop);
        block(2);
        snapshotter._snapshotEventLoop(noop);
        block(7);
        snapshotter._snapshotEventLoop(noop);
        block(3);
        snapshotter._snapshotEventLoop(noop);
        const loopSnapshots = snapshotter.getEventLoopSample();

        expect(loopSnapshots.length).to.be.eql(5);
        expect(loopSnapshots[0].isOverloaded).to.be.eql(false);
        expect(loopSnapshots[1].isOverloaded).to.be.eql(false);
        expect(loopSnapshots[2].isOverloaded).to.be.eql(false);
        expect(loopSnapshots[3].isOverloaded).to.be.eql(true);
        expect(loopSnapshots[4].isOverloaded).to.be.eql(false);
    });

    it('correctly marks memoryOverloaded', async () => { /* eslint-disable no-underscore-dangle */
        const noop = () => {};
        const memoryData = {
            mainProcessBytes: toBytes(1000),
            childProcessesBytes: toBytes(1000),
        };
        const getMem = async () => Object.assign({}, memoryData);
        const stub = sinon.stub(utils, 'getMemoryInfo');
        stub.callsFake(getMem);

        process.env[ENV_VARS.MEMORY_MBYTES] = '10000';

        const snapshotter = new Snapshotter({ maxUsedMemoryRatio: 0.5 });
        await snapshotter._snapshotMemory(noop);
        memoryData.mainProcessBytes = toBytes(2000);
        await snapshotter._snapshotMemory(noop);
        memoryData.childProcessesBytes = toBytes(2000);
        await snapshotter._snapshotMemory(noop);
        memoryData.mainProcessBytes = toBytes(3001);
        await snapshotter._snapshotMemory(noop);
        memoryData.childProcessesBytes = toBytes(1999);
        await snapshotter._snapshotMemory(noop);
        const memorySnapshots = snapshotter.getMemorySample();

        expect(memorySnapshots.length).to.be.eql(5);
        expect(memorySnapshots[0].isOverloaded).to.be.eql(false);
        expect(memorySnapshots[1].isOverloaded).to.be.eql(false);
        expect(memorySnapshots[2].isOverloaded).to.be.eql(false);
        expect(memorySnapshots[3].isOverloaded).to.be.eql(true);
        expect(memorySnapshots[4].isOverloaded).to.be.eql(false);

        delete process.env[ENV_VARS.MEMORY_MBYTES];
    });

    it('correctly logs critical memory overload', () => {
        const memoryDataOverloaded = {
            mainProcessBytes: toBytes(3100),
            childProcessesBytes: toBytes(3000),
        };
        const memoryDataNotOverloaded = {
            mainProcessBytes: toBytes(2500),
            childProcessesBytes: toBytes(2500),
        };
        let logged = false;
        const warning = () => { logged = true; };
        const stub = sinon.stub(log, 'warning');
        stub.callsFake(warning);
        process.env[ENV_VARS.MEMORY_MBYTES] = '10000';
        const snapshotter = new Snapshotter({ maxUsedMemoryRatio: 0.5 });

        snapshotter._memoryOverloadWarning(memoryDataOverloaded);
        expect(logged).to.be.eql(true);

        logged = false;

        snapshotter._memoryOverloadWarning(memoryDataNotOverloaded);
        expect(logged).to.be.eql(false);

        delete process.env[ENV_VARS.MEMORY_MBYTES];
    });

    it('correctly marks clientOverloaded', () => { /* eslint-disable no-underscore-dangle */
        const noop = () => {};
        // mock client data
        const oldStats = utils.apifyClient.stats;
        utils.apifyClient.stats = {};
        utils.apifyClient.stats.rateLimitErrors = 0;

        const snapshotter = new Snapshotter();
        snapshotter._snapshotClient(noop);
        utils.apifyClient.stats.rateLimitErrors = 1;
        snapshotter._snapshotClient(noop);
        utils.apifyClient.stats.rateLimitErrors = 2;
        snapshotter._snapshotClient(noop);
        utils.apifyClient.stats.rateLimitErrors = 4;
        snapshotter._snapshotClient(noop);

        const clientSnapshots = snapshotter.getClientSample();

        expect(clientSnapshots.length).to.be.eql(4);
        expect(clientSnapshots[0].isOverloaded).to.be.eql(false);
        expect(clientSnapshots[1].isOverloaded).to.be.eql(false);
        expect(clientSnapshots[2].isOverloaded).to.be.eql(false);
        expect(clientSnapshots[3].isOverloaded).to.be.eql(true);

        utils.apifyClient.stats = oldStats;
    });

    it('.get[.*]Sample limits amount of samples', async () => {
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

        expect(memorySnapshots.length).to.be.above(memorySample.length);
        expect(eventLoopSnapshots.length).to.be.above(eventLoopSample.length);
        for (let i = 0; i < eventLoopSample.length; i++) {
            const sample = eventLoopSample[eventLoopSample.length - 1 - i];
            const snapshot = eventLoopSnapshots[eventLoopSnapshots.length - 1 - i];
            expect(sample).to.be.eql(snapshot);
        }
        const diffBetween = eventLoopSample[eventLoopSample.length - 1].createdAt - eventLoopSnapshots[eventLoopSnapshots.length - 1].createdAt;
        const diffWithin = eventLoopSample[0].createdAt - eventLoopSample[eventLoopSample.length - 1].createdAt;
        expect(diffBetween).to.be.below(SAMPLE_SIZE_MILLIS);
        expect(diffWithin).to.be.below(SAMPLE_SIZE_MILLIS);
    });
});
