import { AsyncEventEmitter } from '@vladfrangu/async_event_emitter';
import type { BetterIntervalID } from '@apify/utilities';
export interface EventManagerOptions {
    /** Interval between emitted `persistState` events in milliseconds. */
    persistStateIntervalMillis: number;
}
export declare enum EventType {
    PERSIST_STATE = "persistState",
    SYSTEM_INFO = "systemInfo",
    MIGRATING = "migrating",
    ABORTING = "aborting",
    EXIT = "exit",
    STATUS_MESSAGE = "statusMessage"
}
export type EventTypeName = EventType | 'systemInfo' | 'persistState' | 'migrating' | 'aborting' | 'exit' | 'statusMessage';
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
export declare abstract class EventManager {
    #private;
    protected events: AsyncEventEmitter<{}>;
    protected initialized: boolean;
    protected intervals: Intervals;
    protected log: import("crawlee").CrawleeLogger;
    constructor(options: EventManagerOptions);
    /**
     * Initializes the event manager by starting the `persistState` event interval.
     * This is automatically called at the beginning of `crawler.run()`.
     */
    init(): Promise<void>;
    /**
     * Clears the internal `persistState` event interval.
     * This is automatically called at the end of `crawler.run()`.
     */
    close(): Promise<void>;
    on(event: EventTypeName, listener: (...args: any[]) => any): void;
    off(event: EventTypeName, listener?: (...args: any[]) => any): void;
    emit(event: EventTypeName, ...args: unknown[]): void;
    isInitialized(): boolean;
    /**
     * @internal
     */
    listenerCount(event: EventTypeName): number;
    /**
     * @internal
     */
    listeners(event: EventTypeName): (() => Promise<unknown>)[];
    /**
     * @internal
     */
    waitForAllListenersToComplete(): Promise<boolean>;
}
export {};
