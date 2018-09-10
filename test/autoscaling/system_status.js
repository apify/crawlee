import { expect } from 'chai';
import log from 'apify-shared/log';
import SystemStatus from '../../build/autoscaling/system_status';

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
        constructor(memSnapshots, loopSnapshots, cpuSnapshots) {
            this.memSnapshots = memSnapshots;
            this.loopSnapshots = loopSnapshots;
            this.cpuSnapshots = cpuSnapshots;
        }
        getMemorySample() {
            return this.memSnapshots;
        }
        getEventLoopSample() {
            return this.loopSnapshots;
        }
        getCpuSample() {
            return this.cpuSnapshots;
        }
    }

    const generateSnapsSync = (percentage, overloaded) => {
        const snaps = [];
        for (let i = 0; i < 100; i++) {
            snaps.push({
                createdAt: new Date(),
                isOverloaded: i < percentage ? overloaded : !overloaded,
            });
        }
        return snaps;
    };

    it('should return OK for OK snapshots', () => {
        const snaps = generateSnapsSync(100, false);
        const systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps),
        });
        expect(systemStatus.isOk()).to.be.eql(true);
        expect(systemStatus.hasBeenOkLately()).to.be.eql(true);
    });

    it('should return overloaded for overloaded snapshots', () => {
        const snaps = generateSnapsSync(100, true);
        const systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps),
        });
        expect(systemStatus.isOk()).to.be.eql(false);
        expect(systemStatus.hasBeenOkLately()).to.be.eql(false);
    });
});
