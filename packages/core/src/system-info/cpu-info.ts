import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { posix } from 'node:path';

import type { CrawleeLogger } from '@crawlee/types';

import { getCgroupController } from './cgroup.js';

const CPU_FILE_NAMES = {
    STAT: { V1: 'cpuacct.usage', V2: 'cpu.stat' },
    QUOTA: { V1: 'cpu.cfs_quota_us', V2: 'cpu.max' },
    PERIOD: { V1: 'cpu.cfs_period_us', V2: 'cpu.max' },
};

let CLOCK_TICKS_PER_SECOND = 100;
let CLOCK_TICKS_CHECKED = false;

const NANOSECONDS_PER_SECOND = 1e9;

const previousTicks = { idle: 0, total: 0 };
/**
 * Gets the "bare metal" cpu load.
 * Used in
 *  - AWS Lambda
 *  - Containers without a cGroup quota
 *  - Uncontainerized environments
 * @returns a number between 0 and 1 for the cpu load
 * @internal
 */
export function getCurrentCpuTicks() {
    const cpusCores = os.cpus();
    const ticks = cpusCores.reduce(
        (acc, cpu) => {
            const cpuTimes = Object.values(cpu.times);
            return {
                idle: acc.idle + cpu.times.idle,
                total: acc.total + cpuTimes.reduce((sum, num) => sum + num),
            };
        },
        { idle: 0, total: 0 },
    );
    const idleTicksDelta = ticks.idle - previousTicks.idle;
    const totalTicksDelta = ticks.total - previousTicks.total;
    Object.assign(previousTicks, ticks);
    return totalTicksDelta ? 1 - idleTicksDelta / totalTicksDelta : 0;
}

/**
 * Reads the linux tick rate.
 * @returns the number of ticks per second, or `null` if detection failed
 */
function getClockTicks(): number | null {
    try {
        return parseInt(execSync('getconf CLK_TCK').toString().trim(), 10);
    } catch {
        return null;
    }
}

/**
 * Reads the cgroup cpu quota.
 * In V1, a quota of -1 means “unlimited.”
 * In V2, a first field of "max" means unlimited.
 * @param cgroupsVersion the cGroup version
 * @param dir the cgroup directory
 * @returns The Cpu Quota
 * @internal
 */
export async function getCpuQuota(cgroupsVersion: string, dir: string): Promise<number | null> {
    if (cgroupsVersion === 'V1') {
        const quotaStr = await readFile(posix.join(dir, CPU_FILE_NAMES.QUOTA.V1), 'utf8');
        const quota = parseInt(quotaStr.trim(), 10);
        return quota === -1 ? null : quota;
    }
    // cgroup v2
    const maxStr = await readFile(posix.join(dir, CPU_FILE_NAMES.QUOTA.V2), 'utf8');
    const parts = maxStr.trim().split(/\s+/);
    if (parts[0] === 'max') {
        return null;
    }
    return parseInt(parts[0], 10);
}

/**
 * Reads the cgroup cpu period.
 * @param cgroupsVersion the cGroup version
 * @param dir the cgroup directory
 * @returns The Cpu quota period
 * @internal
 */
export async function getCpuPeriod(cgroupsVersion: string, dir: string): Promise<number> {
    if (cgroupsVersion === 'V1') {
        const quotaStr = await readFile(posix.join(dir, CPU_FILE_NAMES.PERIOD.V1), 'utf8');
        const quota = parseInt(quotaStr.trim(), 10);
        return quota;
    }
    // cgroup v2
    const maxStr = await readFile(posix.join(dir, CPU_FILE_NAMES.PERIOD.V2), 'utf8');
    const parts = maxStr.trim().split(/\s+/);
    return parseInt(parts[1], 10);
}

/**
 * Reads the cgroup cpu usage of the container
 *
 * @param cgroupsVersion the cGroup version
 * @param dir the cgroup directory
 * @returns the cpu usage
 * @internal
 */
export async function getContainerCpuUsage(cgroupsVersion: string, dir: string): Promise<number> {
    if (cgroupsVersion === 'V1') {
        const data = await readFile(posix.join(dir, CPU_FILE_NAMES.STAT.V1), 'utf8');
        return Number(data.trim());
    }
    // cgroup v2
    const data = await readFile(posix.join(dir, CPU_FILE_NAMES.STAT.V2), 'utf8');
    const lines = data.split('\n');
    let usageUsec = 0;
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] === 'usage_usec') {
            usageUsec = Number(parts[1]);
            break;
        }
    }
    // Convert microseconds to nanoseconds.
    return usageUsec * 1000;
}

