import EventEmitter from 'events';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';

import moment from 'moment';
import { openKeyValueStore } from '../key_value_store';
import { Session } from './session';
import events from '../events';
import { ACTOR_EVENT_NAMES_EX } from '../constants';


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
 *     maxSessionAgeSecs: 10,
 *     maxSessionAgeSecs: 10,
 *     maxSessionUsageCount: 150, // for example when you know that the site blocks after 150 requests.
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
 * const session1 = await sessionPool.retrieveSession();
 * const session2 = await sessionPool.retrieveSession();
 * const session3 = await sessionPool.retrieveSession();
 *
 * // Now you can mark the session either failed of successful
 *
 * // Fails session -> it increases error count (soft retire)
 * session1.fail()
 *
 * // Marks as successful.
 * session2.reclaim()
 *
 * // Retires session -> session is removed from the pool
 * session3.retire()
 *
 * ```
 */
export class SessionPool extends EventEmitter {
    /**
     * Session pool configuration.
     * @param options
     * @param options.maxPoolSize {Number} - Maximum size of the pool.
     * Indicates how many sessions are rotated.
     * @param options.maxSessionAgeSecs {Number} - Number of seconds after which the session is considered as expired.
     * @param options.maxSessionUsageCount {Number} - Maximum number of uses per session.
     * It useful, when you know the site rate-limits, so you can retire the session before it gets blocked and let it cool down.
     * @param options.persistStateKeyValueStoreId {String} - Name or Id of `KeyValueStore` where is the `SessionPool` state stored.
     * @param options.persistStateKey {String} - Session pool persists it's state under this key in Key value store.
     * @param options.createSessionFunction {function} - Custom function that should return `Session` instance.
     */
    constructor(options = {}) {
        const {
            maxPoolSize = 1000,
            maxSessionAgeSecs = 3000,
            maxSessionUsageCount = 50,

            persistStateKeyValueStoreId = null,
            persistStateKey = 'SESSION_POOL_STATE',

            createSessionFunction = null,

        } = options;

        super();

        // Validation
        checkParamOrThrow(maxPoolSize, 'options.maxPoolSize', 'Maybe Number');
        checkParamOrThrow(maxSessionAgeSecs, 'options.maxSessionAgeSecs', 'Maybe Number');
        checkParamOrThrow(maxSessionUsageCount, 'options.maxSessionUsageCount', 'Maybe Number');
        checkParamOrThrow(persistStateKeyValueStoreId, 'options.persistStateKeyValueStoreId', 'Maybe String');
        checkParamOrThrow(persistStateKey, 'options.persistStateKey', 'Maybe String');
        checkParamOrThrow(createSessionFunction, 'options.createSessionFunction', 'Maybe Function');

        // Pool Configuration
        this.maxPoolSize = maxPoolSize;
        this.createSessionFunction = createSessionFunction || this._defaultCreateSessionFunction;

        // Session configuration
        // @TODO: Maybe options.sessionOptions / this.sessionOptions?
        this.maxSessionAgeSecs = maxSessionAgeSecs;
        this.maxSessionUsageCount = maxSessionUsageCount;

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
     * Gets count of blocked sessions in the pool.
     * @return {number}
     */
    get retiredSessionsCount() {
        return this.sessions.filter(session => !session.isUsable()).length;
    }

    /**
     * Starts periodic state persistence and potentially loads SessionPool state from {@link KeyValueStore}.
     * This function must be called before you can start using the instance in a meaningful way.
     *
     * @return {Promise<void>}
     */
    async initialize() {
        this.keyValueStore = await openKeyValueStore(this.persistStateKeyValueStoreId);

        // in case of migration happened and SessionPool state should be restored from the keyValueStore.
        await this._maybeLoadSessionPool();

        events.on(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, this.persistState.bind(this));
    }

    /**
     * Gets session.
     * If there is space for new session, it creates and return new session.
     * If the session pool is full, it picks a session from the pool,
     * If the picked session is usable it is returned, otherwise it creates and returns a new one.
     *
     * @return {Promise<Session>}
     */
    async retrieveSession() {
        // If we have enough space for session. Return newly created session.
        if (this._hasSpaceForSession()) {
            return this._createSession();
        }

        // For example that developer can plug different picking algorithms such as the Lukášův
        // Maybe a should have pickSession function to be customizable.
        const pickedSession = this._pickSession();

        // If session can be used return the session
        if (pickedSession.isUsable()) {
            return pickedSession;
        }

        //  otherwise remove old session and return newly created session
        this._removeSession(pickedSession);
        return this._createSession();
    }

    /**
     * Returns an object representing the internal state of the `SessionPool` instance.
     * Note that the object's fields can change in future releases.
     *
     * @returns {Object}
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
     * @return {Promise}
     */
    async persistState() {
        log.debug('SessionPool: Persisting state');
        log.debug(`SessionPool: persistStateKeyValueStoreId: ${this.persistStateKeyValueStoreId}, persistStateKey: ${this.persistStateKey} `);
        return this.keyValueStore.setValue(this.persistStateKey, this.getState());
    }

    /**
     * Removes `Session` instance from `SessionPool`.
     * @param session {Session} - Session to be removed
     * @private
     */
    _removeSession(session) {
        const sessionIndex = this.sessions.findIndex(storedSession => storedSession.id === session.id);

        const removedSession = this.sessions.splice(sessionIndex, 1);
        log.debug(`SessionPool: Removed Session - ${removedSession.id}`);
    }

    /**
     * Adds `Session` instance to `SessionPool`.
     * @param newSession {Session} - `Session` instance to be added.
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
     * @return {Session} - New session.
     * @private
     */
    _defaultCreateSessionFunction() {
        return new Session({
            maxSessionAgeSecs: this.maxSessionAgeSecs,
            maxSessionUsageCount: this.maxSessionUsageCount,
            sessionPool: this,
        });
    }

    /**
     * Creates new session and adds it to the pool.
     * @return {Promise<Session>} - Newly created `Session` instance.
     * @private
     */
    async _createSession() {
        const newSession = await this.createSessionFunction();
        this._addSession(newSession);

        log.debug(`SessionPool: Created new Session - ${newSession.id}`);

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
        log.debug('SessionPool: Recreating state from KeyValueStore');
        log.debug(`SessionPool: persistStateKeyValueStoreId: ${this.persistStateKeyValueStoreId}, persistStateKey: ${this.persistStateKey} `);

        for (const sessionObject of loadedSessionPool.sessions) {
            sessionObject.sessionPool = this;
            sessionObject.createdAt = moment(sessionObject.createdAt);
            sessionObject.expiresAt = moment(sessionObject.expiresAt);
            const recreatedSession = new Session(sessionObject);

            if (recreatedSession.isUsable()) {
                this._addSession(recreatedSession);
            }
        }

        log.debug(`SessionPool: Loaded ${this.sessions.length} Sessions from KeyValueStore`);
        log.debug(`SessionPool: Active sessions ${this.activeSessionsCount} Sessions from KeyValueStore`);
    }
}
