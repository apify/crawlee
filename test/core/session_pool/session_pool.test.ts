import { Log } from '@apify/log';
import { SessionPool, Session, KeyValueStore, Configuration, EventType } from '@crawlee/core';
import { entries } from '@crawlee/utils';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

describe('SessionPool - testing session pool', () => {
    let sessionPool: SessionPool;
    const localStorageEmulator = new MemoryStorageEmulator();
    const events = Configuration.getEventManager();

    beforeEach(async () => {
        await localStorageEmulator.init();
        sessionPool = await SessionPool.open();
    });

    afterEach(async () => {
        events.off(EventType.PERSIST_STATE);
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
    });

    test('should initialize with default values for first time', async () => {
        // @ts-expect-error private symbol
        expect(sessionPool.sessions.length).toBeDefined();
        // @ts-expect-error private symbol
        expect(sessionPool.maxPoolSize).toBeDefined();
        // @ts-expect-error private symbol
        expect(sessionPool.sessionOptions).toBeDefined();
        // @ts-expect-error private symbol
        expect(sessionPool.persistStateKey).toBeDefined();
        // @ts-expect-error private symbol
        expect(sessionPool.createSessionFunction).toEqual(sessionPool._defaultCreateSessionFunction);
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

            createSessionFunction: () => ({} as never),

        };
        sessionPool = new SessionPool(opts);
        await sessionPool.initialize();
        await sessionPool.teardown();

        entries(opts).filter(([key]) => key !== 'sessionOptions').forEach(([key, value]) => {
            expect(sessionPool[key]).toEqual(value);
        });
        // log is appended to sessionOptions after sessionPool instantiation
        // @ts-expect-error private symbol
        expect(sessionPool.sessionOptions).toEqual({ ...opts.sessionOptions, log: expect.any(Log) });
    });

    test('should work using SessionPool.open', async () => {
        const opts = {
            maxPoolSize: 3000,

            sessionOptions: {
                maxAgeSecs: 100,
                maxUsageCount: 1,
            },

            persistStateKeyValueStoreId: 'TEST',
            persistStateKey: 'SESSION_POOL_STATE2',

            createSessionFunction: () => ({} as never),

        };
        sessionPool = await SessionPool.open(opts);
        await sessionPool.teardown();

        entries(opts).filter(([key]) => key !== 'sessionOptions').forEach(([key, value]) => {
            expect(sessionPool[key]).toEqual(value);
        });
        // log is appended to sessionOptions after sessionPool instantiation
        // @ts-expect-error private symbol
        expect(sessionPool.sessionOptions).toEqual({ ...opts.sessionOptions, log: expect.any(Log) });
    });

    describe('should retrieve session', () => {
        test('should retrieve session with correct shape', async () => {
            sessionPool = await SessionPool.open({ sessionOptions: { maxAgeSecs: 100, maxUsageCount: 10 } });
            const session = await sessionPool.getSession();
            // @ts-expect-error private symbol
            expect(sessionPool.sessions.length).toBe(1);
            expect(session.id).toBeDefined();
            // @ts-expect-error Accessing private property
            expect(session.maxAgeSecs).toEqual(sessionPool.sessionOptions.maxAgeSecs);
            // @ts-expect-error Accessing private property
            expect(session.maxUsageCount).toEqual(sessionPool.sessionOptions.maxUsageCount);
            // @ts-expect-error Accessing private property
            expect(session.sessionPool).toEqual(sessionPool);
        });

        test('should pick session when pool is full', async () => {
            // @ts-expect-error private symbol
            sessionPool.maxPoolSize = 2;
            await sessionPool.getSession();
            await sessionPool.getSession();
            let isCalled = false;
            // @ts-expect-error Accessing private property
            const oldPick = sessionPool._pickSession; //eslint-disable-line

            // @ts-expect-error Overriding private property
            sessionPool._pickSession = () => { //eslint-disable-line
                isCalled = true;
                return oldPick.bind(sessionPool)();
            };

            await sessionPool.getSession();

            expect(isCalled).toBe(true); //eslint-disable-line
        });

        test('should delete picked session when it is unusable and create a new one', async () => {
            // @ts-expect-error private symbol
            sessionPool.maxPoolSize = 1;
            await sessionPool.addSession();

            const session = await sessionPool.getSession();
            // @ts-expect-error private symbol
            expect(sessionPool.sessions[0].id === session.id).toBe(true);

            // @ts-expect-error Overriding private property
            session.errorScore += session.maxErrorScore;
            await sessionPool.getSession();

            // @ts-expect-error private symbol
            expect(sessionPool.sessions[0].id === session.id).toBe(false);
            // @ts-expect-error private symbol
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
        newSession.setCookies(cookies, url);

        const state = sessionPool.getState();
        expect(state).toBeInstanceOf(Object);
        expect(state).toHaveProperty('usableSessionsCount');
        expect(state).toHaveProperty('retiredSessionsCount');
        expect(state).toHaveProperty('sessions');
    });

    test('should persist state and recreate it from storage', async () => {
        await sessionPool.getSession();
        await sessionPool.persistState();

        const kvStore = await KeyValueStore.open();
        // @ts-expect-error private symbol
        const sessionPoolSaved = await kvStore.getValue<ReturnType<SessionPool['getState']>>(sessionPool.persistStateKey);

        entries(sessionPoolSaved).forEach(([key, value]) => {
            if (key !== 'sessions') {
                expect(value).toEqual(sessionPool[key]);
            }
        });

        // @ts-expect-error private symbol
        expect(sessionPoolSaved.sessions.length).toEqual(sessionPool.sessions.length);

        sessionPoolSaved.sessions.forEach((session, index) => {
            entries(session).forEach(([key, value]) => {
                // @ts-expect-error private symbol
                if (sessionPool.sessions[index][key] instanceof Date) {
                    // @ts-expect-error private symbol
                    expect(value).toEqual((sessionPool.sessions[index][key] as Date).toISOString());
                } else if (key === 'cookieJar') {
                    // @ts-expect-error private symbol
                    expect(value).toEqual(sessionPool.sessions[index][key].toJSON());
                } else {
                    // @ts-expect-error private symbol
                    expect(sessionPool.sessions[index][key]).toEqual(value);
                }
            });
        });

        const loadedSessionPool = new SessionPool();

        await loadedSessionPool.initialize();
        // @ts-expect-error private symbol
        expect(sessionPool.sessions).toHaveLength(loadedSessionPool.sessions.length);
        // @ts-expect-error private symbol
        expect(sessionPool.maxPoolSize).toEqual(loadedSessionPool.maxPoolSize);
        // @ts-expect-error private symbol
        expect(sessionPool.persistStateKey).toEqual(loadedSessionPool.persistStateKey);
        await sessionPool.teardown();
    });

    test('should create only maxPoolSize number of sessions', async () => {
        // @ts-expect-error private symbol
        const max = sessionPool.maxPoolSize;
        for (let i = 0; i < max + 100; i++) {
            await sessionPool.getSession();
        }
        // @ts-expect-error private symbol
        expect(sessionPool.sessions.length).toEqual(sessionPool.maxPoolSize);
    });

    test('should create session', async () => {
        // @ts-expect-error private symbol
        await sessionPool._createSession();
        // @ts-expect-error private symbol
        expect(sessionPool.sessions.length).toBe(1);
        // @ts-expect-error private symbol
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

            // @ts-expect-error private symbol
            expect(sessionPool.sessions.length).toBe(1);

            events.emit(EventType.PERSIST_STATE);

            await new Promise<void>((resolve) => {
                const interval = setInterval(async () => {
                    // @ts-expect-error private symbol
                    const state = await sessionPool.keyValueStore.getValue(sessionPool.persistStateKey);
                    if (state) {
                        resolve();
                        clearInterval(interval);
                    }
                }, 100);
            });

            // @ts-expect-error private symbol
            const state = await sessionPool.keyValueStore.getValue(sessionPool.persistStateKey);

            expect(sessionPool.getState()).toEqual(state);
        });
    });

    test('should remove retired sessions', async () => {
        // @ts-expect-error private symbol
        sessionPool.maxPoolSize = 1;
        await sessionPool.getSession();

        // @ts-expect-error private symbol
        const session = sessionPool.sessions[0];
        // @ts-expect-error Overriding private property
        session.errorScore += session.maxErrorScore;
        const { id: retiredSessionId } = session;

        await sessionPool.getSession();

        // @ts-expect-error private symbol
        expect(sessionPool.sessions.find((s) => s.id === retiredSessionId)).toEqual(undefined);
    });

    test('should recreate only usable sessions', async () => {
        let invalidSessionsCount = 0;
        for (let i = 0; i < 10; i++) {
            const session = await sessionPool.getSession();

            if (i % 2 === 0) {
                // @ts-expect-error Overriding private property
                session.errorScore += session.maxErrorScore;
                invalidSessionsCount += 1;
            }
        }
        expect(sessionPool.retiredSessionsCount).toEqual(invalidSessionsCount);

        await sessionPool.persistState();

        const newSessionPool = new SessionPool();
        await newSessionPool.initialize();
        // @ts-expect-error private symbol
        expect(newSessionPool.sessions).toHaveLength(10 - invalidSessionsCount);

        await newSessionPool.teardown();
    });

    test('should restore persisted maxUsageCount of recreated sessions', async () => {
        sessionPool = await SessionPool.open({ maxPoolSize: 1, sessionOptions: { maxUsageCount: 66 } });
        await sessionPool.getSession();
        await sessionPool.persistState();
        const loadedSessionPool = new SessionPool({ maxPoolSize: 1, sessionOptions: { maxUsageCount: 88 } });
        await loadedSessionPool.initialize();

        const recreatedSession = await loadedSessionPool.getSession();

        // @ts-expect-error Accessing private property
        expect(recreatedSession.maxUsageCount).toEqual(66);
    });

    test('should persist state on teardown', async () => {
        const persistStateKey = 'TEST-KEY';
        const persistStateKeyValueStoreId = 'TEST-VALUE-STORE';

        const newSessionPool = await SessionPool.open({
            maxPoolSize: 1,
            persistStateKeyValueStoreId,
            persistStateKey,
        });

        await newSessionPool.teardown();

        // @ts-expect-error private symbol
        const kvStore = await KeyValueStore.open(newSessionPool.persistStateKeyValueStoreId);
        // @ts-expect-error private symbol
        const state = await kvStore.getValue(newSessionPool.persistStateKey);

        // @ts-expect-error private symbol
        expect(newSessionPool.persistStateKeyValueStoreId).toBeDefined();
        // @ts-expect-error private symbol
        expect(newSessionPool.persistStateKey).toBeDefined();
        expect(state).toBeDefined();
        expect(state).toBeInstanceOf(Object);
        expect(state).toHaveProperty('usableSessionsCount');
        expect(state).toHaveProperty('retiredSessionsCount');
        expect(state).toHaveProperty('sessions');
    });

    test('should createSessionFunction work', async () => {
        let isCalled;
        const createSessionFunction = (sessionPool2: SessionPool) => {
            isCalled = true;
            expect(sessionPool2 instanceof SessionPool).toBe(true);
            return new Session({ sessionPool: sessionPool2 });
        };
        const newSessionPool = await SessionPool.open({ createSessionFunction });
        const session = await newSessionPool.getSession();
        expect(isCalled).toBe(true);
        expect(session.constructor.name).toBe('Session');
    });

    it('should remove persist state event listener', async () => {
        expect(events.listenerCount(EventType.PERSIST_STATE)).toEqual(1);
        await sessionPool.teardown();
        expect(events.listenerCount(EventType.PERSIST_STATE)).toEqual(0);
    });

    test('should be able to create session with provided id', async () => {
        await sessionPool.addSession({ id: 'test-session' });
        // @ts-expect-error private symbol
        const session = sessionPool.sessions[0];
        expect(session.id).toBe('test-session');
    });

    test('should be able to add session instance and create new session with provided sessionOptions with addSession() ', async () => {
        const session = new Session({ sessionPool, id: 'test-session-instance' });
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
            expect((e as Error).message).toBe("Cannot add session with id 'test-session' as it already exists in the pool");
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
        // @ts-expect-error private symbol
        sessionPool.maxPoolSize = 10;

        for (let i = 0; i < 20; i++) await sessionPool.getSession();

        // @ts-expect-error private symbol
        expect(sessionPool.sessions.length).toEqual(10);
        // @ts-expect-error private symbol
        expect(sessionPool.sessionMap.size).toEqual(10);
        // @ts-expect-error private symbol
        expect(sessionPool.sessions.length).toEqual(sessionPool.sessionMap.size);
    });

    test('should correctly remove retired sessions both from array and session map', async () => {
        // @ts-expect-error private symbol
        sessionPool.maxPoolSize = 10;

        for (let i = 0; i < 10; i++) {
            await sessionPool.addSession({ id: `session_${i}` });
            const session = await sessionPool.getSession(`session_${i}`);
            // @ts-expect-error Overriding private property
            session.errorScore += session.maxErrorScore;
        }

        await sessionPool.getSession();

        // @ts-expect-error private symbol
        expect(sessionPool.sessions.length).toEqual(1);
        // @ts-expect-error private symbol
        expect(sessionPool.sessionMap.size).toEqual(1);
        // @ts-expect-error private symbol
        expect(sessionPool.sessions.length).toEqual(sessionPool.sessionMap.size);
    });
});
