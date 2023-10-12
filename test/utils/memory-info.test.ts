import { readFile, access } from 'node:fs/promises';
import { freemem, totalmem } from 'node:os';

import { launchPuppeteer } from '@crawlee/puppeteer';
import { getMemoryInfo } from '@crawlee/utils';
import { isDocker } from '@crawlee/utils/src/internals/general';

vitest.mock('node:os', async (importActual) => {
    const originalOs: typeof import('node:os') = await importActual();
    return {
        ...originalOs,
        freemem: vitest.fn(),
        totalmem: vitest.fn(),
    };
});

vitest.mock('@crawlee/utils/src/internals/general', async (importActual) => {
    const original: typeof import('@crawlee/utils/src/internals/general') = await importActual();

    return {
        ...original,
        isDocker: vitest.fn(),
    };
});

vitest.mock('node:fs/promises', async (importActual) => {
    const originalFs: typeof import('node:fs/promises') = await importActual();
    return {
        ...originalFs,
        readFile: vitest.fn(originalFs.readFile),
        access: vitest.fn(originalFs.access),
    };
});

const isDockerSpy = vitest.mocked(isDocker);
const freememSpy = vitest.mocked(freemem);
const totalmemSpy = vitest.mocked(totalmem);
const accessSpy = vitest.mocked(access);
// If you use this spy, make sure to reset it to the original implementation at the end of the test.
const readFileSpy = vitest.mocked(readFile);

describe('getMemoryInfo()', () => {
    test('works WITHOUT child process outside the container', async () => {
        isDockerSpy.mockResolvedValueOnce(false);
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
        isDockerSpy.mockResolvedValueOnce(true);
        accessSpy.mockResolvedValueOnce();

        readFileSpy.mockImplementation((path) => {
            if (path === '/sys/fs/cgroup/memory/memory.limit_in_bytes') {
                return Promise.resolve('333');
            }

            if (path === '/sys/fs/cgroup/memory/memory.usage_in_bytes') {
                return Promise.resolve('111');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        const data = await getMemoryInfo();

        expect(data).toMatchObject({
            totalBytes: 333,
            freeBytes: 222,
            usedBytes: 111,
        });

        expect(data.mainProcessBytes).toBeGreaterThanOrEqual(20_000_000);
    });

    // TODO: check if this comment is still accurate
    // this test hangs because we launch the browser, closing is apparently not enough?
    test('works WITH child process outside the container', async () => {
        process.env.CRAWLEE_HEADLESS = '1';
        isDockerSpy.mockResolvedValueOnce(false);
        freememSpy.mockReturnValueOnce(222);
        totalmemSpy.mockReturnValueOnce(333);

        let browser: Awaited<ReturnType<typeof launchPuppeteer>>;
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

    // TODO: check if this comment is still accurate
    // this test hangs because we launch the browser, closing is apparently not enough?
    test('works WITH child process inside the container', async () => {
        process.env.CRAWLEE_HEADLESS = '1';
        isDockerSpy.mockResolvedValueOnce(true);
        accessSpy.mockResolvedValueOnce();

        readFileSpy.mockImplementation((path) => {
            if (path === '/sys/fs/cgroup/memory/memory.limit_in_bytes') {
                return Promise.resolve('333');
            }

            if (path === '/sys/fs/cgroup/memory/memory.usage_in_bytes') {
                return Promise.resolve('111');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        let browser: Awaited<ReturnType<typeof launchPuppeteer>>;
        try {
            browser = await launchPuppeteer();
            const data = await getMemoryInfo();

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

    test('works with cgroup V1 with LIMITED memory', async () => {
        isDockerSpy.mockResolvedValueOnce(true);
        accessSpy.mockResolvedValueOnce();

        readFileSpy.mockImplementation((path) => {
            if (path === '/sys/fs/cgroup/memory/memory.limit_in_bytes') {
                return Promise.resolve('333');
            }

            if (path === '/sys/fs/cgroup/memory/memory.usage_in_bytes') {
                return Promise.resolve('111');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        const data = await getMemoryInfo();
        expect(data).toMatchObject({
            totalBytes: 333,
            freeBytes: 222,
            usedBytes: 111,
        });
    });

    test('works with cgroup V1 with UNLIMITED memory', async () => {
        isDockerSpy.mockResolvedValueOnce(true);
        accessSpy.mockResolvedValueOnce();

        readFileSpy.mockImplementation((path) => {
            if (path === '/sys/fs/cgroup/memory/memory.limit_in_bytes') {
                return Promise.resolve('9223372036854771712');
            }

            if (path === '/sys/fs/cgroup/memory/memory.usage_in_bytes') {
                return Promise.resolve('111');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        totalmemSpy.mockReturnValueOnce(333);

        const data = await getMemoryInfo();
        expect(data).toMatchObject({
            totalBytes: 333,
            freeBytes: 222,
            usedBytes: 111,
        });
    });

    test('works with cgroup V2 with LIMITED memory', async () => {
        isDockerSpy.mockResolvedValueOnce(true);
        accessSpy.mockRejectedValueOnce(new Error('ENOENT'));

        readFileSpy.mockImplementation((path) => {
            if (path === '/sys/fs/cgroup/memory.max') {
                return Promise.resolve('333\n');
            }

            if (path === '/sys/fs/cgroup/memory.current') {
                return Promise.resolve('111\n');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        const data = await getMemoryInfo();
        expect(data).toMatchObject({
            totalBytes: 333,
            freeBytes: 222,
            usedBytes: 111,
        });
    });

    test('works with cgroup V2 with UNLIMITED memory', async () => {
        isDockerSpy.mockResolvedValueOnce(true);
        accessSpy.mockRejectedValueOnce(new Error('ENOENT'));

        readFileSpy.mockImplementation((path) => {
            if (path === '/sys/fs/cgroup/memory.max') {
                return Promise.resolve('max\n');
            }

            if (path === '/sys/fs/cgroup/memory.current') {
                return Promise.resolve('111\n');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        totalmemSpy.mockReturnValueOnce(333);

        const data = await getMemoryInfo();
        expect(data).toMatchObject({
            totalBytes: 333,
            freeBytes: 222,
            usedBytes: 111,
        });
    });
});
