import { addTimeoutToPromise, storage as timeoutStorage } from '@apify/timeout';
import type { Configuration, CrawleeLogger } from '@crawlee/core';
import { EventType, KeyValueStore, serviceLocator, StateValidationError } from '@crawlee/core';
import type { Awaitable } from '@crawlee/types';
import type { StandardSchemaV1 } from '@standard-schema/spec';

const DEFAULT_PERSISTENCE_TIMEOUT_MILLIS = 60_000;

/**
 * One direction of the conversion between the state model and its persisted form - either a plain function, or a
 * [Standard Schema](https://standardschema.dev) whose validated output is the result.
 *
 * A schema that fails to validate makes {@apilink RecoverableState} throw a {@apilink StateValidationError}. Zod
 * codecs work directly, as their validation *is* the decode direction; use `(state) => codec.encode(state)` for the
 * other one.
 */
export type StateConversion<TFrom, TTo> = ((value: TFrom) => Awaitable<TTo>) | StandardSchemaV1<TFrom, TTo>;

/**
 * A {@apilink StateConversion} for a caller that cannot await one - {@apilink Statistics}, whose `toJSON()` is
 * synchronous, being the reason this exists.
 *
 * Only the function arm can be narrowed here: a Standard Schema is free to validate asynchronously, so a schema
 * that does is rejected when it runs rather than when it is passed.
 */
export type SyncStateConversion<TFrom, TTo> = ((value: TFrom) => TTo) | StandardSchemaV1<TFrom, TTo>;

/**
 * Applies a {@apilink SyncStateConversion}, throwing a {@apilink StateValidationError} for a schema that rejects
 * the value.
 *
 * @internal
 */
export function convertStateSync<TFrom, TTo>(
    conversion: SyncStateConversion<TFrom, TTo>,
    value: TFrom,
    persistStateKey: string,
): TTo {
    if (typeof conversion === 'function') {
        return conversion(value);
    }

    const result = conversion['~standard'].validate(value);

    if ('then' in result) {
        throw new Error(
            `The state conversion for '${persistStateKey}' validated asynchronously, which this caller cannot await.`,
        );
    }

    if (result.issues) {
        throw new StateValidationError(persistStateKey, result.issues);
    }

    return result.value;
}

export interface RecoverableStatePersistenceOptions {
    /**
     * The key under which the state is stored in the KeyValueStore
     */
    persistStateKey: string;

    /**
     * Flag to enable or disable state persistence
     */
    persistenceEnabled?: boolean;

    /**
     * The KeyValueStore to persist into, defaulting to the default store. Accepts a pending
     * {@apilink KeyValueStore.open} so that callers do not have to be async to point at a specific store.
     */
    keyValueStore?: KeyValueStore | PromiseLike<KeyValueStore>;

    /**
     * Time limit for a single load or save of the state, in milliseconds.
     * @default 60_000
     */
    persistenceTimeoutMillis?: number;
}

/**
 * Options for configuring the RecoverableState
 */
export interface RecoverableStateOptions<
    TStateModel = Record<string, unknown>,
    TPersistedState = TStateModel,
> extends RecoverableStatePersistenceOptions {
    /**
     * The state used when no persisted state is found, and the state {@apilink RecoverableState.reset} restores.
     *
     * A plain value is deep-copied with `structuredClone` each time it is used, so pass a factory for a state
     * that `structuredClone` cannot rebuild - one holding class instances, say, or one derived from a schema.
     */
    defaultState: TStateModel | (() => TStateModel);

    /**
     * A logger instance for logging operations related to state persistence
     */
    logger?: CrawleeLogger;

    /**
     * Configuration instance to use when opening the KeyValueStore
     */
    configuration?: Configuration;

    /**
     * Optional conversion of the state to a plain JSON-serializable value before it is persisted.
     * If not provided, the state is persisted as is.
     */
    serialize?: StateConversion<TStateModel, TPersistedState>;

    /**
     * Optional conversion of a persisted value back to the state model, and the place to validate a record before
     * trusting it. If not provided, the persisted value is used as is.
     */
    deserialize?: StateConversion<TPersistedState, TStateModel>;
}

/**
 * A class for managing persistent recoverable state using a plain JavaScript object.
 *
 * This class facilitates state persistence to a `KeyValueStore`, allowing data to be saved and retrieved
 * across migrations or restarts. It manages the loading, saving, and resetting of state data,
 * with optional persistence capabilities.
 *
 * The state is represented by a plain JavaScript object that can be serialized to and deserialized from JSON.
 * The class automatically hooks into the event system to persist state when needed.
 */
