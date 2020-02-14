import { SessionPool, openSessionPool } from '../../build/session_pool/session_pool';
import Apify from '../../build';
import events from '../../build/events';

import { ACTOR_EVENT_NAMES_EX } from '../../build/constants';
import { Session } from '../../src/session_pool/session';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';

describe('SessionPool - testing session pool', () => {
    let sessionPool;
    let localStorageEmulator;

    beforeAll(async () => {
        localStorageEmulator = new LocalStorageDirEmulator();
        await localStorageEmulator.init();
    });

    beforeEach(async () => {
        await localStorageEmulator.clean();
        sessionPool = await Apify.openSessionPool();
    });

    afterEach(async () => {
        events.removeAllListeners(ACTOR_EVENT_NAMES_EX.PERSIST_STATE);
        await localStorageEmulator.clean();
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
    });

   // eslint-disable-line
    test('should initialize with default values for first time', async () => {
        expect(sessionPool.sessions.length).toBeDefined();
        expect(sessionPool.maxPoolSize).toBeDefined();
        expect(sessionPool.sessionOptions).toBeDefined();
        expect(sessionPool.persistStateKey).toBeDefined();
        expect(sessionPool.createSessionFunction).toEqual(sessionPool._defaultCreateSessionFunction); // eslint-disable-line
    });

    test('should override default values', async () => {
        const opts = {
            maxPoolSize: 3000,
            sessionOptions: {
                maxAgeSecs: 100,
                maxUsageCount: 1,
            },


            persistStateKeyValueStoreId: 'TEST',
            persistStateKey: 'SESSION_POOL_STATE2',

            createSessionFunction: () => ({}),

        };
        sessionPool = new SessionPool(opts);
        await sessionPool.initialize();
        sessionPool.teardown();

        Object.entries(opts).forEach(([key, value]) => {
            expect(sessionPool[key]).toEqual(value);
        });
        const store = await Apify.openKeyValueStore('TEST');
        await store.drop();
    });

    test('should work using openSessionPool', async () => {
        const opts = {
            maxPoolSize: 3000,

            sessionOptions: {
                maxAgeSecs: 100,
                maxUsageCount: 1,
            },

            persistStateKeyValueStoreId: 'TEST',
            persistStateKey: 'SESSION_POOL_STATE2',

            createSessionFunction: () => ({}),

        };
        sessionPool = await openSessionPool(opts);
        sessionPool.teardown();


        Object.entries(opts).forEach(([key, value]) => {
            expect(sessionPool[key]).toEqual(value);
        });
        const store = await Apify.openKeyValueStore('TEST');
        await store.drop();
    });

    describe('should retrieve session', () => {
        test('should retrieve session with correct shape', async () => {
            sessionPool = await Apify.openSessionPool({ sessionOptions: { maxAgeSecs: 100, maxUsageCount: 10 } });
            const session = await sessionPool.getSession();
            expect(sessionPool.sessions.length).toBe(1);
            expect(session.id).toBeDefined(); // eslint-disable-line
            expect(session.maxAgeSecs).toEqual(sessionPool.sessionOptions.maxAgeSecs);
            expect(session.maxAgeSecs).toEqual(sessionPool.sessionOptions.maxAgeSecs);
            expect(session.sessionPool).toEqual(sessionPool);
        });

        test('should pick session when pool is full', async () => {
            sessionPool.maxPoolSize = 2;
            await sessionPool.getSession();
            await sessionPool.getSession();
            let isCalled = false;
            const oldPick = sessionPool._pickSession; //eslint-disable-line

            sessionPool._pickSession = () => { //eslint-disable-line
                isCalled = true;
                return oldPick.bind(sessionPool)();
            };

            await sessionPool.getSession();

            expect(isCalled).toBe(true); //eslint-disable-line
        });

        test(
            'should delete picked session when it is usable a create a new one',
            async () => {
                sessionPool.maxPoolSize = 1;
                await sessionPool.getSession();
                const session = sessionPool.sessions[0];

                session.errorScore += session.maxErrorScore;
                let isCalled = false;
                const oldRemove = sessionPool._removeSession; //eslint-disable-line

                sessionPool._removeSession = (session) => { //eslint-disable-line
                    isCalled = true;
                    return oldRemove.bind(sessionPool)(session);
                };

                await sessionPool.getSession();

                expect(isCalled).toBe(true); //eslint-disable-line
                expect(sessionPool.sessions[0].id === session.id).toBe(false); //eslint-disable-line
                expect(sessionPool.sessions).toHaveLength(1);
            },
        );
    });


    test('should persist state and recreate it from storage', async () => {
        await sessionPool.getSession();
        await sessionPool.persistState();

        const kvStore = await Apify.openKeyValueStore();
        const sessionPoolSaved = await kvStore.getValue(sessionPool.persistStateKey);

        Object.entries(sessionPoolSaved).forEach(([key, value]) => {
            if (key !== 'sessions') {
                expect(value).toEqual(sessionPool[key]);
            }
        });
        expect(sessionPoolSaved.sessions.length).toEqual(sessionPool.sessions.length);
        sessionPoolSaved.sessions.forEach((session, index) => {
            Object.entries(session).forEach(([key, value]) => {
                if (sessionPool.sessions[index][key] instanceof Date) {
                    expect(value).toEqual(sessionPool.sessions[index][key].toISOString());
                } else if (key === 'cookieJar') {
                    expect(value).toEqual(sessionPool.sessions[index][key].toJSON());
                } else {
                    expect(sessionPool.sessions[index][key]).toEqual(value);
                }
            });
        });


        const loadedSessionPool = new SessionPool();

        await loadedSessionPool.initialize();
        expect(sessionPool.sessions).toHaveLength(loadedSessionPool.sessions.length);
        expect(sessionPool.maxPoolSize).toEqual(loadedSessionPool.maxPoolSize);
        expect(sessionPool.persistStateKey).toEqual(loadedSessionPool.persistStateKey);
        sessionPool.teardown();
    });

    test('should create only maxPoolSize number of sessions', async () => {
        const max = sessionPool.maxPoolSize;
        for (let i = 0; i < max + 100; i++) {
            await sessionPool.getSession();
        }
        expect(sessionPool.sessions.length).toEqual(sessionPool.maxPoolSize);
    });

    test('should create session', async () => {
       await sessionPool._createSession(); // eslint-disable-line
        expect(sessionPool.sessions.length).toBe(1);
        expect(sessionPool.sessions[0].id).toBeDefined(); // eslint-disable-line
    });

    describe('should persist state', () => {
        const KV_STORE = 'SESSION-TEST';

        beforeEach(async () => {
            sessionPool = new SessionPool({ persistStateKeyValueStoreId: KV_STORE });
            await sessionPool.initialize();
        });

        afterEach(async () => {
            sessionPool.teardown();
        });

        test('on persist event', async () => {
            await sessionPool.getSession();

            expect(sessionPool.sessions.length).toBe(1);

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

            expect(sessionPool.getState()).toEqual(state);
        });
    });

    test('should remove session', async () => {
        for (let i = 0; i < 10; i++) {
            await sessionPool.getSession();
        }
        const picked = sessionPool.getSession();
        sessionPool._removeSession(picked); // eslint-disable-line
        expect(sessionPool.sessions.find(s => s.id === picked.id)).toEqual(undefined);
    });

    test('should recreate only usable sessions', async () => {
        let invalidSessionsCount = 0;
        for (let i = 0; i < 10; i++) {
            const session = await sessionPool.getSession();

            if (i % 2 === 0) {
                session.errorScore += session.maxErrorScore;
                invalidSessionsCount += 1;
            }
        }
        expect(sessionPool.retiredSessionsCount).toEqual(invalidSessionsCount);

        await sessionPool.persistState();

        const newSessionPool = new SessionPool();
        await newSessionPool.initialize();
        expect(newSessionPool.sessions).toHaveLength(10 - invalidSessionsCount);

        newSessionPool.teardown();
    });

    test('should createSessionFunction work', async () => {
        let isCalled;
        const createSessionFunction = (sessionPool2) => {
            isCalled = true;
            expect(sessionPool2 instanceof SessionPool).toBe(true); // eslint-disable-line
            return new Session({ sessionPool: sessionPool2 });
        };
        const newSessionPool = await Apify.openSessionPool({ createSessionFunction });
        const session = await newSessionPool.getSession();
        expect(isCalled).toBe(true); // eslint-disable-line
        expect(session.constructor.name).toBe("Session") // eslint-disable-line
    });

    it('should remove persist state event listener', () => {
        expect(events.listenerCount(ACTOR_EVENT_NAMES_EX.PERSIST_STATE)).toEqual(1);
        sessionPool.teardown();
        expect(events.listenerCount(ACTOR_EVENT_NAMES_EX.PERSIST_STATE)).toEqual(0);
    });
});
