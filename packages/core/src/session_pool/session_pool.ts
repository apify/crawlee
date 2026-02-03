import { EventEmitter } from 'node:events';

import type { Dictionary } from '@crawlee/types';
import { AsyncQueue } from '@sapphire/async-queue';
import ow from 'ow';

import type { Log } from '@apify/log';

import { Configuration } from '../configuration.js';
import type { PersistenceOptions } from '../crawlers/statistics.js';
import type { EventManager } from '../events/event_manager.js';
import { EventType } from '../events/event_manager.js';
import { log as defaultLog } from '../log.js';
import { KeyValueStore } from '../storages/key_value_store.js';
import { entries } from '../typedefs.js';
import { BLOCKED_STATUS_CODES, MAX_POOL_SIZE, PERSIST_STATE_KEY } from './consts.js';
import type { SessionOptions } from './session.js';
import { Session } from './session.js';

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
     * Custom function that should return a `Session` instance, or a promise resolving to such instance.
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
    protected sessionMap = new Map<string, { busy: boolean; session: Session }>();
    protected sessionOptions: SessionOptions;
    protected persistStateKeyValueStoreId?: string;
    protected persistStateKey: string;
    protected _listener!: () => Promise<void>;
    protected events: EventManager;
    protected readonly blockedStatusCodes: number[];
    protected persistenceOptions: PersistenceOptions;
    protected isInitialized = false;

    private queue = new AsyncQueue();

    /**
     * @internal
     */
    constructor(
        options: SessionPoolOptions = {},
        readonly config = Configuration.getGlobalConfig(),
    ) {
        super();

        ow(
            options,
            ow.object.exactShape({
                maxPoolSize: ow.optional.number,
                persistStateKeyValueStoreId: ow.optional.string,
                persistStateKey: ow.optional.string,
                createSessionFunction: ow.optional.function,
                sessionOptions: ow.optional.object,
                blockedStatusCodes: ow.optional.array.ofType(ow.number),
                log: ow.optional.object,
                persistenceOptions: ow.optional.object,
            }),
        );

        const {
            maxPoolSize = MAX_POOL_SIZE,
            persistStateKeyValueStoreId,
            persistStateKey = PERSIST_STATE_KEY,
            createSessionFunction,
            sessionOptions = {},
            blockedStatusCodes = BLOCKED_STATUS_CODES,
            log = defaultLog,
            persistenceOptions = {
                enable: true,
            },
        } = options;

        this.config = config;
        this.blockedStatusCodes = blockedStatusCodes;
        this.events = config.getEventManager();
        this.log = log.child({ prefix: 'SessionPool' });
        this.persistenceOptions = persistenceOptions;

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
     * Starts periodic state persistence and potentially loads SessionPool state from {@apilink KeyValueStore}.
     * It is called automatically by the {@apilink SessionPool.open} function.
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        this.keyValueStore = await KeyValueStore.open(this.persistStateKeyValueStoreId, { config: this.config });
        if (!this.persistenceOptions.enable) {
            this.isInitialized = true;
            return;
        }

        if (!this.persistStateKeyValueStoreId) {
            this.log.debug(
                `No 'persistStateKeyValueStoreId' options specified, this session pool's data has been saved in the KeyValueStore with the id: ${this.keyValueStore.id}`,
            );
        }

        // in case of migration happened and SessionPool state should be restored from the keyValueStore.
        await this._maybeLoadSessionPool();

        this._listener = this.persistState.bind(this);

        this.events.on(EventType.PERSIST_STATE, this._listener);
        this.isInitialized = true;
    }

    private async newSession(sessionOptions?: SessionOptions): Promise<Session> {
        this._throwIfNotInitialized();

        const newSession = await this.createSessionFunction(this, { sessionOptions });
        this._addSession(newSession);

        return newSession;
    }

    private async markAsBusy(session: Session) {
        this._throwIfNotInitialized();

        const sessionData = this.sessionMap.get(session.id);
        if (!sessionData) {
            throw new Error('Marking session as busy that is not in the pool');
        }

        sessionData.busy = true;
    }

    async reclaimSession(session: Session): Promise<void> {
        this._throwIfNotInitialized();

        if (!session.isUsable()) {
            this.sessionMap.delete(session.id);
            return;
        }

        const sessionData = this.sessionMap.get(session.id);
        if (!sessionData) {
            throw new Error('Reclaiming session that is not in the pool');
        }

        sessionData.busy = false;
    }

    /**
     * Gets session.
     * Returns a `Session` instance, if available.
     * If all the sessions are in use, returns `undefined`.
     */
    async getSession(
        options: Pick<SessionOptions, 'id' | 'cookieJar' | 'proxyInfo'> = {},
    ): Promise<Session | undefined> {
        await this.queue.wait();

        try {
            this._throwIfNotInitialized();

            // TODO use the custom fetch strategy here
            let session = this.sessionMap.values().find((s) => {
                if (s.busy) return false;

                for (const [key, value] of entries(options)) {
                    if (s.session[key] !== value) return false;
                }

                return true;
            })?.session;

            if (!session && this.sessionMap.size < this.maxPoolSize) {
                session = await this.newSession();
            }

            if (session) await this.markAsBusy(session);
            return session;
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

        await this.keyValueStore?.setValue(this.persistStateKey, null);
    }

    /**
     * Returns an object representing the internal state of the `SessionPool` instance.
     * Note that the object's fields can change in future releases.
     */
    getState() {
        return this.sessionMap.values().map(({ session }) => session.getState());
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

        this.log.debug('Persisting state', {
            persistStateKeyValueStoreId: this.persistStateKeyValueStoreId,
            persistStateKey: this.persistStateKey,
        });

        // use half the interval of `persistState` to avoid race conditions
        const persistStateIntervalMillis = this.config.get('persistStateIntervalMillis')!;
        const timeoutSecs = persistStateIntervalMillis / 2_000;
        await this.keyValueStore
            .setValue(this.persistStateKey, this.getState(), {
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
        this.events.off(EventType.PERSIST_STATE, this._listener);
        await this.persistState();
    }

    /**
     * SessionPool should not work before initialization.
     */
    protected _throwIfNotInitialized() {
        if (!this.isInitialized) throw new Error('SessionPool is not initialized.');
    }

    /**
     * Adds `Session` instance to `SessionPool`.
     * @param session `Session` instance to be added.
     */
    protected _addSession(session: Session) {
        this.sessionMap.set(session.id, { busy: false, session });
    }

    /**
     * Creates new session without any extra behavior.
     * @param sessionPool
     * @param [options]
     * @param [options.sessionOptions] The configuration options for the session being created.
     * @returns New session.
     */
    protected async _defaultCreateSessionFunction(
        sessionPool: SessionPool,
        options: { sessionOptions?: SessionOptions } = {},
    ): Promise<Session> {
        ow(options, ow.object.exactShape({ sessionOptions: ow.optional.object }));
        const { sessionOptions = {} } = options;

        return new Session({
            ...this.sessionOptions,
            ...sessionOptions,
            sessionPool,
        });
    }

    /**
     * Potentially loads `SessionPool`.
     * If the state was persisted it loads the `SessionPool` from the persisted state.
     */
    protected async _maybeLoadSessionPool(): Promise<void> {
        const sessions = await this.keyValueStore.getValue<Dictionary[]>(this.persistStateKey);

        if (!sessions) return;

        // Invalidate old sessions and load active sessions only
        this.log.debug('Recreating state from KeyValueStore', {
            persistStateKeyValueStoreId: this.persistStateKeyValueStoreId,
            persistStateKey: this.persistStateKey,
        });

        for (const session of sessions) {
            session.sessionPool = this;
            session.createdAt = new Date(session.createdAt as string);
            session.expiresAt = new Date(session.expiresAt as string);
            const recreatedSession = await this.createSessionFunction(this, { sessionOptions: session });

            if (recreatedSession.isUsable()) {
                this._addSession(recreatedSession);
            }
        }

        this.log.debug(`${this.sessionMap.size} sessions loaded from KeyValueStore`);
    }

    /**
     * Opens a SessionPool and returns a promise resolving to an instance
     * of the {@apilink SessionPool} class that is already initialized.
     *
     * For more details and code examples, see the {@apilink SessionPool} class.
     */
    static async open(options?: SessionPoolOptions, config?: Configuration): Promise<SessionPool> {
        const sessionPool = new SessionPool(options, config);
        await sessionPool.initialize();
        return sessionPool;
    }
}
