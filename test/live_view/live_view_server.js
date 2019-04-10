import path from 'path';
import { expect } from 'chai';
import Apify from '../../build/index';
import { LOCAL_STORAGE_DIR } from '../_helper';
import LiveViewServer from '../../build/live_view/live_view_server';

const { utils: { log } } = Apify;

const LOCAL_STORAGE_SUBDIR = path.join(LOCAL_STORAGE_DIR, 'live_view');

let originalLogLevel;
before(() => {
    originalLogLevel = log.getLevel();
    log.setLevel(log.LEVELS.ERROR);
});

after(() => {
    log.setLevel(originalLogLevel);
});

describe('LiveViewServer', () => {
    it('should construct', () => {
        const lvs = new LiveViewServer({
            screenshotDirectoryPath: LOCAL_STORAGE_SUBDIR,
        });
        expect(lvs).to.be.instanceOf(LiveViewServer);
    });
    it('should start and stop', async () => {
        const lvs = new LiveViewServer({
            screenshotDirectoryPath: LOCAL_STORAGE_SUBDIR,
        });
        await lvs.start();
        expect(lvs.isRunning).to.be.eql(true);
        await lvs.stop();
        expect(lvs.isRunning).to.be.eql(false);
    });
});
