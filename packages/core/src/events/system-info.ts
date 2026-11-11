/**
 * Represents the current status of the system.
 */
export interface SystemInfo {
    /** If false, system is being overloaded. */
    isSystemIdle: boolean;
    memInfo: LoadSignalInfo;
    eventLoopInfo: LoadSignalInfo;
    cpuInfo: LoadSignalInfo;
    storageBackendInfo: LoadSignalInfo;
    memTotalBytes?: number;
    memCurrentBytes?: number;
    /**
     * Platform only property
     * @internal
     */
    cpuCurrentUsage?: number;
    /**
     * Platform only property
     * @internal
     */
    isCpuOverloaded?: boolean;
    /**
     * Platform only property
     * @internal
     */
    createdAt?: Date;

    /**
     * Status of additional load signals beyond the built-in four.
     * Keys are `LoadSignal.name` values, values are overload info.
     */
    loadSignalInfo?: Record<string, LoadSignalInfo>;
}

export interface LoadSignalInfo {
    isOverloaded: boolean;
    limitRatio: number;
    actualRatio: number;
}
