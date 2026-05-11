import { BaseCrawleeLogger, EventType, KeyValueStore, serviceLocator, Session, SessionPool } from '@crawlee/core';
import { entries } from '@crawlee/utils';
import { MemoryStorageEmulator } from '../../shared/MemoryStorageEmulator.js';

describe('SessionPool - testing session pool', () => {
    let sessionPool: SessionPool;
    const localStorageEmulator = new MemoryStorageEmulator();

    beforeEach(async () => {
        await localStorageEmulator.init();
        sessionPool = new SessionPool();
    });

    afterEach(async () => {
        serviceLocator.getEventManager().off(EventType.PERSIST_STATE);
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

            createSessionFunction: () => ({}) as never,
        };
        sessionPool = new SessionPool(opts);
        await sessionPool.teardown();

        entries(opts)
            .filter(([key]) => key !== 'sessionOptions')
            .forEach(([key, value]) => {
                expect(sessionPool[key]).toEqual(value);
            });
        // log is appended to sessionOptions after sessionPool instantiation
        // @ts-expect-error private symbol
        expect(sessionPool.sessionOptions).toEqual({ ...opts.sessionOptions, log: expect.any(BaseCrawleeLogger) });
    });

    describe('should retrieve session', () => {
        test('should retrieve session with correct shape', async () => {
            sessionPool = new SessionPool({ sessionOptions: { maxAgeSecs: 100, maxUsageCount: 10 } });
            const session = await sessionPool.getSession();
            // @ts-expect-error private symbol
            expect(sessionPool.sessions.length).toBe(1);
            expect(session.id).toBeDefined();
            // @ts-expect-error Accessing private property
            expect(session.maxAgeSecs).toEqual(sessionPool.sessionOptions.maxAgeSecs);
            // @ts-expect-error Accessing private property
            expect(session.maxUsageCount).toEqual(sessionPool.sessionOptions.maxUsageCount);
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
            sessionPool._pickSession = () => {
                //eslint-disable-line
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
            session._errorScore += session.maxErrorScore;
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

        const state = await sessionPool.getState();
        expect(state).toBeInstanceOf(Object);
        expect(state).toHaveProperty('usableSessionsCount');
        expect(state).toHaveProperty('retiredSessionsCount');
        expect(state).toHaveProperty('sessions');
    });

    test('should persist state and recreate it from storage', async () => {
        const persistStateKey = 'PERSIST_TEST';
        sessionPool = new SessionPool({ persistStateKey });

        await sessionPool.getSession();
        await sessionPool.persistState();

        const kvStore = await KeyValueStore.open();
        const sessionPoolSaved = await kvStore.getValue<Awaited<ReturnType<SessionPool['getState']>>>(
            // @ts-expect-error private symbol
            sessionPool.persistStateKey,
        );

        const currentState = await sessionPool.getState();
        expect(sessionPoolSaved!.usableSessionsCount).toEqual(currentState.usableSessionsCount);
        expect(sessionPoolSaved!.retiredSessionsCount).toEqual(currentState.retiredSessionsCount);

        // @ts-expect-error private symbol
        expect(sessionPoolSaved.sessions.length).toEqual(sessionPool.sessions.length);

        sessionPoolSaved!.sessions.forEach((session, index) => {
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

        const loadedSessionPool = new SessionPool({ persistStateKey });
        // @ts-expect-error Accessing protected method
        await loadedSessionPool.ensureInitialized();
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
        // @ts-expect-error Accessing protected method
        await sessionPool.ensureInitialized();
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
        });

        afterEach(async () => {
            await sessionPool.teardown();
        });

        test('on persist event', async () => {
            await sessionPool.getSession();

            // @ts-expect-error private symbol
            expect(sessionPool.sessions.length).toBe(1);

            serviceLocator.getEventManager().emit(EventType.PERSIST_STATE);

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

            expect(await sessionPool.getState()).toEqual(state);
        });
    });

    test('should remove retired sessions', async () => {
        // @ts-expect-error private symbol
        sessionPool.maxPoolSize = 1;
        await sessionPool.getSession();

        // @ts-expect-error private symbol
        const session = sessionPool.sessions[0];
        // @ts-expect-error Overriding private property
        session._errorScore += session.maxErrorScore;
        const { id: retiredSessionId } = session;

        await sessionPool.getSession();

        // @ts-expect-error private symbol
        expect(sessionPool.sessions.find((s) => s.id === retiredSessionId)).toEqual(undefined);
    });

    test('should recreate only usable sessions', async () => {
        const persistStateKey = 'RECREATE_TEST';
        sessionPool = new SessionPool({ persistStateKey });

        let invalidSessionsCount = 0;
        for (let i = 0; i < 10; i++) {
            const session = await sessionPool.getSession();

            if (i % 2 === 0) {
                // @ts-expect-error Overriding private property
                session._errorScore += session.maxErrorScore;
                invalidSessionsCount += 1;
            }
        }
        expect(await sessionPool.retiredSessionsCount()).toEqual(invalidSessionsCount);

        await sessionPool.persistState();

        const newSessionPool = new SessionPool({ persistStateKey });
        // @ts-expect-error Accessing protected method
        await newSessionPool.ensureInitialized();
        // @ts-expect-error Accessing private property
        expect(newSessionPool.sessions).toHaveLength(10 - invalidSessionsCount);

        await newSessionPool.teardown();
    });

    test('should restore persisted maxUsageCount of recreated sessions', async () => {
        const persistStateKey = 'MAX_USAGE_TEST';
        sessionPool = new SessionPool({
            maxPoolSize: 1,
            sessionOptions: { maxUsageCount: 66 },
            persistStateKey,
        });
        await sessionPool.getSession();
        await sessionPool.persistState();
        const loadedSessionPool = new SessionPool({
            maxPoolSize: 1,
            sessionOptions: { maxUsageCount: 88 },
            persistStateKey,
        });

        const recreatedSession = await loadedSessionPool.getSession();

        expect(recreatedSession.maxUsageCount).toEqual(66);
    });

    test('should persist state on teardown', async () => {
        const persistStateKey = 'TEST-KEY';
        const persistStateKeyValueStoreId = 'TEST-VALUE-STORE';

        const newSessionPool = new SessionPool({
            maxPoolSize: 1,
            persistStateKeyValueStoreId,
            persistStateKey,
        });
        // @ts-expect-error Accessing protected method
        await newSessionPool.ensureInitialized();

        await newSessionPool.teardown();

        // @ts-expect-error private symbol
        const kvStore = await KeyValueStore.open({ id: newSessionPool.persistStateKeyValueStoreId });
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
            return new Session();
        };
        const newSessionPool = new SessionPool({ createSessionFunction });
        const session = await newSessionPool.getSession();
        expect(isCalled).toBe(true);
        expect(session.constructor.name).toBe('Session');
    });

    it('should remove persist state event listener', async () => {
        const events = serviceLocator.getEventManager();
        // @ts-expect-error Accessing protected method
        await sessionPool.ensureInitialized();
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

    test('should be able to add session instance and create new session with provided sessionOptions with addSession()', async () => {
        const session = new Session({ id: 'test-session-instance' });
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
            expect((e as Error).message).toBe(
                "Cannot add session with id 'test-session' as it already exists in the pool",
            );
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
            session._errorScore += session.maxErrorScore;
        }

        await sessionPool.getSession();

        // @ts-expect-error private symbol
        expect(sessionPool.sessions.length).toEqual(1);
        // @ts-expect-error private symbol
        expect(sessionPool.sessionMap.size).toEqual(1);
        // @ts-expect-error private symbol
        expect(sessionPool.sessions.length).toEqual(sessionPool.sessionMap.size);
    });

    describe('sessionReuseStrategy', () => {
        test('random should fill pool before reusing sessions', async () => {
            sessionPool = new SessionPool({ sessionReuseStrategy: 'random', maxPoolSize: 3 });

            const s1 = await sessionPool.getSession();
            const s2 = await sessionPool.getSession();
            const s3 = await sessionPool.getSession();

            expect(new Set([s1.id, s2.id, s3.id]).size).toBe(3);

            const s4 = await sessionPool.getSession();
            expect([s1.id, s2.id, s3.id]).toContain(s4.id);
        });

        test('round-robin should fill pool before cycling', async () => {
            sessionPool = new SessionPool({ sessionReuseStrategy: 'round-robin', maxPoolSize: 3 });

            const s1 = await sessionPool.getSession();
            const s2 = await sessionPool.getSession();
            const s3 = await sessionPool.getSession();

            expect(new Set([s1.id, s2.id, s3.id]).size).toBe(3);

            const ids: string[] = [];
            for (let i = 0; i < 6; i++) {
                ids.push((await sessionPool.getSession()).id);
            }

            expect(ids).toEqual([s1.id, s2.id, s3.id, s1.id, s2.id, s3.id]);
        });

        test('round-robin should create a new session when all existing ones are retired', async () => {
            sessionPool = new SessionPool({ sessionReuseStrategy: 'round-robin', maxPoolSize: 1 });

            const s1 = await sessionPool.getSession();
            s1.retire();

            const s2 = await sessionPool.getSession();
            expect(s2.id).not.toBe(s1.id);
        });

        test.each(['random', 'round-robin'] as const)(
            '%s should evict a retired session from a full pool and replenish',
            async (strategy) => {
                sessionPool = new SessionPool({ sessionReuseStrategy: strategy, maxPoolSize: 3 });

                const s1 = await sessionPool.getSession();
                await sessionPool.getSession();
                await sessionPool.getSession();

                s1.retire();

                // @ts-expect-error private symbol
                expect(sessionPool.sessions).toHaveLength(3);

                for (let i = 0; i < 50; i++) await sessionPool.getSession();

                // @ts-expect-error private symbol
                expect(sessionPool.sessions).toHaveLength(3);
                // @ts-expect-error private symbol
                expect(sessionPool.sessions.find((s) => s.id === s1.id)).toBeUndefined();
            },
        );

        test('use-until-failure should keep reusing the same session', async () => {
            sessionPool = new SessionPool({ sessionReuseStrategy: 'use-until-failure' });

            const s1 = await sessionPool.getSession();
            const s2 = await sessionPool.getSession();
            const s3 = await sessionPool.getSession();

            expect(s1.id).toBe(s2.id);
            expect(s2.id).toBe(s3.id);
        });

        test('use-until-failure should switch to a new session after the current one is retired', async () => {
            sessionPool = new SessionPool({ sessionReuseStrategy: 'use-until-failure' });

            const s1 = await sessionPool.getSession();
            s1.retire();

            const s2 = await sessionPool.getSession();
            expect(s2.id).not.toBe(s1.id);
        });
    });

    describe('multiple SessionPool instances isolation', () => {
        test('should use unique persist keys by default', async () => {
            const pool1 = new SessionPool();
            const pool2 = new SessionPool();

            // @ts-expect-error private symbol
            expect(pool1.persistStateKey).not.toEqual(pool2.persistStateKey);

            await pool1.teardown();
            await pool2.teardown();
        });

        test("should not overwrite each other's persisted state", async () => {
            const pool1 = new SessionPool({ maxPoolSize: 5 });
            const pool2 = new SessionPool({ maxPoolSize: 5 });

            for (let i = 0; i < 3; i++) await pool1.getSession();
            for (let i = 0; i < 5; i++) await pool2.getSession();

            await pool1.persistState();
            await pool2.persistState();

            const pool1Reloaded = new SessionPool({
                // @ts-expect-error private symbol
                persistStateKey: pool1.persistStateKey,
            });
            const pool2Reloaded = new SessionPool({
                // @ts-expect-error private symbol
                persistStateKey: pool2.persistStateKey,
            });

            // @ts-expect-error -- we're reading the private sessions field, public methods initialize the instance automatically
            await pool1Reloaded.ensureInitialized();
            // @ts-expect-error
            await pool2Reloaded.ensureInitialized();

            // @ts-expect-error private symbol
            expect(pool1Reloaded.sessions).toHaveLength(3);
            // @ts-expect-error private symbol
            expect(pool2Reloaded.sessions).toHaveLength(5);

            await pool1.teardown();
            await pool2.teardown();
            await pool1Reloaded.teardown();
            await pool2Reloaded.teardown();
        });

        test('retiring sessions in one pool should not affect another', async () => {
            const pool1 = new SessionPool({ maxPoolSize: 2 });
            const pool2 = new SessionPool({ maxPoolSize: 2 });

            const session1 = await pool1.getSession();
            await pool2.getSession();

            session1.retire();

            expect(await pool1.retiredSessionsCount()).toBe(1);
            expect(await pool2.retiredSessionsCount()).toBe(0);

            await pool1.teardown();
            await pool2.teardown();
        });
    });
});
