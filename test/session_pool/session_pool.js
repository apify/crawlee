import { expect } from 'chai';

import SessionPool, { SESSION_POOL_DEFAULTS } from '../../src/session_pool/session_pool';

describe('SessionPool - testing session pool', async () => {
    let sessionPool;

    before(() => {
        process.env.APIFY_LOCAL_STORAGE_DIR = '../../';
    });

    beforeEach(async () => {
        sessionPool = new SessionPool({ persistStateKeyValueStoreId: 'default' });
        await sessionPool.initialize();
    });

    it('should initialize with default values for first time', async () => {
        expect(sessionPool.sessions.length).to.be.eql(0);
        expect(sessionPool.maxPoolSize).to.be.eql(SESSION_POOL_DEFAULTS.maxPoolSize);
        expect(sessionPool.maxSessionAgeSecs).to.be.eql(SESSION_POOL_DEFAULTS.maxSessionAgeSecs);
        expect(sessionPool.maxSessionReuseCount).to.be.eql(SESSION_POOL_DEFAULTS.maxSessionReuseCount);
        expect(sessionPool.persistStateKeyValueStoreId).to.be.eql(SESSION_POOL_DEFAULTS.persistStateKeyValueStoreId);
        expect(sessionPool.persistStateKey).to.be.eql(SESSION_POOL_DEFAULTS.persistStateKey);
        expect(sessionPool.createSessionFunction).to.be.eql(sessionPool._createSessionFunction); // eslint-disable-line
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
        expect(session.name).to.exist;
        expect(session.cookies.length).to.be.eql(0);
        expect(session.fingerPrintSeed).to.exist;
        expect(session.maxAgeSecs).to.eql(sessionPool.maxSessionAgeSecs);
        expect(session.maxAgeSecs).to.eql(sessionPool.maxSessionAgeSecs);
        expect(session.sessionPool).to.eql(sessionPool);
    });

    xit('should persist state and recreate it from storage', async () => {
        const session = await sessionPool.retrieveSession();
        let key;
        let value;

        const mySetValue = (k, v) => {
            key = k;
            value = v;
        };
        sessionPool.storage.setValue = mySetValue;
        await sessionPool.persistState();
        expect(key).to.be.eql(SESSION_POOL_DEFAULTS.persistStateKey);
        expect(value).to.be.eql(sessionPool.getState());

        const loadedSessionPool = new SessionPool({ persistStateKeyValueStoreId: 'default' });
        await loadedSessionPool.initialize();
        console.log('SESSION');
    });

    it('should create only maxPoolSize number of sessions', async () => {
        const max = sessionPool.maxPoolSize;
        for (let i = 0; i < max + 100; i++) {
            await sessionPool.retrieveSession();
        }
        expect(sessionPool.sessions.length).to.be.eql(sessionPool.maxPoolSize);
    });
});
