import { expect } from 'chai';
import log from 'apify-shared/log';
import SystemStatus from '../../build/autoscaling/system_status';
import Snapshotter from '../../build/autoscaling/snapshotter';

describe('SystemStatus', () => {
    let logLevel;
    before(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    after(() => {
        log.setLevel(logLevel);
    });

    class MockSnapshotter {
        constructor(memSnapshots, loopSnapshots, cpuSnapshots, clientSnapshots) {
            this.memSnapshots = memSnapshots;
            this.loopSnapshots = loopSnapshots;
            this.cpuSnapshots = cpuSnapshots;
            this.clientSnapshots = clientSnapshots;
        }

        getMemorySample(offset) {
            return this.memSnapshots.slice(-offset);
        }

        getEventLoopSample(offset) {
            return this.loopSnapshots.slice(-offset);
        }

        getCpuSample(offset) {
            return this.cpuSnapshots.slice(-offset);
        }

        getClientSample(offset) {
            return this.clientSnapshots.slice(-offset);
        }
    }

    const generateSnapsSync = (percentage, overloaded) => {
        const snaps = [];
        const createdAt = new Date();
        for (let i = 0; i < 100; i++) {
            snaps.push({
                createdAt,
                isOverloaded: i < percentage ? overloaded : !overloaded,
            });
        }
        return snaps;
    };

    it('should return OK for OK snapshots', () => {
        const snaps = generateSnapsSync(100, false);
        const systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps, snaps),
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(true);
    });

    it('should return overloaded for overloaded snapshots', () => {
        const snaps = generateSnapsSync(100, true);
        const systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps, snaps),
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(false);
    });

    it('should work with some samples empty', () => {
        const snaps = generateSnapsSync(100, true);
        let systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, [], [], []),
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(false);
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter([], snaps, [], []),
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(false);
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter([], [], snaps, snaps),
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(false);
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter([], [], [], []),
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(true);
    });

    it('should overload if only one sample is overloaded', () => {
        const overloaded = generateSnapsSync(100, true);
        const fine = generateSnapsSync(100, false);
        let systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(fine, fine, overloaded, fine),
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(false);
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(fine, overloaded, fine, fine),
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(false);
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(overloaded, fine, fine, fine),
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(false);
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(fine, fine, fine, overloaded),
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(false);
    });

    it('should overload when threshold is crossed', () => {
        const snaps = generateSnapsSync(50, true);
        const systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps, snaps),
            maxMemoryOverloadedRatio: 0.5,
            maxEventLoopOverloadedRatio: 0.5,
            maxCpuOverloadedRatio: 0.5,
            maxClientOverloadedRatio: 0.5,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(true);

        systemStatus.maxMemoryOverloadedRatio = 0.49;
        systemStatus.maxEventLoopOverloadedRatio = 0.49;
        systemStatus.maxCpuOverloadedRatio = 0.49;
        systemStatus.maxClientOverloadedRatio = 0.49;
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(false);

        systemStatus.maxMemoryOverloadedRatio = 0.5;
        systemStatus.maxEventLoopOverloadedRatio = 0.5;
        systemStatus.maxCpuOverloadedRatio = 0.49;
        systemStatus.maxClientOverloadedRatio = 0.49;
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(false);

        systemStatus.maxMemoryOverloadedRatio = 1;
        systemStatus.maxEventLoopOverloadedRatio = 1;
        systemStatus.maxCpuOverloadedRatio = 1;
        systemStatus.maxClientOverloadedRatio = 1;
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(true);
    });

    it('should show different values for now and lately', () => {
        let snaps = generateSnapsSync(95, false);
        let systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps, snaps),
            maxMemoryOverloadedRatio: 0.5,
            maxEventLoopOverloadedRatio: 0.5,
            maxCpuOverloadedRatio: 0.5,
            maxClientOverloadedRatio: 0.5,
        });
        systemStatus.currentHistorySecs = 5;
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(true);

        systemStatus.currentHistorySecs = 10;
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(true);

        systemStatus.currentHistorySecs = 12;
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(true);

        snaps = generateSnapsSync(95, true);
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps, snaps),
            maxMemoryOverloadedRatio: 0.5,
            maxEventLoopOverloadedRatio: 0.5,
            maxCpuOverloadedRatio: 0.5,
            maxClientOverloadedRatio: 0.5,
        });
        systemStatus.currentHistorySecs = 5;
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(false);

        systemStatus.currentHistorySecs = 10;
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(false);

        systemStatus.currentHistorySecs = 12;
        expect(systemStatus.getCurrentStatus().isSystemIdle).to.be.eql(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).to.be.eql(false);
    });

    it('creates a snapshotter when none is passed', () => {
        const systemStatus = new SystemStatus();
        expect(systemStatus.snapshotter).to.be.an.instanceof(Snapshotter);
    });
});
