import type { Dictionary } from '@crawlee/types';
import { AsyncQueue } from '@sapphire/async-queue';
import ow from 'ow';

import type { PersistenceOptions } from '../crawlers/statistics.js';
import type { EventManager } from '../events/event_manager.js';
import { EventType } from '../events/event_manager.js';
import type { CrawleeLogger } from '../log.js';
import { serviceLocator } from '../service_locator.js';
import { KeyValueStore } from '../storages/key_value_store.js';
import { MAX_POOL_SIZE, PERSIST_STATE_KEY } from './consts.js';
import type { SessionOptions } from './session.js';
import { Session } from './session.js';

const SESSION_REUSE_STRATEGIES = ['random', 'round-robin', 'use-until-failure'] as const;
export type SessionReuseStrategy = (typeof SESSION_REUSE_STRATEGIES)[number];

/**
 * Factory user-function which creates customized {@apilink Session} instances.
 */
export interface CreateSession {
    /**
     * @param options.sessionOptions Per-call session options already merged with the pool-wide defaults.
     */
    (options?: { sessionOptions?: SessionOptions }): Session | Promise<Session>;
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
     * @default SDK_SESSION_POOL_STATE_{id}
     */
    persistStateKey?: string;

    /**
     * Custom function that should return a `Session` instance, or a promise resolving to such instance.
     * Any error thrown from this function will terminate the process.
     * Function receives `SessionPool` instance as a parameter
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
export class SessionPool {
    private static nextId = 0;

    readonly id: string;
    protected log: CrawleeLogger;
    protected maxPoolSize: number;
    protected createSessionFunction: CreateSession;
    protected keyValueStore?: KeyValueStore;
    protected sessions: Session[] = [];
    protected sessionMap = new Map<string, Session>();
    protected sessionOptions: SessionOptions;
    protected persistStateKeyValueStoreId?: string;
    protected persistStateKey: string;
    protected _listener?: () => Promise<void>;
    protected events: EventManager;
    protected persistenceOptions: PersistenceOptions;
    protected sessionReuseStrategy: SessionReuseStrategy;

    private initPromise?: Promise<void>;
    private queue = new AsyncQueue();
    private roundRobinIndex = 0;

    constructor(options: SessionPoolOptions = {}) {
        ow(
            options,
            ow.object.exactShape({
                id: ow.optional.any(ow.number, ow.string),
                maxPoolSize: ow.optional.number,
                persistStateKeyValueStoreId: ow.optional.string,
                persistStateKey: ow.optional.string,
                createSessionFunction: ow.optional.function,
                sessionOptions: ow.optional.object,
                log: ow.optional.object,
                persistenceOptions: ow.optional.object,
                sessionReuseStrategy: ow.optional.string.oneOf([...SESSION_REUSE_STRATEGIES]),
            }),
        );

        const {
            id,
            maxPoolSize = MAX_POOL_SIZE,
            persistStateKeyValueStoreId,
            persistStateKey,
            createSessionFunction,
            sessionOptions = {},
            log = serviceLocator.getLogger(),
            persistenceOptions = {
                enable: true,
            },
            sessionReuseStrategy = 'random',
        } = options;

        this.id = id != null ? String(id) : String(SessionPool.nextId++);
        this.sessionReuseStrategy = sessionReuseStrategy;
        this.events = serviceLocator.getEventManager();
        this.log = log.child({ prefix: 'SessionPool' });
        this.persistenceOptions = persistenceOptions;

        // Pool Configuration
        this.maxPoolSize = maxPoolSize;
        this.createSessionFunction = createSessionFunction || this._defaultCreateSessionFunction;

        // Session configuration. The pool-scoped logger is merged into per-call sessionOptions inside
        // `_invokeCreateSessionFunction`, so every Session inherits it without custom createSessionFunctions
        // having to know about it.
        this.sessionOptions = {
            ...sessionOptions,
            log: this.log,
        };

        // Session keyValueStore
        this.persistStateKeyValueStoreId = persistStateKeyValueStoreId;
        this.persistStateKey = persistStateKey ?? `${PERSIST_STATE_KEY}_${this.id}`;
    }

    /**
     * Gets count of usable sessions in the pool.
     */
    async usableSessionsCount(): Promise<number> {
        await this.ensureInitialized();
        return this.sessions.filter((session) => session.isUsable()).length;
    }

