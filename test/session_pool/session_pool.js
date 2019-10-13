import { expect } from 'chai';
import { LOCAL_STORAGE_DIR, emptyLocalStorageSubdir } from '../_helper';
import SessionPool from '../../build/session_pool/session_pool';
import Apify from '../../build';

// TODO: Add more tests
describe('SessionPool - testing session pool', async () => {
    let sessionPool;

    before(() => {
        process.env.APIFY_LOCAL_STORAGE_DIR = LOCAL_STORAGE_DIR;
    });

    beforeEach(async () => {
        sessionPool = new SessionPool();
        await sessionPool.initialize();
    });

    afterEach(async () => {
        await emptyLocalStorageSubdir('key_value_stores/default');
    });

    it('should initialize with default values for first time', async () => {
        expect(sessionPool.sessions.length).to.exist; // eslint-disable-line
        expect(sessionPool.maxPoolSize).to.exist; // eslint-disable-line
        expect(sessionPool.maxSessionAgeSecs).to.exist; // eslint-disable-line
        expect(sessionPool.maxSessionReuseCount).to.exist; // eslint-disable-line
        expect(sessionPool.persistStateKey).to.exist; // eslint-disable-line
        expect(sessionPool.createSessionFunction).to.be.eql(sessionPool._defaultCreateSessionFunction); // eslint-disable-line
    });

    it('should override default values', async () => {
        const opts = {
            maxPoolSize: 3000,
            maxSessionAgeSecs: 100,
            maxSessionReuseCount: 1,

            persistStateKeyValueStoreId: 'TEST',
            persistStateKey: 'SESSION_POOL_STATE2',

            createSessionFunction: () => ({}),

        };
        sessionPool = new SessionPool(opts);
        await sessionPool.initialize();

        Object.entries(opts).forEach(([key, value]) => {
            expect(sessionPool[key]).to.be.eql(value);
        });
    });

    it('should retrieve session', async () => {
        const session = await sessionPool.retrieveSession();
        expect(sessionPool.sessions.length).to.be.eql(1);
        expect(session.id).to.exist; // eslint-disable-line
        expect(session.cookies.length).to.be.eql(0);
        expect(session.fingerprintSeed).to.exist; // eslint-disable-line
        expect(session.maxAgeSecs).to.eql(sessionPool.maxSessionAgeSecs);
        expect(session.maxAgeSecs).to.eql(sessionPool.maxSessionAgeSecs);
        expect(session.sessionPool).to.eql(sessionPool);
    });

    it('should persist state and recreate it from storage', async () => {
        await sessionPool.retrieveSession();
        await sessionPool.persistState();

        const kvStore = await Apify.openKeyValueStore();
        const sessionPoolSaved = await kvStore.getValue(sessionPool.persistStateKey);

        Object.entries(sessionPoolSaved).forEach(([key, value]) => {
            if (key !== 'sessions') {
                expect(value).to.be.eql(sessionPool[key]);
            }
        });
        expect(sessionPoolSaved.sessions.length).to.be.eql(sessionPool.sessions.length);
        sessionPoolSaved.sessions.forEach((session, index) => {
            Object.entries(session).forEach(([key, value]) => {
                expect(value).to.be.eql(sessionPool.sessions[index][key]);
            });
        });


        const loadedSessionPool = new SessionPool();

        await loadedSessionPool.initialize();
        expect(loadedSessionPool).to.have.all.keys(Object.keys(sessionPool));
    });

    it('should create only maxPoolSize number of sessions', async () => {
        const max = sessionPool.maxPoolSize;
        for (let i = 0; i < max + 100; i++) {
            await sessionPool.retrieveSession();
        }
        expect(sessionPool.sessions.length).to.be.eql(sessionPool.maxPoolSize);
    });
});
