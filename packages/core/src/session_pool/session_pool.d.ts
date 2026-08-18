import type { ISessionPool } from '@crawlee/types';
import type { PersistenceOptions } from '../crawlers/statistics.js';
import type { CrawleeLogger } from '../log.js';
import type { SessionOptions } from './session.js';
import { Session } from './session.js';
declare const SESSION_REUSE_STRATEGIES: readonly ["random", "round-robin", "use-until-failure"];
export type SessionReuseStrategy = (typeof SESSION_REUSE_STRATEGIES)[number];
/**
 * Factory user-function which creates customized {@apilink Session} instances.
 */
export interface CreateSession {
    /**
     * @param options.sessionOptions Per-call session options already merged with the pool-wide defaults.
     */
    (options?: {
        sessionOptions?: SessionOptions;
    }): Session | Promise<Session>;
}
export interface SessionPoolOptions {
    /**
     * Unique identifier for this session pool instance. Used to generate a unique
     * persistence key when `persistStateKey` is not provided.
     * If not provided, an auto-incrementing ID is used.
     */
    id?: string | number;
    /**
     * Maximum size of the pool. Indicates how many sessions are rotated.
     * @default 1000
     */
    maxPoolSize?: number;
    /** The configuration options for {@apilink Session} instances. */
    sessionOptions?: SessionOptions;
    /** Name or Id of `KeyValueStore` where is the `SessionPool` state stored. */
    persistStateKeyValueStoreId?: string;
    /**
     * Session pool persists its state under this key in Key value store.
     * @default CRAWLEE_SESSION_POOL_STATE_{id}
     */
    persistStateKey?: string;
    /**
     * Custom function that should return a `Session` instance, or a promise resolving to such instance.
     * Any error thrown from this function will terminate the process. Receives `{ sessionOptions }`
     * already merged from the pool-wide defaults and the per-call overrides.
     */
    createSessionFunction?: CreateSession;
    /**
     * Strategy for picking sessions from the pool.
     * - `'random'` (default): fills the pool up to `maxPoolSize`, then picks a random usable session
     * - `'round-robin'`: fills the pool up to `maxPoolSize`, then reuses sessions cycling through them in order
     * - `'use-until-failure'`: always reuses the same session until it is retired, then moves to the next one
     * @default 'random'
     */
    sessionReuseStrategy?: SessionReuseStrategy;
    /** @internal */
    log?: CrawleeLogger;
    /**
     * Control how and when to persist the state of the session pool.
     */
    persistenceOptions?: PersistenceOptions;
}
/**
 * Handles the rotation, creation and persistence of user-like sessions.
 * Creates a pool of {@apilink Session} instances, that are randomly rotated.
 * When some session is marked as blocked, it is removed and new one is created instead (the pool never returns an unusable session).
 * Learn more in the {@doclink guides/session-management | Session management guide}.
 *
 * Session pool is already integrated into crawlers and is always active.
 * All public methods are lazy-initialized — the pool initializes itself on first use.
 *
 * You can configure the pool with many options. See the {@apilink SessionPoolOptions}.
 * Session pool is by default persisted in default {@apilink KeyValueStore}.
 * If you want to have one pool for all runs you have to specify
 * {@apilink SessionPoolOptions.persistStateKeyValueStoreId}.
 *
 * **Advanced usage:**
 *
 * ```javascript
 * const sessionPool = new SessionPool({
 *     maxPoolSize: 25,
 *     sessionOptions:{
 *          maxAgeSecs: 10,
 *          maxUsageCount: 150, // for example when you know that the site blocks after 150 requests.
 *     },
 *     persistStateKeyValueStoreId: 'my-key-value-store-for-sessions',
 *     persistStateKey: 'my-session-pool',
 * });
 *
 * // Get random session from the pool
 * const session1 = await sessionPool.getSession();
 * const session2 = await sessionPool.getSession();
 * const session3 = await sessionPool.getSession();
 *
 * // Now you can mark the session either failed or successful
 *
 * // Marks session as bad after unsuccessful usage -> it increases error count (soft retire)
 * session1.markBad()
 *
 * // Marks as successful.
 * session2.markGood()
 *
 * // Retires session -> session is removed from the pool
 * session3.retire()
 *
 * ```
 *
 * **Default session allocation flow:*
 * 1. Until the `SessionPool` reaches `maxPoolSize`, new sessions are created, provided to the user and added to the pool
 * 2. Blocked/retired sessions stay in the pool but are never provided to the user
 * 3. Once the pool is full (live plus blocked session count reaches `maxPoolSize`), a random session from the pool is provided.
 * 4. If a blocked session would be picked, instead all blocked sessions are evicted from the pool and a new session is created and provided
 *
 * @category Scaling
 */
