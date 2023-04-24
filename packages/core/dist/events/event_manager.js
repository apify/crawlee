"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventManager = exports.EventType = void 0;
const tslib_1 = require("tslib");
const log_1 = tslib_1.__importDefault(require("@apify/log"));
const utilities_1 = require("@apify/utilities");
const async_event_emitter_1 = require("@vladfrangu/async_event_emitter");
const configuration_1 = require("../configuration");
var EventType;
(function (EventType) {
    EventType["PERSIST_STATE"] = "persistState";
    EventType["SYSTEM_INFO"] = "systemInfo";
    EventType["MIGRATING"] = "migrating";
    EventType["ABORTING"] = "aborting";
    EventType["EXIT"] = "exit";
})(EventType = exports.EventType || (exports.EventType = {}));
class EventManager {
    constructor(config = configuration_1.Configuration.getGlobalConfig()) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        Object.defineProperty(this, "events", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new async_event_emitter_1.AsyncEventEmitter()
        });
        Object.defineProperty(this, "initialized", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "intervals", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "log", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: log_1.default.child({ prefix: 'Events' })
        });
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
        const persistStateIntervalMillis = this.config.get('persistStateIntervalMillis');
        this.intervals.persistState = (0, utilities_1.betterSetInterval)((intervalCallback) => {
            this.emit("persistState" /* EventType.PERSIST_STATE */, { isMigrating: false });
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
        (0, utilities_1.betterClearInterval)(this.intervals.persistState);
        this.initialized = false;
        // Emit final PERSIST_STATE event
        this.emit("persistState" /* EventType.PERSIST_STATE */, { isMigrating: false });
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
    waitForAllListenersToComplete() {
        return this.events.waitForAllListenersToComplete();
    }
}
exports.EventManager = EventManager;
//# sourceMappingURL=event_manager.js.map