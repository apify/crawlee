export interface ProcessInfo {
    PPID: string;
    PID: string;
    STAT: string | null;
    RSS: number;
    COMMAND: string;
}
/**
 * Returns a promise that resolves with an array of ProcessInfo objects representing
 * the children of the given PID.
 *
 * @param pid - The PID (number or string) for which to list child processes.
 * @param includeRoot - Optional flag. When true, include the process with the given PID if found.
 *                      Defaults to false.
 * @internal
 */
export declare function psTree(pid: number | string, includeRoot?: boolean): Promise<ProcessInfo[]>;