export class RecoverableState<TStateModel = Record<string, unknown>, TPersistedState = TStateModel> {
    readonly #defaultState: () => TStateModel;
    #state: TStateModel | null = null;
    #initialized = false;
    #listening = false;
    readonly #persistenceEnabled: boolean;
    readonly #persistStateKey: string;
    readonly #persistenceTimeoutMillis: number;
    readonly #configuration?: Configuration;
    #keyValueStore: KeyValueStore | PromiseLike<KeyValueStore> | null;
    readonly #log: CrawleeLogger;
    readonly #serialize: (state: TStateModel) => Promise<TPersistedState>;
    readonly #deserialize: (persistedState: TPersistedState) => Promise<TStateModel>;
    readonly #persistStateQuietly: (eventData?: Record<string, unknown>) => Promise<void>;

    /**
     * Initialize a new recoverable state object.
     *
     * @param options Configuration options for the recoverable state
     */
    constructor(options: RecoverableStateOptions<TStateModel, TPersistedState>) {
        const { defaultState } = options;
        this.#defaultState =
            typeof defaultState === 'function'
                ? (defaultState as () => TStateModel)
                : () => structuredClone(defaultState);

        this.#persistStateKey = options.persistStateKey;
        this.#persistenceEnabled = options.persistenceEnabled ?? false;
        this.#persistenceTimeoutMillis = options.persistenceTimeoutMillis ?? DEFAULT_PERSISTENCE_TIMEOUT_MILLIS;
        this.#configuration = options.configuration;
        this.#keyValueStore = options.keyValueStore ?? null;
        this.#log = options.logger ?? serviceLocator.getLogger().child({ prefix: 'RecoverableState' });
        this.#serialize = this.#toConversion(options.serialize);
        this.#deserialize = this.#toConversion(options.deserialize);

        // The automatic persists, where a rejection has nowhere useful to go - the event manager does not catch
        // listener errors, and throwing from teardown would bury the outcome of the work it cleans up after.
        this.#persistStateQuietly = async (eventData) =>
            this.persistState(eventData).catch((error) =>
                this.#log.warning(`Failed to persist the state under key '${this.#persistStateKey}'.`, { error }),
            );
    }

    /** Normalizes a conversion option into a function. Absent conversions pass the value through unchanged. */
    #toConversion<TFrom, TTo>(conversion: StateConversion<TFrom, TTo> | undefined): (value: TFrom) => Promise<TTo> {
        if (conversion === undefined) {
            return async (value) => value as unknown as TTo;
        }

        if (typeof conversion === 'function') {
            return async (value) => conversion(value);
        }

        return async (value) => {
            const result = await conversion['~standard'].validate(value);

            if (result.issues) {
                throw new StateValidationError(this.#persistStateKey, result.issues);
            }

            return result.value;
        };
    }

    /**
     * Initialize the recoverable state.
     *
     * If persistence is enabled, this method loads the saved state and registers the object to listen for
     * PERSIST_STATE events. A state established beforehand by {@apilink RecoverableState.reset} survives if there
     * is no record to restore.
     *
     * Calling this again after a {@apilink RecoverableState.teardown} starts a new persistence window - the
     * listener is registered again and the record reloaded.
     *
     * @returns The loaded state object
     */
    async initialize(): Promise<TStateModel> {
        if (this.#initialized) {
            return this.currentValue;
        }

        if (this.#persistenceEnabled) {
            this.#keyValueStore ??= KeyValueStore.open(null, {
                configuration: this.#configuration ?? serviceLocator.getConfiguration(),
            });
            await this.#resolveKeyValueStore();
            serviceLocator.getEventManager().on(EventType.PERSIST_STATE, this.#persistStateQuietly);
            this.#listening = true;
        }

        // Flipped before the record is loaded, so that a caller catching a `StateValidationError` is left with a
        // fully wired object running on the default state rather than a half-initialized one.
        this.#initialized = true;
        this.#state ??= this.#defaultState();

        await this.#loadSavedState();

