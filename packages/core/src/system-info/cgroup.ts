import { access, readFile } from 'node:fs/promises';
import { posix } from 'node:path';

/**
 * The cgroup directories holding the files of one controller for the current process.
 * @internal
 */
export interface CgroupController {
    version: 'V1' | 'V2';
    /** The cgroup of the process first, then its ancestors up to the mount point. A limit on any of them applies. */
    dirs: string[];
}

type ControllerName = 'memory' | 'cpu' | 'cpuacct';

/** Files that exist only where the hierarchy carries the controller. */
const PROBE_FILES: Record<ControllerName, Partial<Record<CgroupController['version'], string>>> = {
    memory: { V1: 'memory.usage_in_bytes', V2: 'memory.current' },
    cpu: { V1: 'cpu.cfs_quota_us', V2: 'cpu.max' },
    // cgroup V1 can mount cpuacct apart from cpu, V2 has no such controller.
    cpuacct: { V1: 'cpuacct.usage' },
};

const controllers = new Map<ControllerName, Promise<CgroupController | null>>();

/**
 * Locates the cgroup of the current process and its ancestors from `/proc/self/cgroup` and `/proc/self/mountinfo`,
 * instead of assuming that the process sits at the root of `/sys/fs/cgroup`. The result is cached.
 * @returns `null` if no mounted hierarchy carries the controller, e.g. outside of Linux.
 * @internal
 */
export async function getCgroupController(
    name: ControllerName,
    forceReset?: boolean,
): Promise<CgroupController | null> {
    // Parameter forceReset is just internal for unit tests.
    if (!controllers.has(name) || forceReset) controllers.set(name, locateController(name));
    return controllers.get(name)!;
}

async function locateController(name: ControllerName): Promise<CgroupController | null> {
    let cgroups: string;
    let mountInfo: string;
    try {
        [cgroups, mountInfo] = await Promise.all([
            readFile('/proc/self/cgroup', 'utf8'),
            readFile('/proc/self/mountinfo', 'utf8'),
        ]);
    } catch {
        return null;
    }

    // `<id>:<controllers>:<path>`, the unified (V2) hierarchy lists no controllers.
    const ownPaths: Partial<Record<CgroupController['version'], string>> = {};
    for (const line of cgroups.split('\n')) {
        const [, controllerList, path] = /^\d+:([^:]*):(.+)$/.exec(line) ?? [];
        if (controllerList === '') ownPaths.V2 = path;
        else if (controllerList?.split(',').includes(name)) ownPaths.V1 = path;
    }

    // `<id> <parent> <device> <root> <mount point> <options> [optional fields] - <type> <source> <super options>`
    const mounts = mountInfo.split('\n').flatMap((line): { version: 'V1' | 'V2'; root: string; point: string }[] => {
        const [fields, superFields] = line.split(' - ');
        const [, , , root, point] = fields.split(' ').map(unescapeMountPath);
        const [type, , options] = superFields?.split(' ') ?? [];
        if (type === 'cgroup2') return [{ version: 'V2', root, point }];
        if (type === 'cgroup' && options?.split(',').includes(name)) return [{ version: 'V1', root, point }];
        return [];
    });

    // Hybrid systems mount the unified hierarchy too, but it might not carry the controller.
    for (const version of ['V2', 'V1'] as const) {
        const ownPath = ownPaths[version];
        const probeFile = PROBE_FILES[name][version];
        if (ownPath === undefined || probeFile === undefined) continue;

        for (const mount of mounts.filter((m) => m.version === version)) {
            // A mount can expose just a subtree, paths in `/proc/self/cgroup` then start with its root.
            const relative = posix.relative(mount.root, ownPath);
            if (relative === '..' || relative.startsWith('../')) continue;

            const dirs = [mount.point];
            for (const part of relative.split('/').filter(Boolean)) dirs.unshift(posix.join(dirs[0], part));

            for (const dir of dirs) {
                try {
                    await access(posix.join(dir, probeFile));
                } catch {
                    continue;
                }
                return { version, dirs };
            }
        }
    }

    return null;
}

/** mountinfo escapes spaces, tabs, newlines and backslashes as octal, e.g. `\040`. */
function unescapeMountPath(path: string): string {
    return path.replace(/\\([0-7]{3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}
