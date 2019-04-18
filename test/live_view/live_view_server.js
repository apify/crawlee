import path from 'path';
import { promisify } from 'util';
import rqst from 'request-promise-native';
import fs from 'fs-extra';
import { expect } from 'chai';
import io from 'socket.io-client';
import { ENV_VARS, LOCAL_ENV_VARS } from 'apify-shared/consts';
import Apify from '../../build/index';
import { LOCAL_STORAGE_DIR } from '../_helper';
import LiveViewServer from '../../build/live_view/live_view_server';

const { utils: { log } } = Apify;
const emptyDir = promisify(fs.emptyDir);
const readdir = promisify(fs.readdir);

const LOCAL_STORAGE_SUBDIR = path.join(LOCAL_STORAGE_DIR, 'live_view');
const PORT = LOCAL_ENV_VARS[ENV_VARS.CONTAINER_PORT];
const BASE_URL = `http://localhost:${PORT}`;

let originalLogLevel;
before(() => {
    originalLogLevel = log.getLevel();
    log.setLevel(log.LEVELS.ERROR);
});

after(() => {
    log.setLevel(originalLogLevel);
});

describe('LiveViewServer', () => {
    let lvs;
    let count;
    const fakePage = {
        url: () => 'url',
        content: async () => 'content',
        screenshot: async () => `screenshot${count++}`,
    };
    beforeEach(() => {
        count = 0;
        lvs = new LiveViewServer({
            screenshotDirectoryPath: LOCAL_STORAGE_SUBDIR,
            maxScreenshotFiles: 2,
        });
    });

    afterEach(async () => {
        count = null;
        lvs = null;
        await emptyDir(LOCAL_STORAGE_SUBDIR);
    });

    it('should construct', async () => {
        expect(lvs).to.be.instanceOf(LiveViewServer);
    });

    it('should start and stop', async () => {
        await lvs.start();
        expect(lvs.isRunning()).to.be.eql(true);
        await lvs.stop();
        expect(lvs.isRunning()).to.be.eql(false);
    });

    it('should connect over websocket', async () => {
        const socket = io(BASE_URL);
        await lvs.start();
        await new Promise(resolve => socket.on('connect', resolve));
        expect(lvs.hasClients()).to.be.eql(true);
        socket.close();
        await lvs.stop();
    });

    it('should make one snapshot even without clients', async () => {
        await lvs.start();
        expect(lvs.hasClients()).to.be.eql(true);
        await lvs.serve(fakePage);
        let files = await readdir(LOCAL_STORAGE_SUBDIR);
        expect(files.length).to.be.eql(1);
        expect(lvs.hasClients()).to.be.eql(false);
        await lvs.serve(fakePage);
        files = await readdir(LOCAL_STORAGE_SUBDIR);
        expect(files.length).to.be.eql(1);
        await lvs.stop();
    });

    describe('when connected', () => {
        let socket;
        beforeEach(async () => {
            socket = io(BASE_URL);
            await lvs.start();
            await new Promise(resolve => socket.on('connect', resolve));
        });
        afterEach(async () => {
            socket.close();
            await lvs.stop();
            count = null;
            socket = null;
        });

        it('should serve snapshot', async () => {
            await lvs.serve(fakePage);
            const snapshot = await new Promise(resolve => socket.on('snapshot', resolve));
            expect(snapshot).to.include({ pageUrl: 'url', htmlContent: 'content', screenshotIndex: 0 });
            expect(`"${snapshot.createdAt}"`).to.be.eql(JSON.stringify(new Date(snapshot.createdAt)));
        });

        it('should return screenshots', async () => {
            const snapshot0 = new Promise(resolve => socket.on('snapshot', resolve));
            await lvs.serve(fakePage);
            const response0 = await rqst(`${BASE_URL}/screenshot/${((await snapshot0).screenshotIndex)}`);
            expect(response0).to.be.eql('screenshot0');
            const snapshot1 = new Promise(resolve => socket.on('snapshot', resolve));
            await lvs.serve(fakePage);
            const response1 = await rqst(`${BASE_URL}/screenshot/${(await snapshot1).screenshotIndex}`);
            expect(response1).to.be.eql('screenshot1');
        });

        it('should not store more than maxScreenshotFiles screenshots', async () => {
            const snapshots = [];
            socket.on('snapshot', s => snapshots.push(s));
            for (let i = 0; i < 5; i++) {
                await lvs.serve(fakePage);
            }
            const files = await new Promise((resolve, reject) => {
                const interval = setInterval(async () => {
                    const files = await readdir(LOCAL_STORAGE_SUBDIR); // eslint-disable-line no-shadow
                    if (files.length === 2) {
                        clearInterval(interval);
                        resolve(files);
                    }
                }, 10);
                setTimeout(() => {
                    clearInterval(interval);
                    reject(new Error('Files were not deleted in 2000ms.'));
                }, 2000);
            });
            files.forEach((f, idx) => expect(f).to.be.eql(`${idx + 3}.jpeg`));
        });
    });
});
