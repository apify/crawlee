import { AsyncEventEmitter } from '@vladfrangu/async_event_emitter';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';
import { serviceLocator } from '../service_locator.js';
export var EventType;
(function (EventType) {
    EventType["PERSIST_STATE"] = "persistState";
    EventType["SYSTEM_INFO"] = "systemInfo";
    EventType["MIGRATING"] = "migrating";
    EventType["ABORTING"] = "aborting";
    EventType["EXIT"] = "exit";
    EventType["STATUS_MESSAGE"] = "statusMessage";
})(EventType || (EventType = {}));
export class EventManager {
    events = new AsyncEventEmitter();
    initialized = false;
    intervals = {};
    log = serviceLocator.getLogger().child({ prefix: 'Events' });
    #persistStateIntervalMillis;
    constructor(options) {
        this.#persistStateIntervalMillis = options.persistStateIntervalMillis;
        // One MIGRATING listener per RequestQueue, and ThrottlingRequestManager opens one per domain.
        this.events.setMaxListeners(150);
    }
    /**
     * Initializes the event manager by starting the `persistState` event interval.
     * This is automatically called at the beginning of `crawler.run()`.
     */
    async init() {
        if (this.initialized) {
            return;
        }
        this.intervals.persistState = betterSetInterval((intervalCallback) => {
            this.emit(EventType.PERSIST_STATE, { isMigrating: false });
            intervalCallback();
        }, this.#persistStateIntervalMillis);
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
        betterClearInterval(this.intervals.persistState);
        this.initialized = false;
        // Emit final PERSIST_STATE event
        this.emit(EventType.PERSIST_STATE, { isMigrating: false });
        // Wait for PERSIST_STATE to process
        await this.waitForAllListenersToComplete();
    }
    on(event, listener) {
        this.events.on(event, listener);
    }
    off(event, listener) {
        if (listener) {
            this.events.removeListener(event, listener);
        }
        else {
            this.events.removeAllListeners(event);
        }
    }
    emit(event, ...args) {
        this.events.emit(event, ...args);
    }
    isInitialized() {
        return this.initialized;
    }
    /**
     * @internal
     */
    listenerCount(event) {
        return this.events.listenerCount(event);
    }
    /**
     * @internal
     */
    listeners(event) {
        return this.events.listeners(event);
    }
    /**
     * @internal
     */
    async waitForAllListenersToComplete() {
        return this.events.waitForAllListenersToComplete();
    }
}
