import { readFile } from 'node:fs/promises';
import { freemem, platform, totalmem } from 'node:os';

import { getMemoryInfo } from '../../../packages/core/src/system-info/memory-info.js';

vitest.mock('node:fs/promises', () => ({ readFile: vitest.fn() }));
vitest.mock('node:os', () => ({ platform: vitest.fn(), freemem: vitest.fn(), totalmem: vitest.fn() }));
vitest.mock('../../../packages/core/src/system-info/ps-tree.js', () => ({
    psTree: async () => [{ PID: String(process.pid), RSS: 40 }],
}));
vitest.mock('../../../packages/core/src/system-info/runtime.js', () => ({
    isLambda: () => false,
    getCgroupsVersion: async () => null,
}));

const mount = (root = '/', point = '/sys/fs/cgroup', version = 'cgroup2', options = 'rw') =>
    `27 20 0:23 ${root} ${point} rw,nosuid,nodev,noexec shared:4 - ${version} cgroup ${options}\n`;

let files: Record<string, string>;
function level(directory: string, limit: string | number, usage: number, v1 = false) {
    files[`${directory}/${v1 ? 'memory.limit_in_bytes' : 'memory.max'}`] = String(limit);
    files[`${directory}/${v1 ? 'memory.usage_in_bytes' : 'memory.current'}`] = String(usage);
    if (v1) files[`${directory}/memory.use_hierarchy`] = '1';
}