    /**
     * Gets count of retired sessions in the pool.
     */
    async retiredSessionsCount(): Promise<number> {
        await this.ensureInitialized();
        return this.sessions.filter((session) => !session.isUsable()).length;
    }

    /**
     * Starts periodic state persistence and potentially loads SessionPool state from {@apilink KeyValueStore}.
     * Called automatically on first use of any public method.
     */
    protected async ensureInitialized(): Promise<void> {
        if (!this.initPromise) {
            this.initPromise = this.setupPool();
        }
        return this.initPromise;
    }

    private async setupPool(): Promise<void> {
        if (!this.persistenceOptions.enable) {
            return;
        }

        this.keyValueStore = await KeyValueStore.open(
            this.persistStateKeyValueStoreId ? { id: this.persistStateKeyValueStoreId } : null,
            {
                config: serviceLocator.getConfiguration(),
            },
        );

        if (!this.persistStateKeyValueStoreId) {
            this.log.debug(
                `No 'persistStateKeyValueStoreId' options specified, this session pool's data has been saved in the KeyValueStore with the id: ${this.keyValueStore.id}`,
            );
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
        await this.ensureInitialized();
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

        const newSession = options instanceof Session ? options : await this._invokeCreateSessionFunction(options);
        this.log.debug(`Adding new Session - ${newSession.id}`);

        this._addSession(newSession);
    }

    /**
     * Adds a new session to the session pool. The pool automatically creates sessions up to the maximum size of the pool,
     * but this allows you to add more sessions once the max pool size is reached.
     * This also allows you to add session with overridden session options (e.g. with specific session id).
     * @param [options] The configuration options for the session being added to the session pool.
     */
    async newSession(sessionOptions?: SessionOptions): Promise<Session> {
        await this.ensureInitialized();

        const newSession = await this._invokeCreateSessionFunction(sessionOptions);
        this._addSession(newSession);

        return newSession;
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
        await this.ensureInitialized();

        await this.queue.wait();
        try {
            if (sessionId) {
                const session = this.sessionMap.get(sessionId);
                if (session?.isUsable()) return session;
                return undefined;
            }

            const pickedSession = this._pickSession();
            if (pickedSession) return pickedSession;

            if (this._hasSpaceForSession()) {
                return await this._createSession();
            }

            this._removeRetiredSessions();
            return await this._createSession();
        } finally {
            this.queue.shift();
        }
    }

    /**
     * @param options - Override the persistence options provided in the constructor
     */
    async resetStore(options?: PersistenceOptions) {
        if (!this.persistenceOptions.enable && !options?.enable) {
            return;
        }

        await this.ensureInitialized();
        await this.keyValueStore?.setValue(this.persistStateKey, null);
    }

    /**
     * Returns an object representing the internal state of the `SessionPool` instance.
     * Note that the object's fields can change in future releases.
     */
    async getState() {
        await this.ensureInitialized();
        return {
            usableSessionsCount: await this.usableSessionsCount(),
            retiredSessionsCount: await this.retiredSessionsCount(),
            sessions: this.sessions.map((session) => session.getState()),
        };
    }

    /**
     * Persists the current state of the `SessionPool` into the default {@apilink KeyValueStore}.
     * The state is persisted automatically in regular intervals.
     * @param options - Override the persistence options provided in the constructor
     */
    async persistState(options?: PersistenceOptions): Promise<void> {
        if (!this.persistenceOptions.enable && !options?.enable) {
            return;
        }

        await this.ensureInitialized();

        this.log.debug('Persisting state', {
            persistStateKeyValueStoreId: this.persistStateKeyValueStoreId,
            persistStateKey: this.persistStateKey,
        });

        // use half the interval of `persistState` to avoid race conditions
        const persistStateIntervalMillis = serviceLocator.getConfiguration().persistStateIntervalMillis;
        const timeoutSecs = persistStateIntervalMillis / 2_000;
        await this.keyValueStore
            ?.setValue(this.persistStateKey, await this.getState(), {
                timeoutSecs,
                doNotRetryTimeouts: true,
            })
            .catch((error) =>
                this.log.warning(`Failed to persist the session pool stats to ${this.persistStateKey}`, { error }),
            );
    }

    /**
     * Removes listener from `persistState` event.
     * This function should be called after you are done with using the `SessionPool` instance.
     */
    async teardown(): Promise<void> {
        if (!this.initPromise) return;
        await this.ensureInitialized();
        if (this._listener) {
            this.events.off(EventType.PERSIST_STATE, this._listener);
        }
        await this.persistState();
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
     * @param [options]
     * @param [options.sessionOptions] The configuration options for the session being created.
     * @returns New session.
     */
    protected async _defaultCreateSessionFunction(options: { sessionOptions?: SessionOptions } = {}): Promise<Session> {
        ow(options, ow.object.exactShape({ sessionOptions: ow.optional.object }));
        const { sessionOptions = {} } = options;

        return new Session(sessionOptions);
    }

    /**
     * Invokes `createSessionFunction` with `sessionOptions` already merged from pool-wide defaults and
     * the supplied per-call overrides, so custom implementations don't need to spread `pool.sessionOptions` themselves.
     */
    private async _invokeCreateSessionFunction(perCallOptions?: SessionOptions): Promise<Session> {
        const sessionOptions = { ...this.sessionOptions, ...perCallOptions };
        return this.createSessionFunction({ sessionOptions });
    }

    /**
     * Creates new session and adds it to the pool.
     * @returns Newly created `Session` instance.
     */
    protected async _createSession(): Promise<Session> {
        const newSession = await this._invokeCreateSessionFunction();
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
     * Picks a session from the `SessionPool` according to the configured `sessionReuseStrategy`.
     * Returns `undefined` when no session should be reused and a new one should be created instead.
     */
    protected _pickSession(): Session | undefined {
        if (this.sessionReuseStrategy !== 'use-until-failure' && this._hasSpaceForSession()) return undefined;

        if (this.sessionReuseStrategy === 'use-until-failure') {
            return this.sessions.find((session) => session.isUsable());
        }

        let picked: Session;
        if (this.sessionReuseStrategy === 'round-robin') {
            const index = this.roundRobinIndex % this.sessions.length;
            this.roundRobinIndex = index + 1;
            picked = this.sessions[index];
        } else {
            picked = this.sessions[this._getRandomIndex()];
        }

        return picked.isUsable() ? picked : undefined;
    }

    /**
     * Potentially loads `SessionPool`.
     * If the state was persisted it loads the `SessionPool` from the persisted state.
     */
    protected async _maybeLoadSessionPool(): Promise<void> {
        const loadedSessionPool = await this.keyValueStore?.getValue<{ sessions: Dictionary[] }>(this.persistStateKey);

        if (!loadedSessionPool) return;

        // Invalidate old sessions and load active sessions only
        this.log.debug('Recreating state from KeyValueStore', {
            persistStateKeyValueStoreId: this.persistStateKeyValueStoreId,
            persistStateKey: this.persistStateKey,
        });

        for (const sessionObject of loadedSessionPool.sessions) {
            sessionObject.createdAt = new Date(sessionObject.createdAt as string);
            sessionObject.expiresAt = new Date(sessionObject.expiresAt as string);
            const recreatedSession = await this._invokeCreateSessionFunction(sessionObject);

            if (recreatedSession.isUsable()) {
                this._addSession(recreatedSession);
            }
        }

        this.log.debug(`${this.sessions.length} active sessions loaded from KeyValueStore`);
    }
}
