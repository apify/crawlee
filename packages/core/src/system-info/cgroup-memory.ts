import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';

interface MemoryHierarchy {
    directory: string;
    mountPoint: string;
    version: 'V1' | 'V2';
}

const FILE_NAMES = {
    V1: { limit: 'memory.limit_in_bytes', usage: 'memory.usage_in_bytes' },
    V2: { limit: 'memory.max', usage: 'memory.current' },
};

function unescapeMountPath(path: string): string {
    return path.replace(/\\(040|011|012|134)/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

async function locateMemoryHierarchy(): Promise<MemoryHierarchy | undefined> {
    const metadata = await Promise.all([
        readFile('/proc/self/cgroup', 'utf8'),
        readFile('/proc/self/mountinfo', 'utf8'),
    ]).catch(() => undefined);
    if (!metadata) return undefined;
    const [membership, mountInfo] = metadata;
    let v1Path: string | undefined;
    let v2Path: string | undefined;
    for (const line of membership.split('\n')) {
        const match = /^\d+:([^:]*):(\/.*)$/.exec(line);
        if (!match) continue;
        if (match[1].split(',').includes('memory')) v1Path = match[2];
        if (match[1] === '') v2Path = match[2];
    }

    const candidates: MemoryHierarchy[] = [];
    for (const line of mountInfo.split('\n')) {
        const [before, after] = line.split(' - ');
        if (!after) continue;
        const fields = before.split(' ');
        const [filesystem, , options] = after.split(' ');
        if (fields.length < 6 || !options) continue;
        const version = filesystem === 'cgroup2' ? 'V2' : 'V1';
        if (filesystem !== 'cgroup2' && (filesystem !== 'cgroup' || !options.split(',').includes('memory'))) {
            continue;
        }
        const ownPath = version === 'V2' ? v2Path : v1Path;
        if (!ownPath) continue;
        const root = unescapeMountPath(fields[3]);
        const mountPoint = unescapeMountPath(fields[4]);
        // A private cgroup namespace reports '/' even when the mount exposes a host subtree.
        const relative = ownPath === '/' ? '' : posix.relative(root, ownPath);
        if (relative === '..' || relative.startsWith('../') || posix.isAbsolute(relative)) continue;
        candidates.push({ directory: posix.join(mountPoint, relative), mountPoint, version });
    }

    // On hybrid hosts, memory can belong to v1 even when a unified hierarchy is mounted.
    candidates.sort((a, b) => Number(a.version === 'V2') - Number(b.version === 'V2'));
    for (const candidate of candidates) {
        try {
            await readFile(posix.join(candidate.directory, FILE_NAMES[candidate.version].usage), 'utf8');
            return candidate;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
    }
    return undefined;
}

function parseBytes(value: string, path: string): number {
    const trimmed = value.trim();
    const bytes = Number(trimmed);
    if (!/^\d+$/.test(trimmed) || !Number.isFinite(bytes) || bytes < 0) {
        throw new Error(`Invalid cgroup memory value in ${path}`);
    }
    return bytes;
}

/** Read the process's memory budget, including limits shared with sibling cgroups. */
export async function getCgroupMemoryInfo(
    hostTotalBytes: () => number,
    hostFreeBytes: () => number,
): Promise<{ totalBytes: number; freeBytes: number; usedBytes: number } | undefined> {
    const hierarchy = await locateMemoryHierarchy();
    if (!hierarchy) return undefined;
    const names = FILE_NAMES[hierarchy.version];
    let totalBytes = Number.POSITIVE_INFINITY;
    let freeBytes = Number.POSITIVE_INFINITY;
    let limited = false;
    let directory = hierarchy.directory;
    for (;;) {
        const limitPath = posix.join(directory, names.limit);
        let limitText: string | undefined;
        try {
            limitText = await readFile(limitPath, 'utf8');
        } catch (error) {
            // The v2 hierarchy root has no memory.max; controllers may also be absent at a level.
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        if (hierarchy.version === 'V1' && directory !== hierarchy.directory && limitText !== undefined) {
            // In v1, ancestor limits apply to descendants only with hierarchical accounting enabled.
            const hierarchical = await readFile(posix.join(directory, 'memory.use_hierarchy'), 'utf8');
            if (hierarchical.trim() !== '1') limitText = undefined;
        }
        if (limitText !== undefined && limitText.trim() !== 'max') {
            const limit = parseBytes(limitText, limitPath);
            // v1 represents unlimited memory with a page-aligned value near LONG_MAX.
            if (limit <= Number.MAX_SAFE_INTEGER) {
                const usagePath = posix.join(directory, names.usage);
                const usage = parseBytes(await readFile(usagePath, 'utf8'), usagePath);
                limited = true;
                totalBytes = Math.min(totalBytes, limit);
                freeBytes = Math.min(freeBytes, Math.max(0, limit - usage));
            }
        }
        if (directory === hierarchy.mountPoint) break;
        directory = posix.dirname(directory);
    }
    if (!limited) return undefined;
    totalBytes = Math.min(totalBytes, hostTotalBytes());
    freeBytes = Math.min(freeBytes, totalBytes, hostFreeBytes());
    return { totalBytes, freeBytes, usedBytes: totalBytes - freeBytes };
}
