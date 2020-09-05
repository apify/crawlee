import { EventEmitter } from 'events';
import { checkParamOrThrow } from 'apify-client/build/utils';

import { openKeyValueStore } from '../key_value_store';
import { Session, SessionOptions } from './session'; // eslint-disable-line no-unused-vars,import/named,import/no-cycle
import events from '../events';
import defaultLog from '../utils_log';
import { ACTOR_EVENT_NAMES_EX } from '../constants';

/**
 * Factory user-function which creates customized {@link Session} instances.
 * @callback CreateSession
 * @param {SessionPool} sessionPool Pool requesting the new session.
 * @returns {Session}
 */

/**
 * @typedef SessionPoolOptions
 * @property {number} [maxPoolSize=1000] - Maximum size of the pool.
 * Indicates how many sessions are rotated.
 * @property {SessionOptions} [sessionOptions] The configuration options for {Session} instances.
 * @property {string} [persistStateKeyValueStoreId] - Name or Id of `KeyValueStore` where is the `SessionPool` state stored.
 * @property {string} [persistStateKey="SESSION_POOL_STATE"] - Session pool persists it's state under this key in Key value store.
 * @property {CreateSession} [createSessionFunction] - Custom function that should return `Session` instance.
 * Any error thrown from this function will terminate the process.
 * Function receives `SessionPool` instance as a parameter
 */

/**
 * Handles the rotation, creation and persistence of user-like sessions.
 * Creates a pool of {@link Session} instances, that are randomly rotated.
 * When some session is marked as blocked. It is removed and new one is created instead.
 * Learn more in the [`Session management guide`](/docs/guides/session-management).
 *
 * You can create one by calling the {@link Apify.openSessionPool} function.
 *
 * Session pool is already integrated into crawlers, and it can significantly improve your scraper
 * performance with just 2 lines of code.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new Apify.CheerioCrawler({
 *     useSessionPool: true,
 *     persistCookiesPerSession: true,
 *     // ...
 * })
 * ```
 *
 * You can configure the pool with many options. See the {@link SessionPoolOptions}.
 * Session pool is by default persisted in default {@link KeyValueStore}.
 * If you want to have one pool for all runs you have to specify
 * {@link SessionPoolOptions.persistStateKeyValueStoreId}.
 *
 * **Advanced usage:**
 *
 * ```javascript
 * const sessionPool = await Apify.openSessionPool({
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
 * @hideconstructor
 */
export class SessionPool extends EventEmitter {
    /**
     * Session pool configuration.
     * @param {SessionPoolOptions} [options] All `SessionPool` configuration options.
     */
    constructor(options = {}) {
        const {
            maxPoolSize = 1000,

            persistStateKeyValueStoreId = null,
            persistStateKey = 'SDK_SESSION_POOL_STATE',

            createSessionFunction = null,
            sessionOptions = {},

            log = defaultLog,
        } = options;

        super();

        // Validation
        checkParamOrThrow(maxPoolSize, 'options.maxPoolSize', 'Number');
        checkParamOrThrow(sessionOptions, 'options.sessionOptions', 'Object');
        checkParamOrThrow(persistStateKeyValueStoreId, 'options.persistStateKeyValueStoreId', 'Maybe String');
        checkParamOrThrow(persistStateKey, 'options.persistStateKey', 'String');
        checkParamOrThrow(createSessionFunction, 'options.createSessionFunction', 'Maybe Function');

        this.log = log.child({ prefix: 'SessionPool' });

        // Pool Configuration
        this.maxPoolSize = maxPoolSize;
        this.createSessionFunction = createSessionFunction || this._defaultCreateSessionFunction;

        // Session configuration
        this.sessionOptions = {
            ...sessionOptions,
            // the log needs to propagate to createSessionFunction as in "new Session({ ...sessionPool.sessionOptions })"
            // and can't go inside _defaultCreateSessionFunction
            log: this.log,
        };

        // Session keyValueStore
        this.persistStateKeyValueStoreId = persistStateKeyValueStoreId;
        this.persistStateKey = persistStateKey;

        // Operative states
        this.keyValueStore = null;
        this.sessions = [];
    }

    /**
     * Gets count of usable sessions in the pool.
     * @return {number}
     */
    get usableSessionsCount() {
        return this.sessions.filter(session => session.isUsable()).length;
    }

    /**
     * Gets count of retired sessions in the pool.
     * @return {number}
     */
    get retiredSessionsCount() {
        return this.sessions.filter(session => !session.isUsable()).length;
    }

    /**
     * Starts periodic state persistence and potentially loads SessionPool state from {@link KeyValueStore}.
     * It is called automatically by the {@link Apify.openSessionPool} function.
     *
     * @return {Promise<void>}
     */
    async initialize() {
        this.keyValueStore = await openKeyValueStore(this.persistStateKeyValueStoreId);

        // in case of migration happened and SessionPool state should be restored from the keyValueStore.
        await this._maybeLoadSessionPool();

        this._listener = this.persistState.bind(this);

        events.on(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, this._listener);
    }

