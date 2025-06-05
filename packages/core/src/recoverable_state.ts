import { Configuration, EventType, KeyValueStore } from '@crawlee/core';

import type { Log } from '@apify/log';
import log from '@apify/log';

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
     * The name of the KeyValueStore to use for persistence.
     * If neither a name nor an id are supplied, the default store will be used.
     */
    persistStateKvsName?: string;

    /**
     * The identifier of the KeyValueStore to use for persistence.
     * If neither a name nor an id are supplied, the default store will be used.
     */
    persistStateKvsId?: string;
}

/**
 * Options for configuring the RecoverableState
 */
export interface RecoverableStateOptions<TStateModel = Record<string, unknown>>
    extends RecoverableStatePersistenceOptions {
    /**
     * The default state used if no persisted state is found.
     * A deep copy is made each time the state is used.
     */
    defaultState: TStateModel;

    /**
     * A logger instance for logging operations related to state persistence
     */
    logger?: Log;

    /**
     * Configuration instance to use
     */
    config?: Configuration;

    /**
     * Optional function to transform the state to a JSON string before persistence.
     * If not provided, JSON.stringify will be used.
     */
    serialize?: (state: TStateModel) => string;

    /**
     * Optional function to transform a JSON-serialized object back to the state model.
     * If not provided, JSON.parse is used.
     * It is advisable to perform validation in this function and to throw an exception if it fails.
     */
    deserialize?: (serializedState: string) => TStateModel;
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
export class RecoverableState<TStateModel = Record<string, unknown>> {
    private readonly defaultState: TStateModel;
    private state: TStateModel | null = null;
    private readonly persistenceEnabled: boolean;
    private readonly persistStateKey: string;
    private readonly persistStateKvsName?: string;
    private readonly persistStateKvsId?: string;
    private keyValueStore: KeyValueStore | null = null;
    private readonly log: Log;
    private readonly config: Configuration;
    private readonly serialize: (state: TStateModel) => string;
    private readonly deserialize: (serializedState: string) => TStateModel;

    /**
     * Initialize a new recoverable state object.
     *
     * @param options Configuration options for the recoverable state
     */
    constructor(options: RecoverableStateOptions<TStateModel>) {
        this.defaultState = options.defaultState;
        this.persistStateKey = options.persistStateKey;
        this.persistenceEnabled = options.persistenceEnabled ?? false;
        this.persistStateKvsName = options.persistStateKvsName;
        this.persistStateKvsId = options.persistStateKvsId;
        this.log = options.logger ?? log.child({ prefix: 'RecoverableState' });
        this.config = options.config ?? Configuration.getGlobalConfig();
        this.serialize = options.serialize ?? JSON.stringify;
        this.deserialize = options.deserialize ?? JSON.parse;

        this.persistState = this.persistState.bind(this);
    }

    /**
     * Initialize the recoverable state.
     *
     * This method must be called before using the recoverable state. It loads the saved state
     * if persistence is enabled and registers the object to listen for PERSIST_STATE events.
     *
     * @returns The loaded state object
     */
    async initialize(): Promise<TStateModel> {
        if (this.state !== null && this.state !== undefined) {
            return this.currentValue;
        }

        if (!this.persistenceEnabled) {
            this.state = this.deserialize(this.serialize(this.defaultState));
            return this.currentValue;
        }

        this.keyValueStore = await KeyValueStore.open(this.persistStateKvsName ?? this.persistStateKvsId, {
            config: this.config,
        });

        await this.loadSavedState();

        // Register for persist state events
        const eventManager = this.config.getEventManager();
        eventManager.on(EventType.PERSIST_STATE, this.persistState);

        return this.currentValue;
    }

    /**
     * Clean up resources used by the recoverable state.
     *
     * If persistence is enabled, this method deregisters the object from PERSIST_STATE events
     * and persists the current state one last time.
     */
    async teardown(): Promise<void> {
        if (!this.persistenceEnabled || !this.persistState) {
            return;
        }

        const eventManager = this.config.getEventManager();
        eventManager.off(EventType.PERSIST_STATE, this.persistState);
        await this.persistState();
    }

    /**
     * Get the current state.
     */
    get currentValue(): TStateModel {
        if (this.state === null) {
            throw new Error('Recoverable state has not yet been loaded');
        }

        return this.state;
    }

    /**
     * Reset the state to the default values and clear any persisted state.
     *
     * Resets the current state to the default state and, if persistence is enabled,
     * clears the persisted state from the KeyValueStore.
     */
    async reset(): Promise<void> {
        this.state = this.deserialize(this.serialize(this.defaultState));

        if (this.persistenceEnabled) {
            if (this.keyValueStore === null) {
                throw new Error('Recoverable state has not yet been initialized');
            }

            await this.keyValueStore.setValue(this.persistStateKey, null);
        }
    }

    /**
     * Persist the current state to the KeyValueStore.
     *
     * This method is typically called in response to a PERSIST_STATE event, but can also be called
     * directly when needed.
     *
     * @param eventData Optional data associated with a PERSIST_STATE event
     */
    async persistState(eventData?: { isMigrating: boolean }): Promise<void> {
        this.log.debug(`Persisting state of the RecoverableState (eventData=${JSON.stringify(eventData)}).`);

        if (this.keyValueStore === null || this.state === null) {
            throw new Error('Recoverable state has not yet been initialized');
        }

        if (this.persistenceEnabled) {
            await this.keyValueStore.setValue(this.persistStateKey, this.serialize(this.state), {
                contentType: 'text/plain', // HACK - the result is expected to be JSON, but we do this to avoid the implicit JSON.parse in `KeyValueStore.getValue`
            });
        }
    }

    /**
     * Load the saved state from the KeyValueStore
     */
    private async loadSavedState(): Promise<void> {
        if (this.keyValueStore === null) {
            throw new Error('Recoverable state has not yet been initialized');
        }

        const storedState = await this.keyValueStore.getValue(this.persistStateKey);
        if (storedState === null || storedState === undefined) {
            this.state = this.deserialize(this.serialize(this.defaultState));
        } else {
            this.state = this.deserialize(storedState as string);
        }
    }
}
