/**
 * Describes memory usage of the process.
 */
export interface MemoryInfo {
    /** Total memory available in the system or container */
    totalBytes: number;
    /** Amount of free memory in the system or container */
    freeBytes: number;
    /** Amount of memory used (= totalBytes - freeBytes) */
    usedBytes: number;
    /** Amount of memory used the current Node.js process */
    mainProcessBytes: number;
    /** Amount of memory used by child processes of the current Node.js process */
    childProcessesBytes: number;
}
/**
 * Returns memory statistics of the process and the system, see {@apilink MemoryInfo}.
 *
 * If the process runs inside of Docker, the `getMemoryInfo` gets container memory limits,
 * otherwise it gets system memory limits.
 *
 * Beware that the function is quite inefficient because it spawns a new process.
 * Therefore you shouldn't call it too often, like more than once per second.
 */
export declare function getMemoryInfo(): Promise<MemoryInfo>;
//# sourceMappingURL=memory-info.d.ts.map