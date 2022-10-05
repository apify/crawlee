import type { Log } from '@apify/log';
import { EventEmitter } from 'node:events';
import type { Dictionary } from '@crawlee/types';
import ow from 'ow';
import { Configuration } from '../configuration';
import { log as defaultLog } from '../log';
import { KeyValueStore } from '../storages/key_value_store';
import type { SessionOptions } from './session';
import { Session } from './session';
import type { EventManager } from '../events/event_manager';
import { EventType } from '../events/event_manager';

/**
 * Factory user-function which creates customized {@apilink Session} instances.
 */
export interface CreateSession {
    /**
     * @param sessionPool Pool requesting the new session.
     * @param options
     */
    (sessionPool: SessionPool, options?: { sessionOptions?: SessionOptions }): Session | Promise<Session>;
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
export class SessionPool extends EventEmitter {
    protected log: Log;
    protected maxPoolSize: number;
    protected createSessionFunction: CreateSession;
    protected keyValueStore!: KeyValueStore;
    protected sessions: Session[] = [];
    protected sessionMap = new Map<string, Session>();
    protected sessionOptions: SessionOptions;
    protected persistStateKeyValueStoreId?: string;
    protected persistStateKey: string;
    protected _listener!: () => Promise<void>;
    protected events: EventManager;
    protected readonly blockedStatusCodes: number[];

