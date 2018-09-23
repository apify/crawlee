import { expect } from 'chai';
import log from 'apify-shared/log';
import { ACTOR_EVENT_NAMES, ENV_VARS } from 'apify-shared/consts';
import * as Apify from '../../build/index';
import events from '../../build/events';
import Snapshotter from '../../build/autoscaling/snapshotter';

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
        const snapshotter = new Snapshotter();
        await snapshotter.start();
        await Apify.utils.sleep(1250);
        await snapshotter.stop();
        const memorySnapshots = snapshotter.getMemorySample();
        const eventLoopSnapshots = snapshotter.getEventLoopSample();
        const cpuSnapshots = snapshotter.getCpuSample();

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
        expect(memorySnapshots.length).to.be.above(3);
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

    it('correctly marks eventLoopOverloaded', async () => {
        const options = {
            eventLoopSnapshotIntervalSecs: 0.01,
            maxBlockedMillis: 10,
        };
        const TICK = options.eventLoopSnapshotIntervalSecs * 1000;
        const DELAY = 75;

        const snapshotter = new Snapshotter(options);
        await snapshotter.start();
        await Apify.utils.sleep(3 * TICK);
        const start = Date.now();
        let now = Date.now();
        while (now < start + DELAY) {
            now = Date.now();
        }
        await Apify.utils.sleep(3 * TICK);
        await snapshotter.stop();
        const eventLoopSnapshots = snapshotter.getEventLoopSample();
        expect(eventLoopSnapshots.length).to.be.above(6);
        let overloadedCount = 0;
        eventLoopSnapshots.forEach((ss, idx) => {
            if (ss.isOverloaded) {
                overloadedCount++;
                const prev = eventLoopSnapshots[idx - 1].createdAt;
                const curr = ss.createdAt;
                const next = eventLoopSnapshots[idx + 1].createdAt;
                expect(curr - prev).to.be.above(snapshotter.maxBlockedMillis);
                expect(next - curr).to.be.within(TICK - 1, TICK + snapshotter.maxBlockedMillis);
                expect(ss.exceededMillis).to.be.within(1, DELAY - snapshotter.maxBlockedMillis);
            } else {
                expect(ss.exceededMillis).to.be.eql(0);
            }
        });
        expect(overloadedCount).to.be.eql(1);
    });

    it('correctly marks memoryOverloaded', async () => {
        const options = {
            memorySnapshotIntervalSecs: 0.1,
            maxMemoryMbytes: 20,
        };

        const snapshotter = new Snapshotter(options);
        await snapshotter.start();
        await Apify.utils.sleep(199);
        snapshotter.maxMemoryBytes = toBytes(1000); // Override memory to get an OK reading.
        await Apify.utils.sleep(199);
        await snapshotter.stop();
        const memorySnapshots = snapshotter.getMemorySample();

        expect(memorySnapshots.length).to.be.above(2);
        expect(memorySnapshots[0].isOverloaded).to.be.eql(true);
        expect(memorySnapshots[1].isOverloaded).to.be.eql(true);
        expect(memorySnapshots[2].isOverloaded).to.be.eql(false);
    });

    it('.get...Sample limits amount of samples', async () => {
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
