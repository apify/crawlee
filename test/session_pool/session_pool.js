import { expect } from 'chai';
import * as moment from 'moment';
import { LOCAL_STORAGE_DIR, emptyLocalStorageSubdir } from '../_helper';
import { SessionPool } from '../../build/session_pool/session_pool';
import Apify from '../../build';
import events from '../../build/events';

import { ACTOR_EVENT_NAMES_EX } from '../../build/constants';

describe('SessionPool - testing session pool', async () => {
    let sessionPool;

    before(() => {
        process.env.APIFY_LOCAL_STORAGE_DIR = LOCAL_STORAGE_DIR;
    });

    beforeEach(async () => {
        await emptyLocalStorageSubdir('key_value_stores/default');
        sessionPool = new SessionPool();
        await sessionPool.initialize();
    });

    it('should initialize with default values for first time', async () => {
        expect(sessionPool.sessions.length).to.exist; // eslint-disable-line
        expect(sessionPool.maxPoolSize).to.exist; // eslint-disable-line
        expect(sessionPool.maxSessionAgeSecs).to.exist; // eslint-disable-line
        expect(sessionPool.maxSessionUsageCount).to.exist; // eslint-disable-line
        expect(sessionPool.persistStateKey).to.exist; // eslint-disable-line
        expect(sessionPool.createSessionFunction).to.be.eql(sessionPool._defaultCreateSessionFunction); // eslint-disable-line
    });

    it('should override default values', async () => {
        const opts = {
            maxPoolSize: 3000,
            maxSessionAgeSecs: 100,
            maxSessionUsageCount: 1,

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

    describe('should retrieve session', () => {
        it('should retrieve session with correct shape', async () => {
            const session = await sessionPool.retrieveSession();
            expect(sessionPool.sessions.length).to.be.eql(1);
            expect(session.id).to.exist; // eslint-disable-line
            expect(session.cookies.length).to.be.eql(0);
            expect(session.maxAgeSecs).to.eql(sessionPool.maxSessionAgeSecs);
            expect(session.maxAgeSecs).to.eql(sessionPool.maxSessionAgeSecs);
            expect(session.sessionPool).to.eql(sessionPool);
        });

        it('should pick session when pool is full', async () => {
            sessionPool.maxPoolSize = 2;
            await sessionPool.retrieveSession();
            await sessionPool.retrieveSession();
            let isCalled = false;
            const oldPick = sessionPool._pickSession; //eslint-disable-line

            sessionPool._pickSession = () => { //eslint-disable-line
                isCalled = true;
                return oldPick.bind(sessionPool)();
            };

            await sessionPool.retrieveSession();

            expect(isCalled).to.be.true; //eslint-disable-line
        });

        it('should delete picked session when it is usable a create a new one', async () => {
            sessionPool.maxPoolSize = 1;
            await sessionPool.retrieveSession();
            const session = sessionPool.sessions[0];

            session.errorScore += session.maxErrorScore;
            let isCalled = false;
            const oldRemove = sessionPool._removeSession; //eslint-disable-line

            sessionPool._removeSession = (session) => { //eslint-disable-line
                isCalled = true;
                return oldRemove.bind(sessionPool)(session);
            };

            await sessionPool.retrieveSession();

            expect(isCalled).to.be.true; //eslint-disable-line
            expect(sessionPool.sessions[0].id === session.id).to.be.false; //eslint-disable-line
            expect(sessionPool.sessions).to.be.length(1);
        });
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
                if (sessionPool.sessions[index][key] instanceof Date) {
                    expect(value).to.be.eql(sessionPool.sessions[index][key].toISOString());
                } else {
                    expect(sessionPool.sessions[index][key]).to.be.eql(value);
                }
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

    it('should create session', async () => {
       await sessionPool._createSession(); // eslint-disable-line
        expect(sessionPool.sessions.length).to.be.eql(1);
        expect(sessionPool.sessions[0].id).to.exist; // eslint-disable-line
    });

    describe('should persist state', () => {
        const KV_STORE = 'SESSION-TEST';

        beforeEach(async () => {
            sessionPool = new SessionPool({ persistStateKeyValueStoreId: KV_STORE });
            await sessionPool.initialize();
        });

        afterEach(async () => {
            await emptyLocalStorageSubdir(`key_value_stores/${KV_STORE}`);
        });

        it('on persist event', async () => {
            await sessionPool.retrieveSession();

            expect(sessionPool.sessions.length).to.be.eql(1);

            events.emit(ACTOR_EVENT_NAMES_EX.PERSIST_STATE);

            await new Promise((resolve) => {
                const interval = setInterval(async () => {
                    const state = await sessionPool.keyValueStore.getValue(sessionPool.persistStateKey);
                    if (state) {
                        resolve();
                        clearInterval(interval);
                    }
                }, 100);
            });

            const state = await sessionPool.keyValueStore.getValue(sessionPool.persistStateKey);

            expect(sessionPool.getState()).to.be.eql(state);
        });
    });

    it('should remove session', async () => {
        for (let i = 0; i < 10; i++) {
            await sessionPool.retrieveSession();
        }
        const picked = sessionPool.retrieveSession();
        sessionPool._removeSession(picked); // eslint-disable-line
        expect(sessionPool.sessions.find(s => s.id === picked.id)).to.be.eql(undefined);
    });

    it('should recreate only usable sessions', async () => {
        let invalidSessionsCount = 0;
        for (let i = 0; i < 10; i++) {
            const session = await sessionPool.retrieveSession();

            if (i % 2 === 0) {
                session.errorScore += session.maxErrorScore;
                invalidSessionsCount += 1;
            }
        }
        expect(sessionPool.retiredSessionsCount).to.be.eql(invalidSessionsCount);

        await sessionPool.persistState();

        const newSessionPool = new SessionPool();
        await newSessionPool.initialize();

        expect(newSessionPool.sessions).to.be.length(10 - invalidSessionsCount);
    });
});
