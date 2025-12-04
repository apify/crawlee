import { AsyncEventEmitter } from '@vladfrangu/async_event_emitter';

import log from '@apify/log';
import type { BetterIntervalID } from '@apify/utilities';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';

import { Configuration } from '../configuration';

export const enum EventType {
    PERSIST_STATE = 'persistState',
    SYSTEM_INFO = 'systemInfo',
    MIGRATING = 'migrating',
    ABORTING = 'aborting',
    EXIT = 'exit',
}

export interface EventTypeToArgs<SystemInfo> {
    [EventType.PERSIST_STATE]: [{ isMigrating: boolean; isAborting: boolean }];
    [EventType.SYSTEM_INFO]: [SystemInfo];
    [EventType.MIGRATING]: [any];
    [EventType.ABORTING]: [any];
    [EventType.EXIT]: [any];
}

export type EventTypeName = EventType | 'systemInfo' | 'persistState' | 'migrating' | 'aborting' | 'exit';

interface Intervals {
    persistState?: BetterIntervalID;
    systemInfo?: BetterIntervalID;
}

export abstract class EventManager<SystemInfo> {
    protected events = new AsyncEventEmitter<EventTypeToArgs<SystemInfo>>();
    protected initialized = false;
    protected intervals: Intervals = {};
    protected log = log.child({ prefix: 'Events' });

    constructor(readonly config = Configuration.getGlobalConfig()) {
        this.events.setMaxListeners(50);
    }

    /**
     * Initializes the event manager by creating the `persistState` event interval.
     * This is automatically called at the beginning of `crawler.run()`.
     */
    async init() {
        if (this.initialized) {
            return;
        }

        const persistStateIntervalMillis = this.config.get('persistStateIntervalMillis')!;
        this.intervals.persistState = betterSetInterval((intervalCallback: () => unknown) => {
            this.emit(EventType.PERSIST_STATE, { isMigrating: false, isAborting: false });
            intervalCallback();
        }, persistStateIntervalMillis);
        this.initialized = true;
    }

    /**
     * Clears the internal `persistState` event interval.
     * This is automatically called at the end of `crawler.run()`.
     */
    async close() {
        if (!this.initialized) {
            return;
        }

        betterClearInterval(this.intervals.persistState!);
        this.initialized = false;

        // Emit final PERSIST_STATE event
        this.emit(EventType.PERSIST_STATE, { isMigrating: false, isAborting: false });

        // Wait for PERSIST_STATE to process
        await this.waitForAllListenersToComplete();
    }

    on(event: EventTypeName, listener: (...args: EventTypeToArgs<SystemInfo>[EventTypeName]) => any): void {
        this.events.on(event, listener);
    }

    off(event: EventTypeName, listener?: (...args: EventTypeToArgs<SystemInfo>[EventTypeName]) => any): void {
        if (listener) {
            this.events.removeListener(event, listener);
        } else {
            this.events.removeAllListeners(event);
        }
    }

    emit(event: EventTypeName, ...args: EventTypeToArgs<SystemInfo>[EventTypeName]): void {
        this.events.emit(event, ...args);
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
