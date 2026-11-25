import { AsyncEventEmitter } from '@vladfrangu/async_event_emitter';

import type { BetterIntervalID } from '@apify/utilities';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';

import { serviceLocator } from '../service-locator.js';

export interface EventManagerOptions {
    /** Interval between emitted `persistState` events in milliseconds. */
    persistStateIntervalMillis: number;
}

export enum EventType {
    PERSIST_STATE = 'persistState',
    SYSTEM_INFO = 'systemInfo',
    MIGRATING = 'migrating',
    ABORTING = 'aborting',
    EXIT = 'exit',
    STATUS_MESSAGE = 'statusMessage',
}

export type EventTypeName =
    | EventType
    | 'systemInfo'
    | 'persistState'
    | 'migrating'
    | 'aborting'
    | 'exit'
    | 'statusMessage';

/**
 * Payload emitted with the {@apilink EventType.STATUS_MESSAGE|`statusMessage`} event.
 *
 * The crawler broadcasts these whenever it wants to report its progress (e.g. periodically, or on
 * start/finish). Consumers such as the Apify SDK can listen for the event and propagate the message
 * to the platform. This keeps the crawler decoupled from any specific status-reporting backend.
 */
export interface EventStatusMessageData {
    /**
     * Identifies the crawler that emitted the message.
     *
     * Either the user-provided `id` from the crawler options, or a randomly generated one.
     * Since a single event manager may be shared by multiple crawlers, consumers can use this
     * to attribute the message to a specific crawler instance.
     */
    crawlerId: string;
    /** The human-readable status message. */
    message: string;
    /** Whether this is the final status message of the run. */
    isStatusMessageTerminal?: boolean;
    /** The log level the message was logged with. */
    level?: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
}

interface Intervals {
    persistState?: BetterIntervalID;
    systemInfo?: BetterIntervalID;
}

export abstract class EventManager {
    protected events = new AsyncEventEmitter();
    protected initialized = false;
    protected intervals: Intervals = {};
    protected log = serviceLocator.getLogger().child({ prefix: 'Events' });
    #persistStateIntervalMillis: number;
    #started = false;

    // Whoever called `init()` closes the manager; one that started itself has to flush on its own.
    readonly #flushBeforeExit = () => {
        if (!this.initialized) void this.close();
    };

    constructor(options: EventManagerOptions) {
        this.#persistStateIntervalMillis = options.persistStateIntervalMillis;
        // One MIGRATING listener per RequestQueue, and ThrottlingRequestManager opens one per domain.
        this.events.setMaxListeners(150);
    }

    /**
     * Takes over the lifecycle of the event manager: whoever calls this is expected to call
     * {@apilink EventManager.close|`close()`} as well. Without it, the manager starts itself with the first
     * listener and emits a final `persistState` event before the process exits.
     *
     * A subclass that needs to await something to start (e.g. a connection) does so here, which is why
     * such a manager has to be initialized explicitly.
     */
    async init() {
        if (this.initialized) {
            return;
        }

        this.#start();
        this.initialized = true;
    }

    /**
     * Stops the `persistState` event interval and emits the final `persistState` event.
     * The next `on()` call starts the manager again.
     */
    async close() {
        if (!this.#started) {
            return;
        }

        this.stop();
        this.emit(EventType.PERSIST_STATE, { isMigrating: false });
        this.initialized = false;

        await this.waitForAllListenersToComplete();
    }

    /**
     * Stops the intervals without emitting the final `persistState` event.
     * @internal
     */
    stop(): void {
        betterClearInterval(this.intervals.persistState!);
        process.off('beforeExit', this.#flushBeforeExit);
        this.#started = false;
    }

    on(event: EventTypeName, listener: (...args: any[]) => any): void {
        this.#start();
        this.events.on(event, listener);
    }

    off(event: EventTypeName, listener?: (...args: any[]) => any): void {
        if (listener) {
            this.events.removeListener(event, listener);
        } else {
            this.events.removeAllListeners(event);
        }
    }

    emit(event: EventTypeName, ...args: unknown[]): void {
        this.events.emit(event, ...args);
    }

    #start(): void {
        if (this.#started) {
            return;
        }

        // Unreferenced, so that a manager nobody closes does not keep the process alive.
        this.intervals.persistState = betterSetInterval(() => {
            this.emit(EventType.PERSIST_STATE, { isMigrating: false });
        }, this.#persistStateIntervalMillis).unref();
        process.once('beforeExit', this.#flushBeforeExit);
        this.#started = true;
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * @internal
     */
    listenerCount(event: EventTypeName): number {
        return this.events.listenerCount(event);
    }

    /**
     * @internal
     */
    listeners(event: EventTypeName): (() => Promise<unknown>)[] {
        return this.events.listeners(event) as (() => Promise<unknown>)[];
    }

    /**
     * @internal
     */
    async waitForAllListenersToComplete() {
        return this.events.waitForAllListenersToComplete();
    }
}