    /**
     * Gets session.
     * If there is space for new session, it creates and return new session.
     * If the session pool is full, it picks a session from the pool,
     * If the picked session is usable it is returned, otherwise it creates and returns a new one.
     *
     * @return {Promise<Session>}
     */
    async getSession() {
        if (this._hasSpaceForSession()) {
            return this._createSession();
        }

        const pickedSession = this._pickSession();

        if (pickedSession.isUsable()) {
            return pickedSession;
        }

        this._removeSession(pickedSession);
        return this._createSession();
    }

    /**
     * Returns an object representing the internal state of the `SessionPool` instance.
     * Note that the object's fields can change in future releases.
     */
    getState() {
        return {
            usableSessionsCount: this.usableSessionsCount,
            retiredSessionsCount: this.retiredSessionsCount,
            sessions: this.sessions.map(session => session.getState()),
        };
    }

    /**
     * Persists the current state of the `SessionPool` into the default {@link KeyValueStore}.
     * The state is persisted automatically in regular intervals.
     *
     * @return {Promise<void>}
     */
    async persistState() {
        this.log.debug('Persisting state',
            {
                persistStateKeyValueStoreId: this.persistStateKeyValueStoreId,
                persistStateKey: this.persistStateKey,
            });
        await this.keyValueStore.setValue(this.persistStateKey, this.getState());
    }

    /**
     * Removes listener from `persistState` event.
     * This function should be called after you are done with using the `SessionPool` instance.
     */
    async teardown() {
        events.removeListener(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, this._listener);
        await this.persistState();
    }

    /**
     * Removes `Session` instance from `SessionPool`.
     * @param {Session} session  - Session to be removed
     * @private
     */
    _removeSession(session) {
        const sessionIndex = this.sessions.findIndex(storedSession => storedSession.id === session.id);

        const [removedSession] = this.sessions.splice(sessionIndex, 1);
        this.log.debug(`Removed Session - ${removedSession.id}`);
    }

    /**
     * Adds `Session` instance to `SessionPool`.
     * @param {Session} newSession `Session` instance to be added.
     * @private
     */
    _addSession(newSession) {
        this.sessions.push(newSession);
    }

    /**
     * Gets random index.
     * @return {number}
     * @private
     */
    _getRandomIndex() {
        return Math.floor(Math.random() * this.sessions.length);
    }

    /**
     * Creates new session without any extra behavior.
     * @param {SessionPool} sessionPool
     * @return {Session} - New session.
     * @private
     */
    _defaultCreateSessionFunction(sessionPool) {
        return new Session({
            ...this.sessionOptions,
            sessionPool,
        });
    }

    /**
     * Creates new session and adds it to the pool.
     * @return {Promise<Session>} - Newly created `Session` instance.
     * @private
     */
    async _createSession() {
        const newSession = await this.createSessionFunction(this);
        this._addSession(newSession);

        this.log.debug(`Created new Session - ${newSession.id}`);

        return newSession;
    }

    /**
     * Decides whether there is enough space for creating new session.
     * @return {boolean}
     * @private
     */
    _hasSpaceForSession() {
        return this.sessions.length < this.maxPoolSize;
    }

    /**
     * Picks random session from the `SessionPool`.
     * @return {Session} - Picked `Session`
     * @private
     */
    _pickSession() {
        return this.sessions[this._getRandomIndex()]; // Or maybe we should let the developer to customize the picking algorithm
    }

    /**
     * Potentially loads `SessionPool`.
     * If the state was persisted it loads the `SessionPool` from the persisted state.
     * @return {Promise<void>}
     * @private
     */
    async _maybeLoadSessionPool() {
        const loadedSessionPool = await this.keyValueStore.getValue(this.persistStateKey);

        if (!loadedSessionPool) return;
        // Invalidate old sessions and load active sessions only
        this.log.debug('Recreating state from KeyValueStore',
            {
                persistStateKeyValueStoreId: this.persistStateKeyValueStoreId,
                persistStateKey: this.persistStateKey,
            });
        for (const sessionObject of loadedSessionPool.sessions) {
            sessionObject.sessionPool = this;
            sessionObject.createdAt = new Date(sessionObject.createdAt);
            sessionObject.expiresAt = new Date(sessionObject.expiresAt);
            const recreatedSession = new Session(sessionObject);

            if (recreatedSession.isUsable()) {
                this._addSession(recreatedSession);
            }
        }

        this.log.debug(`${this.usableSessionsCount} active sessions loaded from KeyValueStore`);
    }
}

/**
 * Opens a SessionPool and returns a promise resolving to an instance
 * of the {@link SessionPool} class that is already initialized.
 *
 * For more details and code examples, see the {@link SessionPool} class.
 *
 * @param {SessionPoolOptions} sessionPoolOptions
 * @return {Promise<SessionPool>}
 * @memberof module:Apify
 * @name openSessionPool
 * @function
 */
export const openSessionPool = async (sessionPoolOptions) => {
    const sessionPool = new SessionPool(sessionPoolOptions);
    await sessionPool.initialize();
    return sessionPool;
};