/**
 * Reads the cgroup cpu usage of the system from cgroup
 *
 * @returns the cpu usage
 * @internal
 */
export async function getSystemCpuUsage() {
    const statData = await readFile('/proc/stat', 'utf8');
    const lines = statData.split('\n');
    for (const line of lines) {
        if (line.startsWith('cpu ')) {
            // Split the line and extract the first seven numeric fields:
            // user, nice, system, idle, iowait, irq, softirq
            const parts = line.split(/\s+/).slice(1, 8);
            let totalTicks = 0;
            for (const part of parts) {
                totalTicks += Number(part);
            }
            // Convert clock ticks to nanoseconds.
            return (totalTicks * NANOSECONDS_PER_SECOND) / CLOCK_TICKS_PER_SECOND;
        }
    }
    throw new Error('no cpu line'); // shouldnt ever happen
}

/**
 * a cpu sample with the container usage and system usage
 */
export interface CpuSample {
    containerUsage: number; // in nanoseconds
    systemUsage: number; // in nanoseconds
}

/**
 * Takes a CPU usage sample for both the container and the system.
 *
 * @param dir the cgroup directory
 * @returns An object containing the container and system CPU usage.
 * @internal
 */
export async function sampleCpuUsage(cGroupsVersion: string, dir: string): Promise<CpuSample> {
    const [containerUsage, systemUsage] = await Promise.all([
        getContainerCpuUsage(cGroupsVersion, dir),
        getSystemCpuUsage(),
    ]);
    return { containerUsage, systemUsage };
}

let previousSample: CpuSample = { containerUsage: 0, systemUsage: 0 };

/**
 * Gets the cpu usage of the system.
 * Crawlee checks for a cgroup enforced cpu limit (e.g. in a containerized environment) on the process cgroup and its ancestors.
 * If a cgroup limit is found, it will be taken as the maximum load against which the current load will be gauged.
 * @returns a number between 0 and 1 for the cpu load
 * @internal
 */
export async function getCurrentCpuTicksV2(
    options: { containerized?: boolean; logger?: CrawleeLogger } = {},
): Promise<number> {
    const { containerized = false, logger } = options;

    try {
        const cgroup = await getCgroupController('cpu');
        // if cgroup is not detected, return bare metal cpu limit
        if (cgroup === null) {
            if (containerized) {
                logger?.warningOnce(
                    'Your environment is containerized, but your system does not support cgroups.\n' +
                        "If you're running containers with limited cpu, cpu auto-scaling will not work properly.",
                );
            }
            return getCurrentCpuTicks();
        }
        // The tightest quota on the cgroup chain applies. If no limits are set, default to returning getCurrentCpuTicks.
        let cpuAllowance = Infinity;
        let quotaDir: string | undefined;
        for (const dir of cgroup.dirs) {
            const quota = await getCpuQuota(cgroup.version, dir).catch(() => null);
            if (quota === null) continue;
            // eg. having a 200000us quota per 100000us means the cGroup can fully use 2 cores
            const allowance = quota / (await getCpuPeriod(cgroup.version, dir));
            if (allowance < cpuAllowance) {
                cpuAllowance = allowance;
                quotaDir = dir;
            }
        }
        if (quotaDir === undefined) {
            // no cgroup limit, return host cpu load
            return getCurrentCpuTicks();
        }
        if (!CLOCK_TICKS_CHECKED) {
            const ticks = getClockTicks();
            if (ticks === null) {
                CLOCK_TICKS_PER_SECOND = 100;
                logger?.warning('Failed to get clock ticks; defaulting to 100. CPU metrics may be inaccurate.');
            } else {
                CLOCK_TICKS_PER_SECOND = ticks;
            }
            CLOCK_TICKS_CHECKED = true;
        }

        // The usage is measured where the quota applies. cgroup V1 mounts cpuacct together with cpu.
        const sample = await sampleCpuUsage(cgroup.version, quotaDir);

        const containerDelta = sample.containerUsage - previousSample.containerUsage;
        const systemDelta = sample.systemUsage - previousSample.systemUsage;

        previousSample = sample;

        const numCpus = os.cpus().length;

        // Calculate the CPU usage percentage.
        return ((containerDelta / systemDelta) * numCpus) / cpuAllowance;
    } catch (err) {
        // if anything fails, default to bare metal metrics
        logger?.warning('Cpu snapshot failed, falling back to bare-metal metrics.', { error: err as Error });
        return getCurrentCpuTicks();
    }
}
