import log from '@apify/log';
// @ts-expect-error We need to add typings for @apify/ps-tree
import psTree from '@apify/ps-tree';
import type { Dictionary } from '@crawlee/types';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import util from 'node:util';
import { isDocker } from './general';

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
 * If the process runs inside of Docker, the `getMemoryInfo` gets container memory limits,
 * otherwise it gets system memory limits.
 *
 * Beware that the function is quite inefficient because it spawns a new process.
 * Therefore you shouldn't call it too often, like more than once per second.
 */
export async function getMemoryInfo(): Promise<MemoryInfo> {
    const psTreePromised = util.promisify(psTree);

    // lambda does *not* have `ps` and other command line tools
    // required to extract memory usage.
    const isLambdaEnvironment = process.platform === 'linux'
        && !!process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;

    const isDockerVar = !isLambdaEnvironment && await isDocker();

    let mainProcessBytes = -1;
    let childProcessesBytes = 0;

    if (isLambdaEnvironment) {
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
        const processes = await psTreePromised(process.pid, true);

        processes.forEach((rec: Dictionary<string>) => {
            // Skip the 'ps' or 'wmic' commands used by ps-tree to query the processes
            if (rec.COMMAND === 'ps' || rec.COMMAND === 'WMIC.exe') {
                return;
            }
            const bytes = parseInt(rec.RSS, 10);
            // Obtain main process' memory separately
            if (rec.PID === `${process.pid}`) {
                mainProcessBytes = bytes;
                return;
            }
            childProcessesBytes += bytes;
        });
    }

    let totalBytes: number;
    let usedBytes: number;
    let freeBytes: number;

    if (isLambdaEnvironment) {
        // memory size is defined in megabytes
        totalBytes = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE!, 10) * 1000000;
        usedBytes = mainProcessBytes + childProcessesBytes;
        freeBytes = totalBytes - usedBytes;

        log.debug(`lambda size of ${totalBytes} with ${freeBytes} free bytes`);
    } else if (isDockerVar) {
        // When running inside Docker container, use container memory limits

        // Check whether cgroups V1 or V2 is used
        let cgroupsVersion: keyof typeof MEMORY_FILE_PATHS.TOTAL = 'V1';
        try {
            // If this directory does not exists, assume docker is using cgroups V2
            await fs.access('/sys/fs/cgroup/memory/');
        } catch {
            cgroupsVersion = 'V2';
        }

        try {
            let [totalBytesStr, usedBytesStr] = await Promise.all([
                fs.readFile(MEMORY_FILE_PATHS.TOTAL[cgroupsVersion], 'utf8'),
                fs.readFile(MEMORY_FILE_PATHS.USED[cgroupsVersion], 'utf8'),
            ]);

            // Cgroups V2 files contains newline character. Getting rid of it for better handling in later part of the code.
            totalBytesStr = totalBytesStr.replace(/[^a-zA-Z0-9 ]/g, '');
            usedBytesStr = usedBytesStr.replace(/[^a-zA-Z0-9 ]/g, '');

            // Cgroups V2 contains 'max' string if memory is not limited
            // See https://git.kernel.org/pub/scm/linux/kernel/git/tj/cgroup.git/tree/Documentation/admin-guide/cgroup-v2.rst (see "memory.max")
            if (totalBytesStr === 'max') {
                totalBytes = os.totalmem();
                // Cgroups V1 is set to number related to platform and page size if memory is not limited
                // See https://unix.stackexchange.com/q/420906
            } else {
                totalBytes = parseInt(totalBytesStr, 10);
                const containerRunsWithUnlimitedMemory = totalBytes > Number.MAX_SAFE_INTEGER;
                if (containerRunsWithUnlimitedMemory) totalBytes = os.totalmem();
            }
            usedBytes = parseInt(usedBytesStr, 10);
            freeBytes = totalBytes - usedBytes;
        } catch (err) {
            // log.deprecated logs a warning only once
            log.deprecated('Your environment is Docker, but your system does not support memory cgroups. '
                + 'If you\'re running containers with limited memory, memory auto-scaling will not work properly.\n\n'
                + `Cause: ${(err as Error).message}`);
            totalBytes = os.totalmem();
            freeBytes = os.freemem();
            usedBytes = totalBytes - freeBytes;
        }
    } else {
        totalBytes = os.totalmem();
        freeBytes = os.freemem();
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
