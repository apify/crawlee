import type { CrawleeLogger } from '@crawlee/types';
/**
 * Gets the "bare metal" cpu load.
 * Used in
 *  - AWS Lambda
 *  - Containers without a cGroup quota
 *  - Uncontainerized environments
 * @returns a number between 0 and 1 for the cpu load
 * @internal
 */
export declare function getCurrentCpuTicks(): number;
/**
 * Reads the cgroup cpu quota.
 * In V1, a quota of -1 means “unlimited.”
 * In V2, a first field of "max" means unlimited.
 * @param cgroupsVersion the cGroup version
 * @returns The Cpu Quota
 * @internal
 */
export declare function getCpuQuota(cgroupsVersion: string): Promise<number | null>;
/**
 * Reads the cgroup cpu period.
 * @param cgroupsVersion the cGroup version
 * @returns The Cpu quota period
 * @internal
 */
export declare function getCpuPeriod(cgroupsVersion: string): Promise<number>;
/**
 * Reads the cgroup cpu usage of the container
 *
 * @param cgroupsVersion the cGroup version
 * @returns the cpu usage
 * @internal
 */
export declare function getContainerCpuUsage(cgroupsVersion: string): Promise<number>;
/**
 * Reads the cgroup cpu usage of the system from cgroup
 *
 * @returns the cpu usage
 * @internal
 */
export declare function getSystemCpuUsage(): Promise<number>;
/**
 * a cpu sample with the container usage and system usage
 */
export interface CpuSample {
    containerUsage: number;
    systemUsage: number;
}
/**
 * Takes a CPU usage sample for both the container and the system.
 *
 * @returns An object containing the container and system CPU usage.
 * @internal
 */
export declare function sampleCpuUsage(cGroupsVersion: string): Promise<CpuSample>;
/**
 * Gets the cpu usage of the system.
 * If the crawler is running in a containerized environment, crawlee will check for a cgroup enforced cpu limit.
 * If a cgroup limit is found, it will be taken as the maximum load against which the current load will be gauged.
 * @returns a number between 0 and 1 for the cpu load
 * @internal
 */
export declare function getCurrentCpuTicksV2(options?: {
    containerized?: boolean;
    logger?: CrawleeLogger;
}): Promise<number>;
