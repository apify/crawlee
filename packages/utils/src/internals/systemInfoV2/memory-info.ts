import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { freemem, totalmem } from 'node:os';

import log from '@apify/log';

import { getCgroupsVersion, isContainerized, isLambda } from '../general';
import { psTree } from './ps-tree';

const MEMORY_FILE_PATHS = {
    TOTAL: {
        V1: '/sys/fs/cgroup/memory/memory.limit_in_bytes',
        V2: '/sys/fs/cgroup/memory.max',
    },
    USED: {
        V1: '/sys/fs/cgroup/memory/memory.usage_in_bytes',
        V2: '/sys/fs/cgroup/memory.current',
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
 * If the process runs inside of a container, the `getMemoryInfo` gets container memory limits,
 * otherwise it gets system memory limits.
 *
 * Beware that the function is quite inefficient because it spawns a new process.
 * Therefore you shouldn't call it too often, like more than once per second.
 */
export async function getMemoryInfoV2(): Promise<MemoryInfo> {
    const isContainerizedVar = await isContainerized();

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

        log.debug(`lambda size of ${totalBytes} with ${freeBytes} free bytes`);
    } else if (isContainerizedVar) {
        // When running inside a container, use container memory limits

        const cgroupsVersion = await getCgroupsVersion()

        try {
            if (cgroupsVersion === null) {
              throw new Error("cgroup not available")
            }
            let [totalBytesStr, usedBytesStr] = await Promise.all([
                readFile(MEMORY_FILE_PATHS.TOTAL[cgroupsVersion], 'utf8'),
                readFile(MEMORY_FILE_PATHS.USED[cgroupsVersion], 'utf8'),
            ]);

            // Cgroups V2 files contains newline character. Getting rid of it for better handling in later part of the code.
            totalBytesStr = totalBytesStr.replace(/[^a-zA-Z0-9 ]/g, '');
            usedBytesStr = usedBytesStr.replace(/[^a-zA-Z0-9 ]/g, '');

            // Cgroups V2 contains 'max' string if memory is not limited
            // See https://git.kernel.org/pub/scm/linux/kernel/git/tj/cgroup.git/tree/Documentation/admin-guide/cgroup-v2.rst (see "memory.max")
            if (totalBytesStr === 'max') {
                totalBytes = totalmem();
                // Cgroups V1 is set to number related to platform and page size if memory is not limited
                // See https://unix.stackexchange.com/q/420906
            } else {
                totalBytes = parseInt(totalBytesStr, 10);
                const containerRunsWithUnlimitedMemory = totalBytes > Number.MAX_SAFE_INTEGER;
                if (containerRunsWithUnlimitedMemory) totalBytes = totalmem();
            }
            usedBytes = parseInt(usedBytesStr, 10);
            freeBytes = totalBytes - usedBytes;
        } catch (err) {
            // log.deprecated logs a warning only once
            log.deprecated(
                'Your environment is containerized, but your system does not support memory cgroups. ' +
                    "If you're running containers with limited memory, memory auto-scaling will not work properly.\n\n" +
                    `Cause: ${(err as Error).message}`,
            );
            totalBytes = totalmem();
            freeBytes = freemem();
            usedBytes = totalBytes - freeBytes;
        }
    } else {
        totalBytes = totalmem();
        freeBytes = freemem();
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