import path from 'path';
import { expect } from 'chai';
import { LOCAL_STORAGE_DIR } from '../_helper';
import LiveViewServer from '../../build/live_view/live_view_server';

const LOCAL_STORAGE_SUBDIR = path.join(LOCAL_STORAGE_DIR, 'live_view');

describe('LiveViewServer', () => {
    it('should construct', () => {
        const lvs = new LiveViewServer({
            screenshotDirectoryPath: LOCAL_STORAGE_SUBDIR,
        });
        expect(lvs).to.be.instanceOf(LiveViewServer);
    });
});
