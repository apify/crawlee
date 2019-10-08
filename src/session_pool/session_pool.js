import EventEmitter from 'events';
import _ from 'underscore';
import { openKeyValueStore } from '../key_value_store';
import Session from './session';

export const SESSION_POOL_DEFAULTS = {
    maxPoolSize: 1000,
    maxSessionAgeSecs: 3000,
    maxSessionReuseCount: 50,

    persistStateKeyValueStoreId: null,
    persistStateKey: 'SESSION_POOL_STATE',

    createSessionFunction: null,

};

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
    constructor(options) {
        super();

        const opts = _.defaults({}, options, SESSION_POOL_DEFAULTS);

        // Pool Configuration
        this.maxPoolSize = opts.maxPoolSize;
        this.createSessionFunction = opts.createSessionFunction || this._createSessionFunction;

        // Session configuration
        // @TODO: Maybe options.sessionOptions / this.sessionOptions?
        this.maxSessionAgeSecs = opts.maxSessionAgeSecs;
        this.maxSessionReuseCount = opts.maxSessionReuseCount;

        // Session storage
        this.persistStateKeyValueStoreId = opts.persistStateKeyValueStoreId;
        this.persistStateKey = opts.persistStateKey;

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
            const session = Session.recreateSession(sessionObject);
            const isValid = !session.isExpired() || !session.isBlocked() || session.usedCount >= session.maxReuseCount;

            if (isValid) {
                this.sessions[sessionName] = session;
            }
        }
    }

    async retrieveSession() {
        // If we have enough space for session. Return newly created session.
        if (this.sessions.length < this.maxPoolSize) {
            const newSession = await this.createSessionFunction(this);
            this._addSession(newSession);
            return newSession;
        }


        // For example that developer can plug different picking algorithms such as the Lukášův
        // Maybe a should have pickSession function to be customizable.
        const pickedSession = this.sessions[this._getRandomIndex()];

        // If session can be used return the session
        if (pickedSession.isUsable()) {
            return pickedSession;
        }

        //  otherwise remove old session and return newly created session
        this._removeSession(pickedSession);

        const newSession = this.createSessionFunction(this);
        this._addSession(newSession);
        return newSession;
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
        const sessionIndex = this.sessions.findIndex(storedSession => storedSession.name === session.name);

        this.sessions.splice(sessionIndex, 1);
    }

    _addSession(newSession) {
        this.sessions.push(newSession);
    }

    _getRandomIndex() {
        return Math.floor(Math.random() * this.sessions.length);
    }

    _createSessionFunction(sessionPool) {
        return new Session({
            maxSessionAgeSecs: this.maxSessionAgeSecs,
            maxSessionReuseCount: this.maxSessionReuseCount,
            sessionPool,

        });
    }
}
