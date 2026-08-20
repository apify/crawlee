import { EventType, KeyValueStore, MemoryStorageBackend, serviceLocator, Session, SessionPool } from '@crawlee/core';
import type { SessionOptions } from '@crawlee/core';

describe('SessionPool - testing session pool', () => {
    let sessionPool: SessionPool;

    beforeEach(async () => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        sessionPool = new SessionPool();
    });

    afterEach(async () => {
        serviceLocator.getEventManager().off(EventType.PERSIST_STATE);
    });

    test('should initialize with default values for first time', async () => {
        expect((await sessionPool.getState()).sessions).toEqual([]);
        expect(sessionPool.id).toBeDefined();
    });

    test('should override default values', async () => {
        let customFunctionCalled = false;
        const persistStateKey = 'CUSTOM_KEY';
        const opts = {
            maxPoolSize: 5,
            sessionOptions: {
                maxAgeSecs: 100,
                maxUsageCount: 1,
            },
            persistStateKey,
            createSessionFunction: (options?: { sessionOptions?: SessionOptions }) => {
                customFunctionCalled = true;
                return new Session(options?.sessionOptions);
            },
        };
        sessionPool = new SessionPool(opts);

        const session = await sessionPool.getSession();
        expect(customFunctionCalled).toBe(true);
        expect(session!.maxUsageCount).toBe(1);
        expect(session!.expiresAt.getTime() - session!.createdAt.getTime()).toBeCloseTo(100 * 1000, -2);

        await sessionPool.persistState();
        const kvStore = await KeyValueStore.open();
        expect(await kvStore.getValue(persistStateKey)).toBeDefined();

        await sessionPool.teardown();
    });

    describe('should retrieve session', () => {
        test('should retrieve session with correct shape', async () => {
            sessionPool = new SessionPool({ sessionOptions: { maxAgeSecs: 100, maxUsageCount: 10 } });
            const session = await sessionPool.getSession();
            expect((await sessionPool.getState()).sessions).toHaveLength(1);
            expect(session?.id).toBeDefined();
            expect(session!.expiresAt.getTime() - session!.createdAt.getTime()).toBeCloseTo(100 * 1000, -2);
            expect(session?.maxUsageCount).toEqual(10);
        });

        test('should pick session when pool is full', async () => {
            sessionPool = new SessionPool({ maxPoolSize: 2 });
            const s1 = await sessionPool.getSession();
            const s2 = await sessionPool.getSession();

            const s3 = await sessionPool.getSession();
            expect(s3).toBeDefined();
            // When pool is full (size 2), getting another session reuses one rather than growing the pool.
            expect((await sessionPool.getState()).sessions).toHaveLength(2);
            expect([s1?.id, s2?.id]).toContain(s3?.id);
        });

        test('should delete picked session when it is unusable and create a new one', async () => {
            sessionPool = new SessionPool({ maxPoolSize: 1 });
            await sessionPool.addSession();

            const session = await sessionPool.getSession();
            expect((await sessionPool.getState()).sessions[0].id).toBe(session!.id);

            session!.retire();
            await sessionPool.getSession();

            const { sessions } = await sessionPool.getState();
            expect(sessions[0].id).not.toBe(session!.id);
            expect(sessions).toHaveLength(1);
        });
    });

    test('get state should work', async () => {
        const url = 'https://example.com';
        const newSession = await sessionPool.getSession();
        await newSession?.cookieJar.setCookie('cookie1=my-cookie', url);
        await newSession?.cookieJar.setCookie('cookie2=your-cookie', url);

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
        const sessionPoolSaved = await kvStore.getValue<Awaited<ReturnType<SessionPool['getState']>>>(persistStateKey);

        const currentState = await sessionPool.getState();
        expect(sessionPoolSaved!.usableSessionsCount).toEqual(currentState.usableSessionsCount);
        expect(sessionPoolSaved!.retiredSessionsCount).toEqual(currentState.retiredSessionsCount);

        // Every persisted session round-trips field for field, dates and cookie jar included.
        expect(sessionPoolSaved!.sessions).toEqual(currentState.sessions);

        const loadedSessionPool = new SessionPool({ persistStateKey });
        expect((await sessionPool.getState()).sessions).toHaveLength(
            (await loadedSessionPool.getState()).sessions.length,
        );
        await sessionPool.teardown();
    });

    test('should create only maxPoolSize number of sessions', async () => {
        const maxPoolSize = 10;
        sessionPool = new SessionPool({ maxPoolSize });
        for (let i = 0; i < maxPoolSize + 100; i++) {
            await sessionPool.getSession();
        }
        expect((await sessionPool.getState()).sessions).toHaveLength(maxPoolSize);
    });

    test('should create session', async () => {
        // @ts-expect-error Accessing protected method
        await sessionPool.ensureInitialized();
        // @ts-expect-error private symbol
        await sessionPool.createSession();
        const { sessions } = await sessionPool.getState();
        expect(sessions).toHaveLength(1);
        expect(sessions[0].id).toBeDefined();
    });

    describe('should persist state', () => {
        const KV_STORE = 'SESSION-TEST';

        beforeEach(async () => {
            sessionPool = new SessionPool({
                persistStateKeyValueStoreId: KV_STORE,
                persistStateKey: 'CRAWLEE_SESSION_POOL_STATE',
            });
        });

        afterEach(async () => {
            await sessionPool.teardown();
        });

        test('on persist event', async () => {
            const store = await KeyValueStore.open(KV_STORE);
            await sessionPool.getSession();

            expect((await sessionPool.getState()).sessions).toHaveLength(1);

            serviceLocator.getEventManager().emit(EventType.PERSIST_STATE);

            await new Promise<void>((resolve) => {
                const interval = setInterval(async () => {
                    const state = await store.getValue('CRAWLEE_SESSION_POOL_STATE');
                    if (state) {
                        resolve();
                        clearInterval(interval);
                    }
                }, 100);
            });

            const state = await store.getValue('CRAWLEE_SESSION_POOL_STATE');

            expect(await sessionPool.getState()).toEqual(state);
        });
    });

    test('should remove retired sessions', async () => {
        sessionPool = new SessionPool({ maxPoolSize: 1 });
        const session = (await sessionPool.getSession())!;

        session.retire();
        const { id: retiredSessionId } = session;

        await sessionPool.getSession();

        const { sessions } = await sessionPool.getState();
        expect(sessions.find((s) => s.id === retiredSessionId)).toBeUndefined();
    });

    test('should recreate only usable sessions', async () => {
        const persistStateKey = 'RECREATE_TEST';
        sessionPool = new SessionPool({ persistStateKey });

        let invalidSessionsCount = 0;
        for (let i = 0; i < 10; i++) {
            const session = await sessionPool.getSession();

            if (i % 2 === 0) {
                session!.retire();
                invalidSessionsCount += 1;
            }
        }
        expect(await sessionPool.retiredSessionsCount()).toEqual(invalidSessionsCount);

        await sessionPool.persistState();

        const newSessionPool = new SessionPool({ persistStateKey });
        expect((await newSessionPool.getState()).sessions).toHaveLength(10 - invalidSessionsCount);

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

        expect(recreatedSession?.maxUsageCount).toEqual(66);
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

        const kvStore = await KeyValueStore.open({ id: persistStateKeyValueStoreId });
        const state = await kvStore.getValue(persistStateKey);

        expect(state).toBeDefined();
        expect(state).toBeInstanceOf(Object);
        expect(state).toHaveProperty('usableSessionsCount');
        expect(state).toHaveProperty('retiredSessionsCount');
        expect(state).toHaveProperty('sessions');
    });

    test('should createSessionFunction work', async () => {
        let isCalled = false;
        let receivedOptions: { sessionOptions?: object } | undefined;
        const createSessionFunction = (opts?: { sessionOptions?: object }) => {
            isCalled = true;
            receivedOptions = opts;
            return new Session();
        };
        const newSessionPool = new SessionPool({ createSessionFunction });
        const session = await newSessionPool.getSession();
        expect(isCalled).toBe(true);
        expect(receivedOptions?.sessionOptions).toBeDefined();
        expect(session?.constructor.name).toBe('Session');
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
        const session = await sessionPool.getSession('test-session');
        expect(session?.id).toBe('test-session');
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
        expect(session?.id).toBe('test-session');
    });

    test('should correctly populate session array and session map', async () => {
        sessionPool = new SessionPool({ maxPoolSize: 10 });

        for (let i = 0; i < 20; i++) await sessionPool.getSession();

        const { sessions } = await sessionPool.getState();
        expect(sessions).toHaveLength(10);
        for (const session of sessions) {
            const byId = await sessionPool.getSession(session.id);
            expect(byId?.id).toBe(session.id);
        }
    });

    test('should correctly remove retired sessions both from array and session map', async () => {
        sessionPool = new SessionPool({ maxPoolSize: 10 });

        for (let i = 0; i < 10; i++) {
            await sessionPool.addSession({ id: `session_${i}` });
            const session = await sessionPool.getSession(`session_${i}`);
            session!.retire();
        }

        await sessionPool.getSession();

        const { sessions } = await sessionPool.getState();
        for (let i = 0; i < 10; i++) {
            await sessionPool.addSession({ id: `session_${i}` });
        }
    });

    describe('sessionReuseStrategy', () => {
        test('random should fill pool before reusing sessions', async () => {
            sessionPool = new SessionPool({ sessionReuseStrategy: 'random', maxPoolSize: 3 });

            const s1 = await sessionPool.getSession();
            const s2 = await sessionPool.getSession();
            const s3 = await sessionPool.getSession();

            expect(new Set([s1?.id, s2?.id, s3?.id]).size).toBe(3);

            const s4 = await sessionPool.getSession();
            expect([s1?.id, s2?.id, s3?.id]).toContain(s4?.id);
        });

        test('round-robin should fill pool before cycling', async () => {
            sessionPool = new SessionPool({ sessionReuseStrategy: 'round-robin', maxPoolSize: 3 });

            const s1 = await sessionPool.getSession();
            const s2 = await sessionPool.getSession();
            const s3 = await sessionPool.getSession();

            expect(new Set([s1?.id, s2?.id, s3?.id]).size).toBe(3);

            const ids: string[] = [];
            for (let i = 0; i < 6; i++) {
                ids.push((await sessionPool.getSession())?.id!);
            }

            expect(ids).toEqual([s1?.id, s2?.id, s3?.id, s1?.id, s2?.id, s3?.id]);
        });

        test('round-robin should create a new session when all existing ones are retired', async () => {
            sessionPool = new SessionPool({ sessionReuseStrategy: 'round-robin', maxPoolSize: 1 });

            const s1 = await sessionPool.getSession();
            s1?.retire();

            const s2 = await sessionPool.getSession();
            expect(s2?.id).not.toBe(s1?.id);
        });

        test.each(['random', 'round-robin'] as const)(
            '%s should evict a retired session from a full pool and replenish',
            async (strategy) => {
                sessionPool = new SessionPool({ sessionReuseStrategy: strategy, maxPoolSize: 3 });

                const s1 = await sessionPool.getSession();
                await sessionPool.getSession();
                await sessionPool.getSession();

                s1?.retire();

                expect((await sessionPool.getState()).sessions).toHaveLength(3);

                for (let i = 0; i < 50; i++) await sessionPool.getSession();

                const { sessions } = await sessionPool.getState();
                expect(sessions).toHaveLength(3);
                expect(sessions.find((s) => s.id === s1!.id)).toBeUndefined();
            },
        );

        test('use-until-failure should keep reusing the same session', async () => {
            sessionPool = new SessionPool({ sessionReuseStrategy: 'use-until-failure' });

            const s1 = await sessionPool.getSession();
            const s2 = await sessionPool.getSession();
            const s3 = await sessionPool.getSession();

            expect(s1?.id).toBe(s2?.id);
            expect(s2?.id).toBe(s3?.id);
        });

        test('use-until-failure should switch to a new session after the current one is retired', async () => {
            sessionPool = new SessionPool({ sessionReuseStrategy: 'use-until-failure' });

            const s1 = await sessionPool.getSession();
            s1?.retire();

            const s2 = await sessionPool.getSession();
            expect(s2?.id).not.toBe(s1?.id);
        });
    });

    describe('multiple SessionPool instances isolation', () => {
        test('should use unique ids by default', async () => {
            const pool1 = new SessionPool();
            const pool2 = new SessionPool();

            expect(pool1.id).not.toEqual(pool2.id);

            await pool1.teardown();
            await pool2.teardown();
        });

        test("should not overwrite each other's persisted state", async () => {
            const pool1 = new SessionPool({ id: 'pool-1', maxPoolSize: 5 });
            const pool2 = new SessionPool({ id: 'pool-2', maxPoolSize: 5 });

            for (let i = 0; i < 3; i++) await pool1.getSession();
            for (let i = 0; i < 5; i++) await pool2.getSession();

            await pool1.persistState();
            await pool2.persistState();

            const pool1Reloaded = new SessionPool({
                id: 'pool-1',
            });
            const pool2Reloaded = new SessionPool({
                id: 'pool-2',
            });

            expect((await pool1Reloaded.getState()).sessions).toHaveLength(3);
            expect((await pool2Reloaded.getState()).sessions).toHaveLength(5);

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

            session1?.retire();

            expect(await pool1.retiredSessionsCount()).toBe(1);
            expect(await pool2.retiredSessionsCount()).toBe(0);

            await pool1.teardown();
            await pool2.teardown();
        });
    });
});
