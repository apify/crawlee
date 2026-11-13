import { readFile } from 'node:fs/promises';
import { freemem, totalmem } from 'node:os';

import { launchPuppeteer } from '@crawlee/puppeteer';
import { getMemoryInfo } from '../../../packages/core/src/system-info/memory-info.js';
import { getCgroupController } from '../../../packages/core/src/system-info/cgroup.js';

vitest.mock('node:os', async (importActual) => {
    const originalOs: typeof import('node:os') = await importActual();
    return {
        ...originalOs,
        freemem: vitest.fn(originalOs.freemem),
        totalmem: vitest.fn(originalOs.totalmem),
    };
});

vitest.mock('../../../packages/core/src/system-info/cgroup.js', () => ({
    getCgroupController: vitest.fn(async () => null),
}));

vitest.mock('node:fs/promises', async (importActual) => {
    const originalFs: typeof import('node:fs/promises') = await importActual();
    return {
        ...originalFs,
        readFile: vitest.fn(originalFs.readFile),
    };
});

const getCgroupControllerSpy = vitest.mocked(getCgroupController);
const freememSpy = vitest.mocked(freemem);
const totalmemSpy = vitest.mocked(totalmem);
// If you use this spy, make sure to reset it to the original implementation at the end of the test.
const readFileSpy = vitest.mocked(readFile);

