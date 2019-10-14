import EventEmitter from 'events';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';

import { openKeyValueStore } from '../key_value_store';
import Session from './session';
import events from '../events';
import { ACTOR_EVENT_NAMES_EX } from '../constants';


/**
 * Handles the sessions rotation, creation and persistence.
 * Creates a pool of `Session` instances, that are randomly rotated.
 * When some `Session` is marked as blocked. It is removed and new one is created instead.
 *
 */

// TODO: We should probably add some debug loging
// TODO: Validation
// TODO: Class docs will be filled once the integration is done.
export default class SessionPool extends EventEmitter {
    /**
     *
     * @param options
     * @param options.maxPoolSize {Number} - Maximum size of the pool
     * @param options.maxSessionAgeSecs {Number}
     * @param options.maxSessionReuseCount {Number}
     * @param options.persistStateKeyValueStoreId {String}
     */
    constructor(options = {}) {
        const {
            maxPoolSize = 1000,
            maxSessionAgeSecs = 3000,
            maxSessionReuseCount = 50,

            persistStateKeyValueStoreId = null,
            persistStateKey = 'SESSION_POOL_STATE',

            createSessionFunction = null,

        } = options;

        super();

        // Validation
        checkParamOrThrow(maxPoolSize, 'options.maxPoolSize', 'Maybe Number');
        checkParamOrThrow(maxSessionAgeSecs, 'options.maxSessionAgeSecs', 'Maybe Number');
        checkParamOrThrow(maxSessionReuseCount, 'options.maxSessionReuseCount', 'Maybe Number');
        checkParamOrThrow(persistStateKeyValueStoreId, 'options.persistStateKeyValueStoreId', 'Maybe String');
        checkParamOrThrow(persistStateKey, 'options.persistStateKey', 'Maybe String');
        checkParamOrThrow(createSessionFunction, 'options.createSessionFunction', 'Maybe Function');

        // Pool Configuration
        this.maxPoolSize = maxPoolSize;
        this.createSessionFunction = createSessionFunction || this._defaultCreateSessionFunction;

        // Session configuration
        // @TODO: Maybe options.sessionOptions / this.sessionOptions?
        this.maxSessionAgeSecs = maxSessionAgeSecs;
        this.maxSessionReuseCount = maxSessionReuseCount;

        // Session keyValueStore
        this.persistStateKeyValueStoreId = persistStateKeyValueStoreId;
        this.persistStateKey = persistStateKey;

        // Operative states
        this.keyValueStore = null;
        this.sessions = [];

        // Maybe we can add onSessionRetired function to configuration ?
    }

    /**
     * Gets number of active sessions in the pool.
     * @return {number}
     */
    get activeSessionsCount() {
        return this.sessions.filter(session => session.isUsable()).length;
    }

    /**
     * Gets number of blocked sessions in the pool.
     * @return {number}
     */
    get blockedSessionsCount() {
        return this.sessions.filter(session => !session.isUsable()).length;
    }

    /**
     * Starts periodic state persistence and potentially loads SessionPool state from {@link KeyValueStore}.`
     * This function must be called before you can start using the instance in a meaningful way.
     *
     * @return {Promise<void>}
     */
    async initialize() {
        this.keyValueStore = await openKeyValueStore(this.persistStateKeyValueStoreId);

        // in case of migration happened and SessionPool state should be restored from the keyValueStore.
        await this._maybeRecreateSessionPool();

        events.on(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, this.persistState.bind(this));
    }

    /**
     * Gets `Session`.
     * If there is space for new `Session`, it creates and return new `Session`.
     * If the `SessionPool` is full, it picks a `Session` from the pool,
     * If the picked `Session` is usable it is returned, otherwise it creates and returns a new `Session`.
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
     * Gets SessionPool statistics.
     * These function could be use in the statistics logging in actor run to know how much is the website blocking
     *
     * @return {{blockedSessionsCount: number, activeSessionsCount: number}}
     */
    getStats() {
        return {
            activeSessionsCount: this.activeSessionsCount,
            blockedSessionsCount: this.blockedSessionsCount,
        };
    }

    /**
     * Returns an object representing the internal state of the `SessionPool` instance.
     * Note that the object's fields can change in future releases.
     *
     * @returns {Object}
     */
    getState() {
        return {
            ...this.getStats(),
            sessions: this.sessions.map(session => session.getState()),
        };
    }

    /**
     * Persists the current state of the `SessionPool` into the default {@link KeyValueStore}.
     * The state is persisted automatically in regular intervals, but calling this method manually
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
     * Creates new `Session` without any extra behavior.
     * @return {Session} - New session.
     * @private
     */
    _defaultCreateSessionFunction() {
        return new Session({
            maxSessionAgeSecs: this.maxSessionAgeSecs,
            maxSessionReuseCount: this.maxSessionReuseCount,
            sessionPool: this,
        });
    }

    /**
     * Creates new `Session` and adds it to the pool.
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
     * Decides whether there is enough space for creating new `Session`.
     * @return {boolean}
     * @private
     */
    _hasSpaceForSession() {
        return this.sessions.length < this.maxPoolSize;
    }

    /**
     * Picks random `Session` from the `SessionPool`.
     * @return {Session} - Picked `Session`
     * @private
     */
    _pickSession() {
        return this.sessions[this._getRandomIndex()]; // Or maybe we should let the developer to customize the picking algorithm
    }

    /**
     * Potentially recreates `SessionPool`.
     * If the state was persisted it recreates the `SessionPool` from the persisted state.
     * @return {Promise<void>}
     * @private
     */
    async _maybeRecreateSessionPool() {
        const loadedSessionPool = await this.keyValueStore.getValue(this.persistStateKey);

        if (!loadedSessionPool) return;
        // Invalidate old sessions and load active sessions only
        log.debug('SessionPool: Recreating state from KeyValueStore');
        log.debug(`SessionPool: persistStateKeyValueStoreId: ${this.persistStateKeyValueStoreId}, persistStateKey: ${this.persistStateKey} `);

        for (const sessionObject of loadedSessionPool.sessions) {
            sessionObject.sessionPool = this;
            const recreatedSession = new Session(sessionObject);

            if (recreatedSession.isUsable()) {
                this._addSession(recreatedSession);
            }
        }

        log.debug(`SessionPool: Loaded ${this.sessions.length} Sessions from KeyValueStore`);
        log.debug(`SessionPool: Active sessions ${this.activeSessionsCount} Sessions from KeyValueStore`);
    }
}
