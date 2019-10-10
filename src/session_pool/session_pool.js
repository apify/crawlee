import EventEmitter from 'events';
import { openKeyValueStore } from '../key_value_store';
import Session from './session';
import events from '../events';
import { ACTOR_EVENT_NAMES_EX } from '../constants';


/**
 * Handles the session rotation, creation and persistence.
 *
 */

// TODO: We should probably add some debug loging
// TODO: Validation
export default class SessionPool extends EventEmitter {
    /**
     *
     * @param [options]
     * @param options.initialPoolSize {Number}
     * @param options.maxPoolSize {Number}
     * @param options.maxSessionAgeSecs {Number}
     * @param options.maxSessionReuseCount {Number}
     * @param options.persistStateKeyValueStoreId {String}
     */
    constructor({
        maxPoolSize = 1000,
        maxSessionAgeSecs = 3000,
        maxSessionReuseCount = 50,

        persistStateKeyValueStoreId = null,
        persistStateKey = 'SESSION_POOL_STATE',

        createSessionFunction = null,

    }) {
        super();

        // Pool Configuration
        this.maxPoolSize = maxPoolSize;
        this.createSessionFunction = createSessionFunction || this._defaultCreateSessionFunction;

        // Session configuration
        // @TODO: Maybe options.sessionOptions / this.sessionOptions?
        this.maxSessionAgeSecs = maxSessionAgeSecs;
        this.maxSessionReuseCount = maxSessionReuseCount;

        // Session storage
        this.persistStateKeyValueStoreId = persistStateKeyValueStoreId;
        this.persistStateKey = persistStateKey;

        // Statistics
        this.activeSessions = 0;
        this.blockedSessions = 0;

        // Operative states
        this.storage = null;
        this.sessions = [];

        // Maybe we can add onSessionRetired function to configuration ?
    }


    async initialize() {
        this.storage = await openKeyValueStore(this.persistStateKeyValueStoreId);

        // Load sessions from storage
        const loadedSessions = this.storage.getValue(this.persistStateKey) || [];

        // Invalidate old sessions and load active sessions only
        for (const [sessionName, sessionObject] of Object.entries(loadedSessions)) {
            const session = new Session(sessionObject);

            if (session.isUsable()) {
                this.sessions[sessionName] = session;
            }
        }

        events.on(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, this.persistState.bind(this));
    }

    async retrieveSession() {
        // If we have enough space for session. Return newly created session.
        if (this._isSpaceForSession()) {
            return this._makeSession();
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
        this._makeSession();
    }

    getStats() {
        return {
            activeSessions: this.activeSessions,
            blockedSessions: this.blockedSessions,
        };
    }

    getState() {
        return {
            ...this.getStats(),
            sessions: this.sessions.map(session => session.getState()),
        };
    }

    async persistState() {
        return this.storage.setValue(this.persistStateKey, this.getState());
    }

    _removeSession(session) {
        const sessionIndex = this.sessions.findIndex(storedSession => storedSession.id === session.id);

        this.sessions.splice(sessionIndex, 1);
    }

    _addSession(newSession) {
        this.sessions.push(newSession);
    }

    _getRandomIndex() {
        return Math.floor(Math.random() * this.sessions.length);
    }

    _defaultCreateSessionFunction(sessionPool) {
        return new Session({
            maxSessionAgeSecs: this.maxSessionAgeSecs,
            maxSessionReuseCount: this.maxSessionReuseCount,
            sessionPool,
        });
    }

    async _makeSession() {
        const newSession = await this.createSessionFunction();
        this._addSession(newSession);
    }

    _isSpaceForSession() {
        return this.sessions.length < this.maxPoolSize;
    }

    _pickSession() {
        return this.sessions[this._getRandomIndex()]; // Or maybe we should let the developer to customize the picking algorithm
    }
}
