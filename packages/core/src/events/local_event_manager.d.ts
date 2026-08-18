import type { Configuration } from '../configuration.js';
import { EventManager, type EventManagerOptions } from './event_manager.js';
export interface LocalEventManagerOptions extends EventManagerOptions {
    /** Interval between emitted `systemInfo` events in milliseconds. */
    systemInfoIntervalMillis: number;
}
export declare class LocalEventManager extends EventManager {
    #private;
    constructor(options: LocalEventManagerOptions);
    /**
     * Creates a new `LocalEventManager` based on the provided `Configuration`.
     * Uses the global configuration from the service locator if none is provided.
     */
    static fromConfiguration(configuration?: Configuration): LocalEventManager;
    /**
     * Initializes the EventManager and sets up periodic `systemInfo` events.
     * This is automatically called at the beginning of `crawler.run()`.
     */
    init(): Promise<void>;
    /**
     * @inheritDoc
     */
    close(): Promise<void>;
    /**
     * @internal
     */
    emitSystemInfoEvent(intervalCallback: () => unknown): Promise<void>;
    /**
     * @internal
     */
    isContainerizedWrapper(): Promise<boolean>;
    /**
     * Creates a SystemInfo object based on local metrics.
     */
    private createSystemInfo;
    private createCpuInfo;
    private createMemoryInfo;
    private getMemoryInfo;
}