export declare class SessionPool implements ISessionPool {
    #private;
    readonly id: string;
    readonly maxPoolSize: number;
    get sessionOptions(): SessionOptions;
    get persistStateKey(): string;
    get persistStateKeyValueStoreId(): string | undefined;
    constructor(options?: SessionPoolOptions);
    /**
     * Gets count of usable sessions in the pool.
     */
    usableSessionsCount(): Promise<number>;
    /**
     * Gets count of retired sessions in the pool.
     */
    retiredSessionsCount(): Promise<number>;
    /**
     * Starts periodic state persistence and potentially loads SessionPool state from {@apilink KeyValueStore}.
     * Called automatically on first use of any public method.
     */
    private ensureInitialized;
    private setupPool;
    /**
     * Adds a new session to the session pool. The pool automatically creates sessions up to the maximum size of the pool,
     * but this allows you to add more sessions once the max pool size is reached.
     * This also allows you to add session with overridden session options (e.g. with specific session id).
     * @param [options] The configuration options for the session being added to the session pool.
     */
    addSession(options?: Session | SessionOptions): Promise<void>;
    /**
     * Adds a new session to the session pool. The pool automatically creates sessions up to the maximum size of the pool,
     * but this allows you to add more sessions once the max pool size is reached.
     * This also allows you to add session with overridden session options (e.g. with specific session id).
     * @param [options] The configuration options for the session being added to the session pool.
     */
    newSession(sessionOptions?: SessionOptions): Promise<Session>;
    /**
     * Gets session.
     * If there is space for new session, it creates and returns new session.
     * If the session pool is full, it picks a session from the pool,
     * If the picked session is usable it is returned, otherwise it creates and returns a new one.
     * @param [sessionId] If provided, it returns the usable session with this id, `undefined` otherwise.
     */
    getSession(sessionId?: string): Promise<Session | undefined>;
    /**
     * @param options - Override the persistence options provided in the constructor
     */
    resetStore(options?: PersistenceOptions): Promise<void>;
    /**
     * Returns an object representing the internal state of the `SessionPool` instance.
     * Note that the object's fields can change in future releases.
     */
    getState(): Promise<{
        usableSessionsCount: number;
        retiredSessionsCount: number;
        sessions: import("@crawlee/types").SessionState[];
    }>;
    /**
     * Persists the current state of the `SessionPool` into the default {@apilink KeyValueStore}.
     * The state is persisted automatically in regular intervals.
     * @param options - Override the persistence options provided in the constructor
     */
    persistState(options?: PersistenceOptions): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
    /**
     * Removes listener from `persistState` event.
     * This function should be called after you are done with using the `SessionPool` instance.
     * @param options - Set `persistState` to false when the final state was already persisted by the event manager.
     */
    teardown({ persistState }?: {
        persistState?: boolean;
    }): Promise<void>;
    /**
     * Removes retired `Session` instances from `SessionPool`.
     */
    private removeRetiredSessions;
    /**
     * Adds `Session` instance to `SessionPool`.
     * @param newSession `Session` instance to be added.
     */
    private registerSession;
    /**
     * Gets random index.
     */
    private getRandomIndex;
    /**
     * Creates new session without any extra behavior.
     * @param [options]
     * @param [options.sessionOptions] The configuration options for the session being created.
     * @returns New session.
     */
    private defaultCreateSessionFunction;
    /**
     * Invokes `createSessionFunction` with `sessionOptions` already merged from pool-wide defaults and
     * the supplied per-call overrides, so custom implementations don't need to spread `pool.sessionOptions` themselves.
     *
     * A default {@apilink SessionFingerprint} is generated up front (host OS as
     * `platform`, a random valid `browser`/`device` for that platform). Pool-wide
     * and per-call options override it, and a persisted fingerprint coming
     * through `maybeLoadSessionPool` naturally wins because it arrives in
     * `perCallOptions`.
     */
    private invokeCreateSessionFunction;
    /**
     * Creates new session and adds it to the pool.
     * @returns Newly created `Session` instance.
     */
    private createSession;
    /**
     * Decides whether there is enough space for creating new session.
     */
    private hasSpaceForSession;
    /**
     * Picks a session from the `SessionPool` according to the configured `sessionReuseStrategy`.
     * Returns `undefined` when no session should be reused and a new one should be created instead.
     */
    private pickSession;
    /**
     * Potentially loads `SessionPool`.
     * If the state was persisted it loads the `SessionPool` from the persisted state.
     */
    private maybeLoadSessionPool;
}
export {};
