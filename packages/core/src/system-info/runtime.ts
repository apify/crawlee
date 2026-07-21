import fs from 'node:fs/promises';

let isDockerPromiseCache: Promise<boolean> | undefined;

async function createIsDockerPromise() {
    const promise1 = fs
        .stat('/.dockerenv')
        .then(() => true)
        .catch(() => false);

    const promise2 = fs
        .readFile('/proc/self/cgroup', 'utf8')
        .then((content) => content.includes('docker'))
        .catch(() => false);

    const [result1, result2] = await Promise.all([promise1, promise2]);

    return result1 || result2;
}

/**
 * Returns a `Promise` that resolves to true if the code is running in a Docker container.
 */
export async function isDocker(forceReset?: boolean): Promise<boolean> {
    // Parameter forceReset is just internal for unit tests.
    if (!isDockerPromiseCache || forceReset) isDockerPromiseCache = createIsDockerPromise();

    return isDockerPromiseCache;
}

let isContainerizedResult: boolean | undefined;

/**
 * Detects if crawlee is running in a containerized environment.
 */
export async function isContainerized() {
    // Value is very unlikley to change. Cache the result after the first execution.
    if (isContainerizedResult !== undefined) {
        return isContainerizedResult;
    }

    // return false if running in aws lambda
    if (isLambda()) {
        isContainerizedResult = false;
        return isContainerizedResult;
    }

    const dockerenvCheck = fs
        .stat('/.dockerenv')
        .then(() => true)
        .catch(() => false);

    const cgroupCheck = fs
        .readFile('/proc/self/cgroup', 'utf8')
        .then((content) => content.includes('docker'))
        .catch(() => false);

    const [dockerenvResult, cgroupResult] = await Promise.all([dockerenvCheck, cgroupCheck]);

    isContainerizedResult = dockerenvResult || cgroupResult || !!process.env.KUBERNETES_SERVICE_HOST;
    return isContainerizedResult;
}

export function isLambda() {
    return !!process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
}

let _cgroupsVersion: null | 'V1' | 'V2';
/**
 * gets the cgroup version by checking for a file at /sys/fs/cgroup/memory
 * @returns "V1" or "V2" for the version of cgroup or null if cgroup is not found.
 */
export async function getCgroupsVersion(forceReset?: boolean) {
    // Parameter forceReset is just internal for unit tests.
    if (_cgroupsVersion !== undefined && !forceReset) {
        return _cgroupsVersion;
    }
    try {
        // If this directory does not exists, cgroups are not available
        await fs.access('/sys/fs/cgroup/');
    } catch (e) {
        _cgroupsVersion = null;
        return null;
    }
    _cgroupsVersion = 'V1';
    try {
        // If this directory does not exists, assume the container is using cgroups V2
        await fs.access('/sys/fs/cgroup/memory/');
    } catch (e) {
        _cgroupsVersion = 'V2';
    }
    return _cgroupsVersion;
}
