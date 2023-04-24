import { EventManager } from './event_manager';
export declare class LocalEventManager extends EventManager {
    private previousTicks;
    /**
     * Initializes the EventManager and sets up periodic `systemInfo` and `persistState` events.
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
    private getCurrentCpuTicks;
    /**
     * Creates a SystemInfo object based on local metrics.
     */
    private createSystemInfo;
    private createCpuInfo;
    private createMemoryInfo;
    /**
     * Helper method for easier mocking.
     */
    private _getMemoryInfo;
}
//# sourceMappingURL=local_event_manager.d.ts.map