beforeEach(() => {
    vitest.clearAllMocks();
    files = { '/proc/self/cgroup': '0::/scope/worker\n', '/proc/self/mountinfo': mount() };
    vitest.mocked(platform).mockReturnValue('linux');
    vitest.mocked(totalmem).mockReturnValue(1000);
    vitest.mocked(freemem).mockReturnValue(800);
    vitest.mocked(readFile).mockImplementation(async (path) => {
        const value = files[String(path)];
        if (value === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        return value;
    });
});

describe('process cgroup memory budgets', () => {
    test.each([false, true])('finds host-namespace scope limits (containerized=%s)', async (containerized) => {
        level('/sys/fs/cgroup/scope/worker', 300, 100);
        expect(await getMemoryInfo({ containerized })).toMatchObject({
            totalBytes: 300,
            freeBytes: 200,
            usedBytes: 100,
            mainProcessBytes: 40,
            childProcessesBytes: 0,
        });
    });

    test('inherits the parent limit when the process group is unlimited', async () => {
        level('/sys/fs/cgroup/scope/worker', 'max\n', 80);
        level('/sys/fs/cgroup/scope', 300, 150);
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 300, freeBytes: 150, usedBytes: 150 });
    });

    test('accounts for sibling usage at a looser ancestor', async () => {
        level('/sys/fs/cgroup/scope/worker', 300, 100);
        level('/sys/fs/cgroup/scope', 500, 450);
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 300, freeBytes: 50, usedBytes: 250 });
    });

    test('clamps exhausted headroom at zero', async () => {
        level('/sys/fs/cgroup/scope/worker', 300, 350);
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 300, freeBytes: 0, usedBytes: 300 });
    });

    test('accepts a zero hard limit', async () => {
        level('/sys/fs/cgroup/scope/worker', 0, 20);
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 0, freeBytes: 0, usedBytes: 0 });
    });

    test('caps cgroup headroom by physically free memory', async () => {
        level('/sys/fs/cgroup/scope/worker', 900, 20);
        vitest.mocked(freemem).mockReturnValue(100);
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 900, freeBytes: 100, usedBytes: 800 });
    });

    test('caps a limit above physical memory', async () => {
        level('/sys/fs/cgroup/scope/worker', 2000, 1500);
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 1000, freeBytes: 500, usedBytes: 500 });
    });

    test('maps a bind-mounted subtree and stops at the mount point', async () => {
        files['/proc/self/mountinfo'] = mount('/scope', '/mounted');
        level('/mounted/worker', 300, 100);
        level('/mounted', 500, 450);
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 300, freeBytes: 50 });
        expect(vitest.mocked(readFile).mock.calls.some(([path]) => path === '/memory.max')).toBe(false);
    });

    test('maps a private cgroup namespace to its mounted root', async () => {
        files['/proc/self/cgroup'] = '0::/\n';
        files['/proc/self/mountinfo'] = mount('/host/scope');
        level('/sys/fs/cgroup', 300, 100);
        expect(await getMemoryInfo({ containerized: true })).toMatchObject({ totalBytes: 300, freeBytes: 200 });
    });

    test('decodes mount paths once, including spaces and backslashes', async () => {
        files['/proc/self/cgroup'] = '0::/my scope/worker\n';
        files['/proc/self/mountinfo'] = mount('/my\\040scope', '/mounted\\040space\\134040');
        level('/mounted space\\040/worker', 300, 100);
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 300, freeBytes: 200 });
    });

    test('finds the v1 memory controller on a hybrid host', async () => {
        files['/proc/self/cgroup'] = '0::/unified\n5:cpu,cpuacct:/cpu\n7:memory:/scope/worker\n';
        files['/proc/self/mountinfo'] += mount('/', '/memory', 'cgroup', 'rw,memory');
        level('/memory/scope/worker', 300, 100, true);
        level('/memory/scope', 500, 450, true);
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 300, freeBytes: 50 });
    });

    test('ignores the v1 unlimited sentinel and uses the finite ancestor', async () => {
        files['/proc/self/cgroup'] = '7:memory:/scope/worker\n';
        files['/proc/self/mountinfo'] = mount('/', '/memory', 'cgroup', 'rw,memory');
        level('/memory/scope/worker', '9223372036854771712', 80, true);
        level('/memory/scope', 300, 100, true);
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 300, freeBytes: 200 });
    });

    test('ignores v1 ancestor limits with hierarchical accounting disabled', async () => {
        files['/proc/self/cgroup'] = '7:memory:/scope/worker\n';
        files['/proc/self/mountinfo'] = mount('/', '/memory', 'cgroup', 'rw,memory');
        level('/memory/scope/worker', 300, 100, true);
        level('/memory/scope', 200, 150, true);
        files['/memory/scope/memory.use_hierarchy'] = '0';
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 300, freeBytes: 200 });
    });

    test('skips a mount that does not cover this process', async () => {
        files['/proc/self/mountinfo'] = mount('/other', '/wrong') + mount();
        level('/wrong', 20, 10);
        level('/sys/fs/cgroup/scope/worker', 300, 100);
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 300 });
    });

    test('does not use a stale mount whose process directory is missing', async () => {
        files['/proc/self/mountinfo'] = mount('/', '/stale') + mount();
        level('/sys/fs/cgroup/scope/worker', 300, 100);
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 300 });
    });

    test('re-reads scope membership and limits after changes', async () => {
        level('/sys/fs/cgroup/scope/worker', 300, 100);
        expect((await getMemoryInfo()).totalBytes).toBe(300);
        files['/proc/self/cgroup'] = '0::/new\n';
        level('/sys/fs/cgroup/new', 200, 100);
        expect((await getMemoryInfo()).totalBytes).toBe(200);
    });

    test.each(['max', '9223372036854771712'])('uses host memory when no finite limit exists (%s)', async (limit) => {
        level('/sys/fs/cgroup/scope/worker', limit, 900);
        vitest.mocked(totalmem).mockReturnValueOnce(1000);
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 1000, freeBytes: 800, usedBytes: 200 });
        expect(totalmem).toHaveBeenCalledOnce();
    });

    test.each(['NaN', '', '-1', '123oops', '1.5', 'Infinity'])('rejects malformed limits (%j)', async (limit) => {
        level('/sys/fs/cgroup/scope/worker', limit, 100);
        const logger = { warningOnce: vitest.fn() } as any;
        expect(await getMemoryInfo({ logger })).toMatchObject({ totalBytes: 1000, freeBytes: 800 });
        expect(logger.warningOnce).toHaveBeenCalledOnce();
    });

    test.each(['NaN', '-1', '100bytes'])('rejects malformed usage (%j)', async (usage) => {
        level('/sys/fs/cgroup/scope/worker', 300, 100);
        files['/sys/fs/cgroup/scope/worker/memory.current'] = usage;
        const logger = { warningOnce: vitest.fn() } as any;
        expect(await getMemoryInfo({ logger })).toMatchObject({ totalBytes: 1000, freeBytes: 800 });
        expect(logger.warningOnce).toHaveBeenCalledOnce();
    });

    test('warns when a cgroup control file cannot be read', async () => {
        level('/sys/fs/cgroup/scope/worker', 300, 100);
        const original = vitest.mocked(readFile).getMockImplementation()!;
        vitest.mocked(readFile).mockImplementation(async (...args) => {
            if (args[0] === '/sys/fs/cgroup/scope/worker/memory.max') {
                throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
            }
            return original(...args);
        });
        const logger = { warningOnce: vitest.fn() } as any;
        expect(await getMemoryInfo({ containerized: true, logger })).toMatchObject({
            totalBytes: 1000,
            freeBytes: 800,
        });
        expect(logger.warningOnce).toHaveBeenCalledOnce();
        expect(logger.warningOnce.mock.calls[0][0]).toContain('permission denied');
    });

    test('does not substitute a looser ancestor when a finite limit has unreadable usage', async () => {
        level('/sys/fs/cgroup/scope/worker', 300, 100);
        level('/sys/fs/cgroup/scope', 500, 200);
        delete files['/sys/fs/cgroup/scope/memory.current'];
        const logger = { warningOnce: vitest.fn() } as any;
        expect(await getMemoryInfo({ logger })).toMatchObject({ totalBytes: 1000, freeBytes: 800 });
        expect(logger.warningOnce).toHaveBeenCalledOnce();
    });

    test('uses host memory when proc metadata is unavailable', async () => {
        delete files['/proc/self/mountinfo'];
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 1000, freeBytes: 800 });
    });

    test('does not probe Linux cgroups on other platforms', async () => {
        vitest.mocked(platform).mockReturnValue('darwin');
        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 1000, freeBytes: 800 });
        expect(readFile).not.toHaveBeenCalled();
    });
});