    /**
     * @internal
     */
    constructor(options: SessionPoolOptions = {}, readonly config = Configuration.getGlobalConfig()) {
        super();

        ow(options, ow.object.exactShape({
            maxPoolSize: ow.optional.number,
            persistStateKeyValueStoreId: ow.optional.string,
            persistStateKey: ow.optional.string,
            createSessionFunction: ow.optional.function,
            sessionOptions: ow.optional.object,
            blockedStatusCodes: ow.optional.array.ofType(ow.number),
            log: ow.optional.object,
        }));

        const {
            maxPoolSize = 1000,
            persistStateKeyValueStoreId,
            persistStateKey = 'SDK_SESSION_POOL_STATE',
            createSessionFunction,
            sessionOptions = {},
            blockedStatusCodes = [401, 403, 429],
            log = defaultLog,
        } = options;

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
    get usableSessionsCount(): number {
        return this.sessions.filter((session) => session.isUsable()).length;
    }

    /**
     * Gets count of retired sessions in the pool.
     */
    get retiredSessionsCount(): number {
        return this.sessions.filter((session) => !session.isUsable()).length;
    }

    /**
     * Starts periodic state persistence and potentially loads SessionPool state from {@apilink KeyValueStore}.
     * It is called automatically by the {@apilink SessionPool.open} function.
     */
    async initialize(): Promise<void> {
        this.keyValueStore = await KeyValueStore.open(this.persistStateKeyValueStoreId, { config: this.config });

        if (!this.persistStateKeyValueStoreId) {
            // eslint-disable-next-line max-len
            this.log.debug(`No 'persistStateKeyValueStoreId' options specified, this session pool's data has been saved in the KeyValueStore with the id: ${this.keyValueStore.id}`);
        }

        // in case of migration happened and SessionPool state should be restored from the keyValueStore.
        await this._maybeLoadSessionPool();

        this._listener = this.persistState.bind(this);

        this.events.on(EventType.PERSIST_STATE, this._listener);
    }

    /**
     * Adds a new session to the session pool. The pool automatically creates sessions up to the maximum size of the pool,
     * but this allows you to add more sessions once the max pool size is reached.
     * This also allows you to add session with overridden session options (e.g. with specific session id).
     * @param [options] The configuration options for the session being added to the session pool.
     */
    async addSession(options: Session | SessionOptions = {}): Promise<void> {
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

        const newSession = options instanceof Session
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
     */
    async getSession(): Promise<Session>;

    /**
     * Gets session based on the provided session id or `undefined.
     */
    async getSession(sessionId: string): Promise<Session>;

    /**
     * Gets session.
     * If there is space for new session, it creates and returns new session.
     * If the session pool is full, it picks a session from the pool,
     * If the picked session is usable it is returned, otherwise it creates and returns a new one.
     * @param [sessionId] If provided, it returns the usable session with this id, `undefined` otherwise.
     */
    async getSession(sessionId?: string): Promise<Session | undefined> {
        this._throwIfNotInitialized();
        if (sessionId) {
            const session = this.sessionMap.get(sessionId);
            if (session && session.isUsable()) return session;
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
    async persistState(): Promise<void> {
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
    async teardown(): Promise<void> {
        this.events.off(EventType.PERSIST_STATE, this._listener);
        await this.persistState();
    }

    /**
     * SessionPool should not work before initialization.
     */
    protected _throwIfNotInitialized() {
        if (!this._listener) throw new Error('SessionPool is not initialized.');
    }

    /**
     * Removes retired `Session` instances from `SessionPool`.
     */
    protected _removeRetiredSessions() {
        this.sessions = this.sessions.filter((storedSession) => {
            if (storedSession.isUsable()) return true;

            this.sessionMap.delete(storedSession.id);
            this.log.debug(`Removed Session - ${storedSession.id}`);

            return false;
        });
    }

    /**
     * Adds `Session` instance to `SessionPool`.
     * @param newSession `Session` instance to be added.
     */
    protected _addSession(newSession: Session) {
        this.sessions.push(newSession);
        this.sessionMap.set(newSession.id, newSession);
    }

    /**
     * Gets random index.
     */
    protected _getRandomIndex(): number {
        return Math.floor(Math.random() * this.sessions.length);
    }

    /**
     * Creates new session without any extra behavior.
     * @param sessionPool
     * @param [options]
     * @param [options.sessionOptions] The configuration options for the session being created.
     * @returns New session.
     */
    protected _defaultCreateSessionFunction(sessionPool: SessionPool, options: { sessionOptions?: SessionOptions } = {}): Session {
        ow(options, ow.object.exactShape({ sessionOptions: ow.optional.object }));
        const { sessionOptions = {} } = options;
        return new Session({
            ...this.sessionOptions,
            ...sessionOptions,
            sessionPool,
        });
    }

    /**
     * Creates new session and adds it to the pool.
     * @returns Newly created `Session` instance.
     */
    protected async _createSession(): Promise<Session> {
        const newSession = await this.createSessionFunction(this);
        this._addSession(newSession);
        this.log.debug(`Created new Session - ${newSession.id}`);

        return newSession;
    }

    /**
     * Decides whether there is enough space for creating new session.
     */
    protected _hasSpaceForSession(): boolean {
        return this.sessions.length < this.maxPoolSize;
    }

    /**
     * Picks random session from the `SessionPool`.
     * @returns Picked `Session`.
     */
    protected _pickSession(): Session {
        return this.sessions[this._getRandomIndex()]; // Or maybe we should let the developer to customize the picking algorithm
    }

    /**
     * Potentially loads `SessionPool`.
     * If the state was persisted it loads the `SessionPool` from the persisted state.
     */
    protected async _maybeLoadSessionPool(): Promise<void> {
        const loadedSessionPool = await this.keyValueStore.getValue<{ sessions: Dictionary[] }>(this.persistStateKey);

        if (!loadedSessionPool) return;

        // Invalidate old sessions and load active sessions only
        this.log.debug('Recreating state from KeyValueStore', {
            persistStateKeyValueStoreId: this.persistStateKeyValueStoreId,
            persistStateKey: this.persistStateKey,
        });

        for (const sessionObject of loadedSessionPool.sessions) {
            sessionObject.sessionPool = this;
            sessionObject.createdAt = new Date(sessionObject.createdAt as string);
            sessionObject.expiresAt = new Date(sessionObject.expiresAt as string);
            const recreatedSession = new Session(sessionObject);

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
    static async open(options?: SessionPoolOptions): Promise<SessionPool> {
        const sessionPool = new SessionPool(options);
        await sessionPool.initialize();
        return sessionPool;
    }
}
