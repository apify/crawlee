/**
 * Factory user-function which creates customized {@link Session} instances.
 * @template UserData
 * @callback CreateSession
 * @param {SessionPool<UserData>} sessionPool Pool requesting the new session.
 */
/**
 * @template UserData
 * @typedef SessionPoolOptions
 * @property {number} [maxPoolSize=1000] - Maximum size of the pool.
 * Indicates how many sessions are rotated.
 * @property {SessionOptions<UserData>} [sessionOptions] The configuration options for {Session} instances.
 * @property {string} [persistStateKeyValueStoreId] - Name or Id of `KeyValueStore` where is the `SessionPool` state stored.
 * @property {string} [persistStateKey="SESSION_POOL_STATE"] - Session pool persists it's state under this key in Key value store.
 * @property {CreateSession<UserData>} [createSessionFunction] - Custom function that should return `Session` instance.
 * Function receives `SessionPool` instance as a parameter
 */
/**
 * Handles the sessions rotation, creation and persistence.
 * Creates a pool of {@link Session} instances, that are randomly rotated.
 * When some session is marked as blocked. It is removed and new one is created instead.
 *
 * Session pool is by default persisted in default {@link KeyValueStore}.
 * If you want to have one pool for all runs you have to specify `persistStateKeyValueStoreId`.
 *
 * **Example usage:**
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
 * // Now you have to initialize the `SessionPool`.
 * // If you already have a persisted state in the selected `KeyValueState`.
 * // The Session pool is recreated, otherwise it creates a new one.
 * // It also attaches listener to `Apify.events` so it is persisted periodically and not after every change.
 * await sessionPool.initialize();
 *
 * // Get random session from the pool
 * const session1 = await sessionPool.getSession();
 * const session2 = await sessionPool.getSession();
 * const session3 = await sessionPool.getSession();
 *
 * // Now you can mark the session either failed of successful
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
 * @hideconstructor
 * @template UserData
 */
export class SessionPool<UserData> extends EventEmitter {
    /**
     * Session pool configuration.
     * @param {SessionPoolOptions<UserData>} [options] All `SessionPool` configuration options.
     */
    constructor(options?: SessionPoolOptions<UserData> | undefined);
    maxPoolSize: number;
    createSessionFunction: any;
    /** @type {SessionPoolOptions<UserData>} */
    sessionOptions: SessionPoolOptions<UserData>;
    persistStateKeyValueStoreId: any;
    persistStateKey: string;
    keyValueStore: import("../key_value_store").KeyValueStore | null;
    /** @type {Array<Session<UserData>>} */
    sessions: Array<Session<UserData>>;
    /**
     * Gets count of usable sessions in the pool.
     * @return {number}
     */
    get usableSessionsCount(): number;
    /**
     * Gets count of retired sessions in the pool.
     * @return {number}
     */
    get retiredSessionsCount(): number;
    /**
     * Starts periodic state persistence and potentially loads SessionPool state from {@link KeyValueStore}.
     * This function must be called before you can start using the instance in a meaningful way.
     *
     * @return {Promise<void>}
     */
    initialize(): Promise<void>;
    _listener: (() => Promise<void>) | undefined;
    /**
     * Gets session.
     * If there is space for new session, it creates and return new session.
     * If the session pool is full, it picks a session from the pool,
     * If the picked session is usable it is returned, otherwise it creates and returns a new one.
     *
     * @return {Promise<Session<UserData>>}
     */
    getSession(): Promise<Session<UserData>>;
    /**
     * Returns an object representing the internal state of the `SessionPool` instance.
     * Note that the object's fields can change in future releases.
     */
    getState(): {
        usableSessionsCount: number;
        retiredSessionsCount: number;
        sessions: import("./session").SessionState<UserData>[];
    };
    /**
     * Persists the current state of the `SessionPool` into the default {@link KeyValueStore}.
     * The state is persisted automatically in regular intervals.
     *
     * @return {Promise<void>}
     */
    persistState(): Promise<void>;
    /**
     * Removes listener from `persistState` event.
     * This function should be called after you are done with using the `SessionPool` instance.
     */
    teardown(): void;
    /**
     * Removes `Session` instance from `SessionPool`.
     * @param {Session<*>} session  - Session to be removed
     * @private
     */
    _removeSession(session: Session<any>): void;
    /**
     * Adds `Session` instance to `SessionPool`.
     * @param {Session<*>} newSession `Session` instance to be added.
     * @private
     */
    _addSession(newSession: Session<any>): void;
    /**
     * Gets random index.
     * @return {number}
     * @private
     */
    _getRandomIndex(): number;
    /**
     * Creates new session without any extra behavior.
     * @param {SessionPool<*>} sessionPool
     * @return {Session<*>} - New session.
     * @private
     */
    _defaultCreateSessionFunction(sessionPool: SessionPool<any>): Session<any>;
    /**
     * Creates new session and adds it to the pool.
     * @return {Promise<Session<*>>} - Newly created `Session` instance.
     * @private
     */
    _createSession(): Promise<Session<any>>;
    /**
     * Decides whether there is enough space for creating new session.
     * @return {boolean}
     * @private
     */
    _hasSpaceForSession(): boolean;
    /**
     * Picks random session from the `SessionPool`.
     * @return {Session<UserData>} - Picked `Session`
     * @private
     */
    _pickSession(): Session<UserData>;
    /**
     * Potentially loads `SessionPool`.
     * If the state was persisted it loads the `SessionPool` from the persisted state.
     * @return {Promise<void>}
     * @private
     */
    _maybeLoadSessionPool(): Promise<void>;
}
export function openSessionPool<UserData>(sessionPoolOptions: SessionPoolOptions<UserData>): Promise<SessionPool<UserData>>;
/**
 * Factory user-function which creates customized {@link Session} instances.
 */
export type CreateSession<UserData> = (sessionPool: SessionPool<UserData>) => any;
export type SessionPoolOptions<UserData> = {
    /**
     * - Maximum size of the pool.
     * Indicates how many sessions are rotated.
     */
    maxPoolSize?: number;
    /**
     * The configuration options for {Session} instances.
     */
    sessionOptions?: SessionOptions<UserData>;
    /**
     * - Name or Id of `KeyValueStore` where is the `SessionPool` state stored.
     */
    persistStateKeyValueStoreId?: string;
    /**
     * - Session pool persists it's state under this key in Key value store.
     */
    persistStateKey?: string;
    /**
     * - Custom function that should return `Session` instance.
     * Function receives `SessionPool` instance as a parameter
     */
    createSessionFunction?: CreateSession<UserData>;
};
import { EventEmitter } from  "events";
import { Session } from "./session";
import { SessionOptions } from "./session";
