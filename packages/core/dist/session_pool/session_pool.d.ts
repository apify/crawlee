/// <reference types="node" />
import type { Log } from '@apify/log';
import { EventEmitter } from 'node:events';
import { Configuration } from '../configuration';
import { KeyValueStore } from '../storages/key_value_store';
import type { SessionOptions } from './session';
import { Session } from './session';
import type { EventManager } from '../events/event_manager';
/**
 * Factory user-function which creates customized {@apilink Session} instances.
 */
export interface CreateSession {
    /**
     * @param sessionPool Pool requesting the new session.
     * @param options
     */
    (sessionPool: SessionPool, options?: {
        sessionOptions?: SessionOptions;
    }): Session | Promise<Session>;
}
export interface SessionPoolOptions {
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
     * Session pool persists it's state under this key in Key value store.
     * @default SESSION_POOL_STATE
     */
    persistStateKey?: string;
    /**
     * Custom function that should return `Session` instance.
     * Any error thrown from this function will terminate the process.
     * Function receives `SessionPool` instance as a parameter
     */
    createSessionFunction?: CreateSession;
    /**
     * Specifies which response status codes are considered as blocked.
     * Session connected to such request will be marked as retired.
     * @default [401, 403, 429]
     */
    blockedStatusCodes?: number[];
    /** @internal */
    log?: Log;
}
/**
 * Handles the rotation, creation and persistence of user-like sessions.
 * Creates a pool of {@apilink Session} instances, that are randomly rotated.
 * When some session is marked as blocked, it is removed and new one is created instead (the pool never returns an unusable session).
 * Learn more in the {@doclink guides/session-management | Session management guide}.
 *
 * You can create one by calling the {@apilink SessionPool.open} function.
 *
 * Session pool is already integrated into crawlers, and it can significantly improve your scraper
 * performance with just 2 lines of code.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new CheerioCrawler({
 *     useSessionPool: true,
 *     persistCookiesPerSession: true,
 *     // ...
 * })
 * ```
 *
 * You can configure the pool with many options. See the {@apilink SessionPoolOptions}.
 * Session pool is by default persisted in default {@apilink KeyValueStore}.
 * If you want to have one pool for all runs you have to specify
 * {@apilink SessionPoolOptions.persistStateKeyValueStoreId}.
 *
 * **Advanced usage:**
 *
 * ```javascript
 * const sessionPool = await SessionPool.open({
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
export declare class SessionPool extends EventEmitter {
    readonly config: Configuration;
    protected log: Log;
    protected maxPoolSize: number;
    protected createSessionFunction: CreateSession;
    protected keyValueStore: KeyValueStore;
    protected sessions: Session[];
    protected sessionMap: Map<string, Session>;
    protected sessionOptions: SessionOptions;
    protected persistStateKeyValueStoreId?: string;
    protected persistStateKey: string;
    protected _listener: () => Promise<void>;
    protected events: EventManager;
    protected readonly blockedStatusCodes: number[];
    /**
     * @internal
     */
    constructor(options?: SessionPoolOptions, config?: Configuration);
    /**
     * Gets count of usable sessions in the pool.
     */
    get usableSessionsCount(): number;
    /**
     * Gets count of retired sessions in the pool.
     */
    get retiredSessionsCount(): number;
    /**
     * Starts periodic state persistence and potentially loads SessionPool state from {@apilink KeyValueStore}.
     * It is called automatically by the {@apilink SessionPool.open} function.
     */
    initialize(): Promise<void>;
    /**
     * Adds a new session to the session pool. The pool automatically creates sessions up to the maximum size of the pool,
     * but this allows you to add more sessions once the max pool size is reached.
     * This also allows you to add session with overridden session options (e.g. with specific session id).
     * @param [options] The configuration options for the session being added to the session pool.
     */
    addSession(options?: Session | SessionOptions): Promise<void>;
    /**
     * Gets session.
     * If there is space for new session, it creates and returns new session.
     * If the session pool is full, it picks a session from the pool,
     * If the picked session is usable it is returned, otherwise it creates and returns a new one.
     */
    getSession(): Promise<Session>;
    /**
     * Gets session based on the provided session id or `undefined.
     */
    getSession(sessionId: string): Promise<Session>;
    /**
     * Returns an object representing the internal state of the `SessionPool` instance.
     * Note that the object's fields can change in future releases.
     */
    getState(): {
        usableSessionsCount: number;
        retiredSessionsCount: number;
        sessions: import("./session").SessionState[];
    };
    /**
     * Persists the current state of the `SessionPool` into the default {@apilink KeyValueStore}.
     * The state is persisted automatically in regular intervals.
     */
    persistState(): Promise<void>;
    /**
     * Removes listener from `persistState` event.
     * This function should be called after you are done with using the `SessionPool` instance.
     */
    teardown(): Promise<void>;
    /**
     * SessionPool should not work before initialization.
     */
    protected _throwIfNotInitialized(): void;
    /**
     * Removes retired `Session` instances from `SessionPool`.
     */
    protected _removeRetiredSessions(): void;
    /**
     * Adds `Session` instance to `SessionPool`.
     * @param newSession `Session` instance to be added.
     */
    protected _addSession(newSession: Session): void;
    /**
     * Gets random index.
     */
    protected _getRandomIndex(): number;
    /**
     * Creates new session without any extra behavior.
     * @param sessionPool
     * @param [options]
     * @param [options.sessionOptions] The configuration options for the session being created.
     * @returns New session.
     */
    protected _defaultCreateSessionFunction(sessionPool: SessionPool, options?: {
        sessionOptions?: SessionOptions;
    }): Session;
    /**
     * Creates new session and adds it to the pool.
     * @returns Newly created `Session` instance.
     */
    protected _createSession(): Promise<Session>;
    /**
     * Decides whether there is enough space for creating new session.
     */
    protected _hasSpaceForSession(): boolean;
    /**
     * Picks random session from the `SessionPool`.
     * @returns Picked `Session`.
     */
    protected _pickSession(): Session;
    /**
     * Potentially loads `SessionPool`.
     * If the state was persisted it loads the `SessionPool` from the persisted state.
     */
    protected _maybeLoadSessionPool(): Promise<void>;
    /**
     * Opens a SessionPool and returns a promise resolving to an instance
     * of the {@apilink SessionPool} class that is already initialized.
     *
     * For more details and code examples, see the {@apilink SessionPool} class.
     */
    static open(options?: SessionPoolOptions): Promise<SessionPool>;
}
//# sourceMappingURL=session_pool.d.ts.map