describe('getMemoryInfoV2()', () => {
    test('works WITHOUT child process outside the container', async () => {
        freememSpy.mockReturnValueOnce(222);
        totalmemSpy.mockReturnValueOnce(333);

        const data = await getMemoryInfo();

        expect(freememSpy).toHaveBeenCalled();
        expect(totalmemSpy).toHaveBeenCalled();

        expect(data).toMatchObject({
            totalBytes: 333,
            freeBytes: 222,
            usedBytes: 111,
        });

        expect(data.mainProcessBytes).toBeGreaterThanOrEqual(20_000_000);
    });

    test('works WITHOUT child process inside the container', async () => {
        getCgroupControllerSpy.mockResolvedValueOnce({ version: 'V1', dirs: ['/sys/fs/cgroup/memory'] });

        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/memory/memory.limit_in_bytes') {
                return Promise.resolve('333');
            }

            if (path === '/sys/fs/cgroup/memory/memory.usage_in_bytes') {
                return Promise.resolve('111');
            }

            if (path === '/sys/fs/cgroup/memory/memory.stat') {
                return Promise.resolve('total_inactive_file 0\n');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        const data = await getMemoryInfo({ containerized: true });

        expect(data).toMatchObject({
            totalBytes: 333,
            freeBytes: 222,
            usedBytes: 111,
        });

        expect(data.mainProcessBytes).toBeGreaterThanOrEqual(20_000_000);
    });

    test('works WITH child process outside the container', async () => {
        process.env.CRAWLEE_HEADLESS = '1';
        freememSpy.mockReturnValueOnce(222);
        totalmemSpy.mockReturnValueOnce(333);

        let browser!: Awaited<ReturnType<typeof launchPuppeteer>>;

        try {
            browser = await launchPuppeteer();
            const data = await getMemoryInfo();

            expect(freememSpy).toHaveBeenCalled();
            expect(totalmemSpy).toHaveBeenCalled();
            expect(data).toMatchObject({
                totalBytes: 333,
                freeBytes: 222,
                usedBytes: 111,
            });
            expect(data.mainProcessBytes).toBeGreaterThanOrEqual(20_000_000);
            expect(data.childProcessesBytes).toBeGreaterThanOrEqual(20_000_000);
        } finally {
            delete process.env.CRAWLEE_HEADLESS;
            await browser?.close();
        }
    });

    test('works WITH child process inside the container', async () => {
        process.env.CRAWLEE_HEADLESS = '1';
        getCgroupControllerSpy.mockResolvedValueOnce({ version: 'V1', dirs: ['/sys/fs/cgroup/memory'] });

        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/memory/memory.limit_in_bytes') {
                return Promise.resolve('333');
            }

            if (path === '/sys/fs/cgroup/memory/memory.usage_in_bytes') {
                return Promise.resolve('111');
            }

            if (path === '/sys/fs/cgroup/memory/memory.stat') {
                return Promise.resolve('total_inactive_file 0\n');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        let browser!: Awaited<ReturnType<typeof launchPuppeteer>>;
        try {
            browser = await launchPuppeteer();
            const data = await getMemoryInfo({ containerized: true });

            expect(data).toMatchObject({
                totalBytes: 333,
                freeBytes: 222,
                usedBytes: 111,
            });
            expect(data.mainProcessBytes).toBeGreaterThanOrEqual(20_000_000);
            expect(data.childProcessesBytes).toBeGreaterThanOrEqual(20_000_000);
        } finally {
            delete process.env.CRAWLEE_HEADLESS;
            await browser?.close();
        }
    });

    test('logs warningOnce when containerized but cgroups not available', async () => {
        getCgroupControllerSpy.mockResolvedValueOnce(null);
        freememSpy.mockReturnValueOnce(222);
        totalmemSpy.mockReturnValueOnce(333);

        const logger = { warningOnce: vitest.fn(), warning: vitest.fn() } as any;
        const data = await getMemoryInfo({ containerized: true, logger });

        expect(logger.warningOnce).toHaveBeenCalledOnce();
        expect(logger.warningOnce.mock.calls[0][0]).toContain('does not support memory cgroups');
        // Should fall back to host memory
        expect(data).toMatchObject({
            totalBytes: 333,
            freeBytes: 222,
            usedBytes: 111,
        });
    });

    test('logs warningOnce when cgroup memory files are unreadable', async () => {
        getCgroupControllerSpy.mockResolvedValueOnce({ version: 'V1', dirs: ['/sys/fs/cgroup/memory'] });
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/memory/memory.limit_in_bytes') {
                return Promise.resolve('300');
            }

            throw new Error('permission denied');
        });
        freememSpy.mockReturnValueOnce(222);
        totalmemSpy.mockReturnValueOnce(333);

        const logger = { warningOnce: vitest.fn(), warning: vitest.fn() } as any;
        const data = await getMemoryInfo({ containerized: true, logger });

        expect(logger.warningOnce).toHaveBeenCalledOnce();
        expect(logger.warningOnce.mock.calls[0][0]).toContain('permission denied');
        // Should fall back to host memory
        expect(data).toMatchObject({
            totalBytes: 333,
            freeBytes: 222,
            usedBytes: 111,
        });
    });

    test('works with cgroup V1 with LIMITED memory', async () => {
        getCgroupControllerSpy.mockResolvedValueOnce({ version: 'V1', dirs: ['/sys/fs/cgroup/memory'] });

        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/memory/memory.limit_in_bytes') {
                return Promise.resolve('333');
            }

            if (path === '/sys/fs/cgroup/memory/memory.usage_in_bytes') {
                return Promise.resolve('111');
            }

            if (path === '/sys/fs/cgroup/memory/memory.stat') {
                return Promise.resolve('total_inactive_file 0\n');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        const data = await getMemoryInfo({ containerized: true });
        expect(data).toMatchObject({
            totalBytes: 333,
            freeBytes: 222,
            usedBytes: 111,
        });
    });

    test('works with cgroup V1 with UNLIMITED memory', async () => {
        getCgroupControllerSpy.mockResolvedValueOnce({ version: 'V1', dirs: ['/sys/fs/cgroup/memory'] });

        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/memory/memory.limit_in_bytes') {
                return Promise.resolve('9223372036854771712');
            }

            if (path === '/sys/fs/cgroup/memory/memory.usage_in_bytes') {
                return Promise.resolve('111');
            }

            if (path === '/sys/fs/cgroup/memory/memory.stat') {
                return Promise.resolve('total_inactive_file 0\n');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        totalmemSpy.mockReturnValueOnce(333);
        freememSpy.mockReturnValueOnce(222);

        const data = await getMemoryInfo({ containerized: true });
        expect(data).toMatchObject({
            totalBytes: 333,
            freeBytes: 222,
            usedBytes: 111,
        });
    });

    test('works with cgroup V2 with LIMITED memory', async () => {
        getCgroupControllerSpy.mockResolvedValueOnce({ version: 'V2', dirs: ['/sys/fs/cgroup'] });

        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/memory.max') {
                return Promise.resolve('333\n');
            }

            if (path === '/sys/fs/cgroup/memory.current') {
                return Promise.resolve('111\n');
            }

            if (path === '/sys/fs/cgroup/memory.stat') {
                return Promise.resolve('inactive_file 0\n');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        const data = await getMemoryInfo({ containerized: true });
        expect(data).toMatchObject({
            totalBytes: 333,
            freeBytes: 222,
            usedBytes: 111,
        });
    });

    test('works with cgroup V2 with UNLIMITED memory', async () => {
        getCgroupControllerSpy.mockResolvedValueOnce({ version: 'V2', dirs: ['/sys/fs/cgroup'] });

        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/memory.max') {
                return Promise.resolve('max\n');
            }

            if (path === '/sys/fs/cgroup/memory.current') {
                return Promise.resolve('111\n');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        totalmemSpy.mockReturnValueOnce(333);
        freememSpy.mockReturnValueOnce(222);

        const data = await getMemoryInfo({ containerized: true });
        expect(data).toMatchObject({
            totalBytes: 333,
            freeBytes: 222,
            usedBytes: 111,
        });
    });

    test('respects the limit of a systemd scope outside a container', async () => {
        getCgroupControllerSpy.mockResolvedValueOnce({
            version: 'V2',
            dirs: ['/sys/fs/cgroup/user.slice/run-u1.scope', '/sys/fs/cgroup/user.slice', '/sys/fs/cgroup'],
        });

        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/user.slice/run-u1.scope/memory.max') {
                return Promise.resolve('333\n');
            }

            if (path === '/sys/fs/cgroup/user.slice/run-u1.scope/memory.current') {
                return Promise.resolve('111\n');
            }

            if (path === '/sys/fs/cgroup/user.slice/run-u1.scope/memory.stat') {
                return Promise.resolve('inactive_file 0\n');
            }

            if (path === '/sys/fs/cgroup/user.slice/memory.max') {
                return Promise.resolve('max\n');
            }

            throw new Error(`ENOENT: ${path}`);
        });

        const data = await getMemoryInfo();
        expect(data).toMatchObject({
            totalBytes: 333,
            freeBytes: 222,
            usedBytes: 111,
        });
    });

    test('takes the tightest limit on the cgroup chain', async () => {
        getCgroupControllerSpy.mockResolvedValueOnce({
            version: 'V2',
            dirs: [
                '/sys/fs/cgroup/kubepods/pod1/container1',
                '/sys/fs/cgroup/kubepods/pod1',
                '/sys/fs/cgroup/kubepods',
            ],
        });

        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/kubepods/pod1/container1/memory.max') {
                return Promise.resolve('max\n');
            }

            if (path === '/sys/fs/cgroup/kubepods/pod1/memory.max') {
                return Promise.resolve('333\n');
            }

            if (path === '/sys/fs/cgroup/kubepods/pod1/memory.current') {
                return Promise.resolve('111\n');
            }

            if (path === '/sys/fs/cgroup/kubepods/pod1/memory.stat') {
                return Promise.resolve('inactive_file 0\n');
            }

            if (path === '/sys/fs/cgroup/kubepods/memory.max') {
                return Promise.resolve('999\n');
            }

            if (path === '/sys/fs/cgroup/kubepods/memory.current') {
                return Promise.resolve('500\n');
            }

            if (path === '/sys/fs/cgroup/kubepods/memory.stat') {
                return Promise.resolve('inactive_file 0\n');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        const data = await getMemoryInfo({ containerized: true });
        expect(data).toMatchObject({
            totalBytes: 333,
            freeBytes: 222,
            usedBytes: 111,
        });
    });

    test('does not count the file cache the kernel can drop as used', async () => {
        getCgroupControllerSpy.mockResolvedValueOnce({ version: 'V2', dirs: ['/sys/fs/cgroup'] });
        const files: Record<string, string> = {
            '/sys/fs/cgroup/memory.max': '1000\n',
            '/sys/fs/cgroup/memory.current': '600\n',
            // Only the inactive cache that is not waiting to be written to the disk can be dropped (200 bytes).
            '/sys/fs/cgroup/memory.stat': 'anon 300\ninactive_file 300\nfile_dirty 60\nfile_writeback 40\n',
        };
        readFileSpy.mockImplementation(async (path) => {
            if (typeof path === 'string' && path in files) return files[path];
            throw new Error(`Unexpected path ${path}`);
        });

        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 1000, freeBytes: 600, usedBytes: 400 });
    });

    test('takes the memory used by other cgroups under a limited ancestor into account', async () => {
        getCgroupControllerSpy.mockResolvedValueOnce({
            version: 'V2',
            dirs: ['/sys/fs/cgroup/pod/container', '/sys/fs/cgroup/pod'],
        });
        const files: Record<string, string> = {
            '/sys/fs/cgroup/pod/container/memory.max': '1000\n',
            '/sys/fs/cgroup/pod/container/memory.current': '100\n',
            '/sys/fs/cgroup/pod/container/memory.stat': 'inactive_file 0\n',
            // The other containers of the pod leave only 100 bytes under its limit.
            '/sys/fs/cgroup/pod/memory.max': '1500\n',
            '/sys/fs/cgroup/pod/memory.current': '1400\n',
            '/sys/fs/cgroup/pod/memory.stat': 'inactive_file 0\n',
        };
        readFileSpy.mockImplementation(async (path) => {
            if (typeof path === 'string' && path in files) return files[path];
            throw new Error(`Unexpected path ${path}`);
        });

        expect(await getMemoryInfo()).toMatchObject({ totalBytes: 1000, freeBytes: 100, usedBytes: 900 });
    });
});
