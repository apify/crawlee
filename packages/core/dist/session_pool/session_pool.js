"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionPool = void 0;
const tslib_1 = require("tslib");
const node_events_1 = require("node:events");
const ow_1 = tslib_1.__importDefault(require("ow"));
const configuration_1 = require("../configuration");
const log_1 = require("../log");
const key_value_store_1 = require("../storages/key_value_store");
const session_1 = require("./session");
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
class SessionPool extends node_events_1.EventEmitter {
    /**
     * @internal
     */
    constructor(options = {}, config = configuration_1.Configuration.getGlobalConfig()) {
        super();
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        Object.defineProperty(this, "log", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxPoolSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "createSessionFunction", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "keyValueStore", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sessions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "sessionMap", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "sessionOptions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "persistStateKeyValueStoreId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "persistStateKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_listener", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "events", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "blockedStatusCodes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        (0, ow_1.default)(options, ow_1.default.object.exactShape({
            maxPoolSize: ow_1.default.optional.number,
            persistStateKeyValueStoreId: ow_1.default.optional.string,
            persistStateKey: ow_1.default.optional.string,
            createSessionFunction: ow_1.default.optional.function,
            sessionOptions: ow_1.default.optional.object,
            blockedStatusCodes: ow_1.default.optional.array.ofType(ow_1.default.number),
            log: ow_1.default.optional.object,
        }));
        const { maxPoolSize = 1000, persistStateKeyValueStoreId, persistStateKey = 'SDK_SESSION_POOL_STATE', createSessionFunction, sessionOptions = {}, blockedStatusCodes = [401, 403, 429], log = log_1.log, } = options;
        this.config = config;
        this.blockedStatusCodes = blockedStatusCodes;
        this.events = config.getEventManager();
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
    }
    /**
     * Gets count of usable sessions in the pool.
     */
    get usableSessionsCount() {
        return this.sessions.filter((session) => session.isUsable()).length;
    }
    /**
     * Gets count of retired sessions in the pool.
     */
    get retiredSessionsCount() {
        return this.sessions.filter((session) => !session.isUsable()).length;
    }
    /**
     * Starts periodic state persistence and potentially loads SessionPool state from {@apilink KeyValueStore}.
     * It is called automatically by the {@apilink SessionPool.open} function.
     */
    async initialize() {
        this.keyValueStore = await key_value_store_1.KeyValueStore.open(this.persistStateKeyValueStoreId, { config: this.config });
        if (!this.persistStateKeyValueStoreId) {
            // eslint-disable-next-line max-len
            this.log.debug(`No 'persistStateKeyValueStoreId' options specified, this session pool's data has been saved in the KeyValueStore with the id: ${this.keyValueStore.id}`);
        }
        // in case of migration happened and SessionPool state should be restored from the keyValueStore.
        await this._maybeLoadSessionPool();
        this._listener = this.persistState.bind(this);
        this.events.on("persistState" /* EventType.PERSIST_STATE */, this._listener);
    }
    /**
     * Adds a new session to the session pool. The pool automatically creates sessions up to the maximum size of the pool,
     * but this allows you to add more sessions once the max pool size is reached.
     * This also allows you to add session with overridden session options (e.g. with specific session id).
     * @param [options] The configuration options for the session being added to the session pool.
     */
    async addSession(options = {}) {
        this._throwIfNotInitialized();
        const { id } = options;
        if (id) {
            const sessionExists = this.sessionMap.has(id);
            if (sessionExists) {
                throw new Error(`Cannot add session with id '${id}' as it already exists in the pool`);
            }
        }
        if (!this._hasSpaceForSession()) {
            this._removeRetiredSessions();
        }
        const newSession = options instanceof session_1.Session
            ? options
            : await this.createSessionFunction(this, { sessionOptions: options });
        this.log.debug(`Adding new Session - ${newSession.id}`);
        this._addSession(newSession);
    }
    /**
     * Gets session.
     * If there is space for new session, it creates and returns new session.
     * If the session pool is full, it picks a session from the pool,
     * If the picked session is usable it is returned, otherwise it creates and returns a new one.
     * @param [sessionId] If provided, it returns the usable session with this id, `undefined` otherwise.
     */
    async getSession(sessionId) {
        this._throwIfNotInitialized();
        if (sessionId) {
            const session = this.sessionMap.get(sessionId);
            if (session && session.isUsable())
                return session;
            return undefined;
        }
        if (this._hasSpaceForSession()) {
            return this._createSession();
        }
        const pickedSession = this._pickSession();
        if (pickedSession.isUsable()) {
            return pickedSession;
        }
        this._removeRetiredSessions();
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
            sessions: this.sessions.map((session) => session.getState()),
        };
    }
    /**
     * Persists the current state of the `SessionPool` into the default {@apilink KeyValueStore}.
     * The state is persisted automatically in regular intervals.
     */
    async persistState() {
        this.log.debug('Persisting state', {
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
        this.events.off("persistState" /* EventType.PERSIST_STATE */, this._listener);
        await this.persistState();
    }
    /**
     * SessionPool should not work before initialization.
     */
    _throwIfNotInitialized() {
        if (!this._listener)
            throw new Error('SessionPool is not initialized.');
    }
    /**
     * Removes retired `Session` instances from `SessionPool`.
     */
    _removeRetiredSessions() {
        this.sessions = this.sessions.filter((storedSession) => {
            if (storedSession.isUsable())
                return true;
            this.sessionMap.delete(storedSession.id);
            this.log.debug(`Removed Session - ${storedSession.id}`);
            return false;
        });
    }
    /**
     * Adds `Session` instance to `SessionPool`.
     * @param newSession `Session` instance to be added.
     */
    _addSession(newSession) {
        this.sessions.push(newSession);
        this.sessionMap.set(newSession.id, newSession);
    }
    /**
     * Gets random index.
     */
    _getRandomIndex() {
        return Math.floor(Math.random() * this.sessions.length);
    }
    /**
     * Creates new session without any extra behavior.
     * @param sessionPool
     * @param [options]
     * @param [options.sessionOptions] The configuration options for the session being created.
     * @returns New session.
     */
    _defaultCreateSessionFunction(sessionPool, options = {}) {
        (0, ow_1.default)(options, ow_1.default.object.exactShape({ sessionOptions: ow_1.default.optional.object }));
        const { sessionOptions = {} } = options;
        return new session_1.Session({
            ...this.sessionOptions,
            ...sessionOptions,
            sessionPool,
        });
    }
    /**
     * Creates new session and adds it to the pool.
     * @returns Newly created `Session` instance.
     */
    async _createSession() {
        const newSession = await this.createSessionFunction(this);
        this._addSession(newSession);
        this.log.debug(`Created new Session - ${newSession.id}`);
        return newSession;
    }
    /**
     * Decides whether there is enough space for creating new session.
     */
    _hasSpaceForSession() {
        return this.sessions.length < this.maxPoolSize;
    }
    /**
     * Picks random session from the `SessionPool`.
     * @returns Picked `Session`.
     */
    _pickSession() {
        return this.sessions[this._getRandomIndex()]; // Or maybe we should let the developer to customize the picking algorithm
    }
    /**
     * Potentially loads `SessionPool`.
     * If the state was persisted it loads the `SessionPool` from the persisted state.
     */
    async _maybeLoadSessionPool() {
        const loadedSessionPool = await this.keyValueStore.getValue(this.persistStateKey);
        if (!loadedSessionPool)
            return;
        // Invalidate old sessions and load active sessions only
        this.log.debug('Recreating state from KeyValueStore', {
            persistStateKeyValueStoreId: this.persistStateKeyValueStoreId,
            persistStateKey: this.persistStateKey,
        });
        for (const sessionObject of loadedSessionPool.sessions) {
            sessionObject.sessionPool = this;
            sessionObject.createdAt = new Date(sessionObject.createdAt);
            sessionObject.expiresAt = new Date(sessionObject.expiresAt);
            const recreatedSession = new session_1.Session(sessionObject);
            if (recreatedSession.isUsable()) {
                this._addSession(recreatedSession);
            }
        }
        this.log.debug(`${this.usableSessionsCount} active sessions loaded from KeyValueStore`);
    }
    /**
     * Opens a SessionPool and returns a promise resolving to an instance
     * of the {@apilink SessionPool} class that is already initialized.
     *
     * For more details and code examples, see the {@apilink SessionPool} class.
     */
    static async open(options) {
        const sessionPool = new SessionPool(options);
        await sessionPool.initialize();
        return sessionPool;
    }
}
exports.SessionPool = SessionPool;
//# sourceMappingURL=session_pool.js.map