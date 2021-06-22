import { SessionPool, openSessionPool } from '../../build/session_pool/session_pool';
import Apify from '../../build';
import events from '../../build/events';
import { ACTOR_EVENT_NAMES_EX } from '../../build/constants';
import { Session } from '../../build/session_pool/session';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';
import { Log } from '../../build/utils_log';

describe('SessionPool - testing session pool', () => {
    let sessionPool;
    let localStorageEmulator;

    beforeAll(async () => {
        localStorageEmulator = new LocalStorageDirEmulator();
    });

    beforeEach(async () => {
        const storageDir = await localStorageEmulator.init();
        Apify.Configuration.getGlobalConfig().set('localStorageDir', storageDir);
        sessionPool = await Apify.openSessionPool();
    });

    afterEach(async () => {
        events.removeAllListeners(ACTOR_EVENT_NAMES_EX.PERSIST_STATE);
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
    });

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
        await sessionPool.teardown();

        Object.entries(opts).filter(([key]) => key !== 'sessionOptions').forEach(([key, value]) => {
            expect(sessionPool[key]).toEqual(value);
        });
        // log is appended to sessionOptions after sessionPool instantiation
        expect(sessionPool.sessionOptions).toEqual({ ...opts.sessionOptions, log: expect.any(Log) });
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
        await sessionPool.teardown();

        Object.entries(opts).filter(([key]) => key !== 'sessionOptions').forEach(([key, value]) => {
            expect(sessionPool[key]).toEqual(value);
        });
        // log is appended to sessionOptions after sessionPool instantiation
        expect(sessionPool.sessionOptions).toEqual({ ...opts.sessionOptions, log: expect.any(Log) });
    });

    describe('should retrieve session', () => {
        test('should retrieve session with correct shape', async () => {
            sessionPool = await Apify.openSessionPool({ sessionOptions: { maxAgeSecs: 100, maxUsageCount: 10 } });
            const session = await sessionPool.getSession();
            expect(sessionPool.sessions.length).toBe(1);
            expect(session.id).toBeDefined();
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

        test('should delete picked session when it is unusable and create a new one', async () => {
            sessionPool.maxPoolSize = 1;
            await sessionPool.addSession();

            const session = await sessionPool.getSession();
            expect(sessionPool.sessions[0].id === session.id).toBe(true);

            session.errorScore += session.maxErrorScore;
            await sessionPool.getSession();

            expect(sessionPool.sessions[0].id === session.id).toBe(false);
            expect(sessionPool.sessions).toHaveLength(1);
        });
    });

    test('get state should work', async () => {
        const url = 'https://example.com';
        const cookies = [
            { name: 'cookie1', value: 'my-cookie' },
            { name: 'cookie2', value: 'your-cookie' },
        ];

        const newSession = await sessionPool.getSession();
        newSession.setPuppeteerCookies(cookies, url);

        const state = sessionPool.getState();
        expect(state).toBeInstanceOf(Object);
        expect(state).toHaveProperty('usableSessionsCount');
        expect(state).toHaveProperty('retiredSessionsCount');
        expect(state).toHaveProperty('sessions');
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
        await sessionPool.teardown();
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
        expect(sessionPool.sessions[0].id).toBeDefined();
    });

    describe('should persist state', () => {
        const KV_STORE = 'SESSION-TEST';

        beforeEach(async () => {
            sessionPool = new SessionPool({ persistStateKeyValueStoreId: KV_STORE });
            await sessionPool.initialize();
        });

        afterEach(async () => {
            await sessionPool.teardown();
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

    test('should remove retired sessions', async () => {
        sessionPool.maxPoolSize = 1;
        await sessionPool.getSession();

        const session = sessionPool.sessions[0];
        session.errorScore += session.maxErrorScore;
        const { id: retiredSessionId } = session;

        await sessionPool.getSession();

        expect(sessionPool.sessions.find((s) => s.id === retiredSessionId)).toEqual(undefined);
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

        await newSessionPool.teardown();
    });

    test('should restore persisted maxUsageCount of recreated sessions', async () => {
        sessionPool = await Apify.openSessionPool({ maxPoolSize: 1, sessionOptions: { maxUsageCount: 66 } });
        await sessionPool.getSession();
        await sessionPool.persistState();
        const loadedSessionPool = new SessionPool({ maxPoolSize: 1, sessionOptions: { maxUsageCount: 88 } });
        await loadedSessionPool.initialize();

        const recreatedSession = await loadedSessionPool.getSession();

        expect(recreatedSession.maxUsageCount).toEqual(66);
    });

    test('should persist state on teardown', async () => {
        const persistStateKey = 'TEST-KEY';
        const persistStateKeyValueStoreId = 'TEST-VALUE-STORE';

        const newSessionPool = await Apify.openSessionPool({
            maxPoolSize: 1,
            persistStateKeyValueStoreId,
            persistStateKey,
        });

        await newSessionPool.teardown();

        const kvStore = await Apify.openKeyValueStore(newSessionPool.persistStateKeyValueStoreId);
        const state = await kvStore.getValue(newSessionPool.persistStateKey);

        expect(newSessionPool.persistStateKeyValueStoreId).toBeDefined();
        expect(newSessionPool.persistStateKey).toBeDefined();
        expect(state).toBeDefined();
        expect(state).toBeInstanceOf(Object);
        expect(state).toHaveProperty('usableSessionsCount');
        expect(state).toHaveProperty('retiredSessionsCount');
        expect(state).toHaveProperty('sessions');
    });

    test('should createSessionFunction work', async () => {
        let isCalled;
        const createSessionFunction = (sessionPool2) => {
            isCalled = true;
            expect(sessionPool2 instanceof SessionPool).toBe(true);
            return new Session({ sessionPool: sessionPool2 });
        };
        const newSessionPool = await Apify.openSessionPool({ createSessionFunction });
        const session = await newSessionPool.getSession();
        expect(isCalled).toBe(true);
        expect(session.constructor.name).toBe('Session');
    });

    it('should remove persist state event listener', async () => {
        expect(events.listenerCount(ACTOR_EVENT_NAMES_EX.PERSIST_STATE)).toEqual(1);
        await sessionPool.teardown();
        expect(events.listenerCount(ACTOR_EVENT_NAMES_EX.PERSIST_STATE)).toEqual(0);
    });

    test('should be able to create session with provided id', async () => {
        await sessionPool.addSession({ id: 'test-session' });
        const session = sessionPool.sessions[0];
        expect(session.id).toBe('test-session');
    });

    test('should be able to add session instance and create new session with provided sessionOptions with addSession() ', async () => {
        const session = new Apify.Session({ sessionPool, id: 'test-session-instance' });
        await sessionPool.addSession(session);

        await sessionPool.addSession({ id: 'test-session' });

        expect(await sessionPool.getSession('test-session')).toBeDefined();
        expect(await sessionPool.getSession('test-session-instance')).toBeDefined();
    });

    test('should not be able to add session to the pool with id already in the pool', async () => {
        try {
            await sessionPool.addSession({ id: 'test-session' });
            await sessionPool.addSession({ id: 'test-session' });
        } catch (e) {
            expect(e.message).toBe("Cannot add session with id 'test-session' as it already exists in the pool");
        }
        expect.assertions(1);
    });

    test('should be able to retrieve session with provided id', async () => {
        await sessionPool.addSession();
        await sessionPool.addSession({ id: 'test-session' });
        await sessionPool.addSession({ id: 'another-test-session' });

        const session = await sessionPool.getSession('test-session');
        expect(session.id).toBe('test-session');
    });

    test('should correctly populate session array and session map', async () => {
        sessionPool.maxPoolSize = 10;

        for (let i = 0; i < 20; i++) await sessionPool.getSession();

        expect(sessionPool.sessions.length).toEqual(10);
        expect(sessionPool.sessionMap.size).toEqual(10);
        expect(sessionPool.sessions.length).toEqual(sessionPool.sessionMap.size);
    });

    test('should correctly remove retired sessions both from array and session map', async () => {
        sessionPool.maxPoolSize = 10;

        for (let i = 0; i < 10; i++) {
            await sessionPool.addSession({ id: `session_${i}` });
            const session = await sessionPool.getSession(`session_${i}`);
            session.errorScore += session.maxErrorScore;
        }

        await sessionPool.getSession();

        expect(sessionPool.sessions.length).toEqual(1);
        expect(sessionPool.sessionMap.size).toEqual(1);
        expect(sessionPool.sessions.length).toEqual(sessionPool.sessionMap.size);
    });
});