        return this.currentValue;
    }

    /**
     * Clean up resources used by the recoverable state.
     *
     * If persistence is enabled, this method deregisters the object from PERSIST_STATE events
     * and persists the current state one last time, warning rather than throwing if that write fails - cleanup
     * runs when the work is already done, and failing it would bury whatever the caller was doing. The in-memory
     * state is left alone, and {@apilink RecoverableState.initialize} can be called again to open a new
     * persistence window.
     */
    async teardown(): Promise<void> {
        this.#initialized = false;

        if (!this.#persistenceEnabled) {
            return;
        }

        serviceLocator.getEventManager().off(EventType.PERSIST_STATE, this.#persistStateQuietly);
        this.#listening = false;
        await this.#persistStateQuietly();
    }

    /**
     * Get the current state.
     *
     * Throws until the state has been established, by either {@apilink RecoverableState.initialize} or the
     * synchronous {@apilink RecoverableState.reset} - the latter being how a caller that cannot await in its
     * constructor gets a usable state right away.
     */
    get currentValue(): TStateModel {
        if (this.#state === null) {
            throw new Error('Recoverable state has not yet been loaded - call initialize() or reset() first');
        }

        return this.#state;
    }

    /**
     * Reset the in-memory state to the default values, leaving any persisted record alone.
     *
     * Use {@apilink RecoverableState.resetStore} to clear the persisted record as well.
     */
    reset(): void {
        this.#state = this.#defaultState();
    }

    /**
     * Clear the persisted state record, leaving the in-memory state alone.
     *
     * This is a between-lifecycles operation - its point is to stop the next {@apilink RecoverableState.initialize}
     * from restoring the record, so it throws while PERSIST_STATE events are still being handled, where the next
     * one would write the record straight back. Use {@apilink RecoverableState.reset} to reset the state itself,
     * or {@apilink RecoverableState.teardown} before clearing the record.
     *
     * A no-op if persistence is disabled or no KeyValueStore is available yet.
     */
    async resetStore(): Promise<void> {
        if (this.#listening) {
            throw new Error(
                `Cannot clear the state persisted under key '${this.#persistStateKey}' while it is still being persisted periodically - the next PERSIST_STATE event would write it straight back. Use reset() to reset the state itself, or teardown() before clearing the record.`,
            );
        }

        if (!this.#persistenceEnabled) {
            return;
        }

        const keyValueStore = await this.#resolveKeyValueStore();

        if (keyValueStore === null) {
            return;
        }

        await this.#withTimeout(
            async () => keyValueStore.setValue(this.#persistStateKey, null),
            'Clearing the persisted state',
        );
    }

    /**
     * Persist the current state to the KeyValueStore.
     *
     * This method is typically called in response to a PERSIST_STATE event, but can also be called
     * directly when needed. It is a no-op if persistence is disabled, if no KeyValueStore is available yet, or if
     * there is no state to write. A failed write only rejects here - the periodic and teardown ones warn instead.
     *
     * @param eventData Optional data associated with a PERSIST_STATE event
     */
    async persistState(eventData?: Record<string, unknown>): Promise<void> {
        if (!this.#persistenceEnabled || this.#state === null) {
            return;
        }

        const keyValueStore = await this.#resolveKeyValueStore();

        if (keyValueStore === null) {
            return;
        }

        this.#log.debug(`Persisting state of the RecoverableState (eventData=${JSON.stringify(eventData)}).`);

        const serializedState = await this.#serialize(this.currentValue);

        await this.#withTimeout(
            async () => keyValueStore.setValue(this.#persistStateKey, serializedState),
            'Persisting the state',
        );
    }

    /** Awaits a store handed over as a pending `open()`, keeping the resolved instance for later calls. */
    async #resolveKeyValueStore(): Promise<KeyValueStore | null> {
        if (this.#keyValueStore === null) {
            return null;
        }

        this.#keyValueStore = await this.#keyValueStore;

        return this.#keyValueStore;
    }

    /**
     * Load the saved state from the KeyValueStore. Leaves the current state alone if there is no record to load.
     */
    async #loadSavedState(): Promise<void> {
        if (!this.#persistenceEnabled) {
            return;
        }

        const keyValueStore = await this.#resolveKeyValueStore();

        if (keyValueStore === null) {
            return;
        }

        const storedState = await this.#withTimeout(
            async () => keyValueStore.getValue(this.#persistStateKey),
            'Loading the persisted state',
        );

        if (storedState === null || storedState === undefined) {
            return;
        }

        this.#state = await this.#deserialize(storedState as TPersistedState);
    }

    async #withTimeout<T>(operation: () => Promise<T>, description: string): Promise<T> {
        // `@apify/timeout` shares one `AbortController` across nested frames and `KeyValueStore` checks it on
        // every operation, so a teardown-time persist running inside an already-expired request handler timeout
        // would be aborted before it started. Hence a fresh timeout context.
        return timeoutStorage.exit(async () =>
            addTimeoutToPromise(
                operation,
                this.#persistenceTimeoutMillis,
                `${description} under key '${this.#persistStateKey}' timed out after ${this.#persistenceTimeoutMillis / 1000} seconds.`,
            ),
        );
    }
}
