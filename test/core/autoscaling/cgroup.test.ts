import { access, readFile } from 'node:fs/promises';

import { getCgroupController } from '../../../packages/core/src/system-info/cgroup.js';

vitest.mock('node:fs/promises', async (importActual) => {
    const originalFs: typeof import('node:fs/promises') = await importActual();
    return {
        ...originalFs,
        readFile: vitest.fn(),
        access: vitest.fn(),
    };
});

const readFileSpy = vitest.mocked(readFile);
const accessSpy = vitest.mocked(access);

function mockProcess(cgroup: string, mountInfo: string, existingFiles: string[]) {
    readFileSpy.mockImplementation(async (path) => {
        if (path === '/proc/self/cgroup') return cgroup;
        if (path === '/proc/self/mountinfo') return mountInfo;
        throw new Error(`Unexpected path ${path}`);
    });
    accessSpy.mockImplementation(async (path) => {
        if (!existingFiles.includes(path as string)) throw new Error(`ENOENT: ${path}`);
    });
}

describe('getCgroupController()', () => {
    test('lists the cgroup of the process and its ancestors up to the mount point', async () => {
        // e.g. `systemd-run --scope -p MemoryMax=300M` or `docker run -m 300m --cgroupns=host`
        mockProcess(
            '0::/user.slice/user-1000.slice/run-u1.scope\n',
            '38 28 0:32 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime shared:10 - cgroup2 cgroup2 rw,nsdelegate\n',
            ['/sys/fs/cgroup/user.slice/user-1000.slice/run-u1.scope/memory.current'],
        );

        expect(await getCgroupController('memory', true)).toEqual({
            version: 'V2',
            dirs: [
                '/sys/fs/cgroup/user.slice/user-1000.slice/run-u1.scope',
                '/sys/fs/cgroup/user.slice/user-1000.slice',
                '/sys/fs/cgroup/user.slice',
                '/sys/fs/cgroup',
            ],
        });
    });

    test('works in a private cgroup namespace', async () => {
        mockProcess('0::/\n', '1610 1609 0:32 / /sys/fs/cgroup ro,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n', [
            '/sys/fs/cgroup/memory.current',
        ]);

        expect(await getCgroupController('memory', true)).toEqual({ version: 'V2', dirs: ['/sys/fs/cgroup'] });
    });

    test('works with a mount exposing only a subtree of the hierarchy', async () => {
        mockProcess(
            '12:memory:/docker/abc\n',
            '700 699 0:40 /docker/abc /sys/fs/cgroup/memory ro,nosuid - cgroup cgroup rw,memory\n',
            ['/sys/fs/cgroup/memory/memory.usage_in_bytes'],
        );

        expect(await getCgroupController('memory', true)).toEqual({ version: 'V1', dirs: ['/sys/fs/cgroup/memory'] });
    });

    test('decodes the escaped characters of mountinfo', async () => {
        mockProcess(
            '12:memory:/my app\n',
            '700 699 0:40 /my\\040app /sys/fs/cgroup/my\\040memory ro,nosuid - cgroup cgroup rw,memory\n',
            ['/sys/fs/cgroup/my memory/memory.usage_in_bytes'],
        );

        expect(await getCgroupController('memory', true)).toEqual({
            version: 'V1',
            dirs: ['/sys/fs/cgroup/my memory'],
        });
    });

    test('falls back to cgroup V1 when the unified hierarchy does not carry the controller', async () => {
        mockProcess(
            '0::/user.slice/a.scope\n6:memory:/user.slice/a.scope\n4:cpu,cpuacct:/user.slice/a.scope\n',
            '30 25 0:26 / /sys/fs/cgroup/unified rw - cgroup2 cgroup2 rw,nsdelegate\n' +
                '33 25 0:29 / /sys/fs/cgroup/cpu,cpuacct rw - cgroup cgroup rw,cpu,cpuacct\n' +
                '34 25 0:30 / /sys/fs/cgroup/memory rw - cgroup cgroup rw,memory\n',
            ['/sys/fs/cgroup/memory/memory.usage_in_bytes', '/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_quota_us'],
        );

        expect(await getCgroupController('memory', true)).toEqual({
            version: 'V1',
            dirs: [
                '/sys/fs/cgroup/memory/user.slice/a.scope',
                '/sys/fs/cgroup/memory/user.slice',
                '/sys/fs/cgroup/memory',
            ],
        });
        expect(await getCgroupController('cpu', true)).toEqual({
            version: 'V1',
            dirs: [
                '/sys/fs/cgroup/cpu,cpuacct/user.slice/a.scope',
                '/sys/fs/cgroup/cpu,cpuacct/user.slice',
                '/sys/fs/cgroup/cpu,cpuacct',
            ],
        });
    });

    test('returns null without cgroups', async () => {
        readFileSpy.mockRejectedValue(new Error('ENOENT'));

        expect(await getCgroupController('memory', true)).toBeNull();
    });
});
