import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { freemem, totalmem } from 'node:os';
import { posix } from 'node:path';

import type { CrawleeLogger } from '@crawlee/types';

import { type CgroupController, getCgroupController } from './cgroup.js';
import { isLambda } from './runtime.js';
import { psTree } from './ps-tree.js';

const MEMORY_FILE_NAMES = {
    TOTAL: { V1: 'memory.limit_in_bytes', V2: 'memory.max' },
    USED: { V1: 'memory.usage_in_bytes', V2: 'memory.current' },
    // `memory.stat` keys of the inactive file cache and of its pages waiting to be written to the disk
    STAT: {
        V1: { inactive: 'total_inactive_file', dirty: 'total_dirty', writeback: 'total_writeback' },
        V2: { inactive: 'inactive_file', dirty: 'file_dirty', writeback: 'file_writeback' },
    },
};

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
 * If the process is limited by a cgroup (e.g. inside of a container), the `getMemoryInfo` gets the cgroup memory limits,
 * otherwise it gets system memory limits.
 *
 * Beware that the function is quite inefficient because it spawns a new process.
 * Therefore you shouldn't call it too often, like more than once per second.
 * @returns An object containing the free and used memory metrics.
 * @internal
 */
export async function getMemoryInfo(
    options: { containerized?: boolean; logger?: CrawleeLogger } = {},
): Promise<MemoryInfo> {
    const { containerized = false, logger } = options;
    let mainProcessBytes = -1;
    let childProcessesBytes = 0;

    // lambda does *not* have `ps` and other command line tools
    // required to extract memory usage.
    if (isLambda()) {
        // reported in bytes
        mainProcessBytes = process.memoryUsage().rss;

        // https://stackoverflow.com/a/55914335/129415
        const memInfo = execSync('cat /proc/meminfo').toString();
        const values = memInfo.split(/[\n: ]/).filter((val) => val.trim());
        // /proc/meminfo reports in kb, not bytes, the total used memory is reported by meminfo
        // subtract memory used by the main node process in order to infer memory used by any child processes
        childProcessesBytes = +values[19] * 1000 - mainProcessBytes;
    } else {
        // Query both root and child processes
        const processes = await psTree(process.pid, true);

        processes.forEach((rec) => {
            // Obtain main process' memory separately
            if (rec.PID === `${process.pid}`) {
                mainProcessBytes = rec.RSS;
                return;
            }
            childProcessesBytes += rec.RSS;
        });
    }

    let totalBytes: number;
    let usedBytes: number;
    let freeBytes: number;

    if (isLambda()) {
        // memory size is defined in megabytes
        totalBytes = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE!, 10) * 1000000;
        usedBytes = mainProcessBytes + childProcessesBytes;
        freeBytes = totalBytes - usedBytes;
    } else {
        totalBytes = totalmem();
        freeBytes = freemem();

        try {
            const cgroup = await getCgroupController('memory');
            if (cgroup === null && containerized) {
                throw new Error('cgroup not available');
            }
            const cgroupMemory = cgroup && (await getCgroupMemory(cgroup, totalBytes));
            if (cgroupMemory) {
                totalBytes = cgroupMemory.totalBytes;
                freeBytes = cgroupMemory.freeBytes;
            }
        } catch (err) {
            logger?.warningOnce(
                'Your environment is containerized, but your system does not support memory cgroups. ' +
                    "If you're running containers with limited memory, memory auto-scaling will not work properly.\n\n" +
                    `Cause: ${(err as Error).message}`,
            );
        }
        usedBytes = totalBytes - freeBytes;
    }

    return {
        totalBytes,
        freeBytes,
        usedBytes,
        mainProcessBytes,
        childProcessesBytes,
    };
}

/**
 * Reads the tightest memory limit on the cgroup chain, and the smallest room left under any of its limits. Memory is
 * charged up the whole chain, so an ancestor also counts what its other children use. A limit covering the whole
 * machine restricts nothing, which is also how cgroup V1 spells "unlimited".
 */
async function getCgroupMemory({ version, dirs }: CgroupController, machineBytes: number) {
    let totalBytes = Infinity;
    let freeBytes = Infinity;
    for (const dir of dirs) {
        // A missing limit file or `max` (NaN) means there is no limit on this level.
        const limit = Number(
            await readFile(posix.join(dir, MEMORY_FILE_NAMES.TOTAL[version]), 'utf8').catch(() => NaN),
        );
        if (Number.isNaN(limit)) continue;
        totalBytes = Math.min(totalBytes, limit);
        freeBytes = Math.min(freeBytes, Math.max(limit - (await getChargedBytes(version, dir)), 0));
    }
    if (totalBytes >= machineBytes) return null;

    return { totalBytes, freeBytes };
}

/**
 * Reads the memory charged to a cgroup without the inactive file cache, which the kernel can drop. Pages waiting to be
 * written to the disk can't be dropped until they are, so they stay counted.
 */
async function getChargedBytes(version: CgroupController['version'], dir: string) {
    const current = Number(await readFile(posix.join(dir, MEMORY_FILE_NAMES.USED[version]), 'utf8'));
    const statFile = await readFile(posix.join(dir, 'memory.stat'), 'utf8');
    const stat = Object.fromEntries(statFile.split('\n').map((line) => line.split(' ')));
    const keys = MEMORY_FILE_NAMES.STAT[version];
    const inactive = Number(stat[keys.inactive]);
    if (Number.isNaN(current) || Number.isNaN(inactive)) {
        throw new Error(`Unable to read the memory usage of ${dir}`);
    }

    // Old kernels have neither of the keys, the whole inactive cache is credited there.
    const unflushed = Math.max(Number(stat[keys.dirty] ?? 0), 0) + Math.max(Number(stat[keys.writeback] ?? 0), 0);
    return Math.max(current - Math.max(inactive - unflushed, 0), 0);
}
