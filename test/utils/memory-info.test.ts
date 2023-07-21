import { readFile, access } from 'node:fs/promises';
import { freemem, totalmem } from 'node:os';

import { ENV_VARS } from '@apify/consts';
import { launchPuppeteer } from '@crawlee/puppeteer';
import { isDocker, getMemoryInfo } from '@crawlee/utils';

jest.mock('node:os', () => {
    const originalOs = jest.requireActual('node:os');
    return {
        ...originalOs,
        freemem: jest.fn(),
        totalmem: jest.fn(),
    };
});

jest.mock('@crawlee/utils/src/internals/general', () => {
    const original = jest.requireActual('@crawlee/utils/src/internals/general');
    return {
        ...original,
        isDocker: jest.fn(),
    };
});

jest.mock('node:fs/promises', () => {
    const originalFs: typeof import('node:fs/promises') = jest.requireActual('node:fs/promises');
    return {
        ...originalFs,
        readFile: jest.fn(originalFs.readFile),
        access: jest.fn(originalFs.access),
    };
});

afterAll(() => {
    jest.unmock('node:os');
    jest.unmock('node:fs/promises');
    jest.unmock('@crawlee/utils/src/internals/general');
});

function castToMock<T extends (...args: any[]) => any>(mock: T): jest.MockedFunction<T> {
    return mock as jest.MockedFunction<T>;
}

const isDockerSpy = castToMock(isDocker);
const freememSpy = castToMock(freemem);
const totalmemSpy = castToMock(totalmem);
const accessSpy = castToMock(access);
// If you use this spy, make sure to reset it to the original implementation at the end of the test.
const readFileSpy = castToMock(readFile);

describe('getMemoryInfo()', () => {
    test('works WITHOUT child process outside the container', async () => {
        isDockerSpy.mockResolvedValueOnce(false);
        freememSpy.mockReturnValueOnce(222);
        totalmemSpy.mockReturnValueOnce(333);

        const data = await getMemoryInfo();

        expect(freemem).toHaveBeenCalled();
        expect(totalmem).toHaveBeenCalled();

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

        const originalSpyImplementation = readFileSpy.getMockImplementation()!;
        readFileSpy.mockImplementation((path) => {
            if (path === '/sys/fs/cgroup/memory/memory.limit_in_bytes') {
                return Promise.resolve('333');
            }

            if (path === '/sys/fs/cgroup/memory/memory.usage_in_bytes') {
                return Promise.resolve('111');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        try {
            const data = await getMemoryInfo();

            expect(data).toMatchObject({
                totalBytes: 333,
                freeBytes: 222,
                usedBytes: 111,
            });

            expect(data.mainProcessBytes).toBeGreaterThanOrEqual(20_000_000);
        } finally {
            readFileSpy.mockImplementation(originalSpyImplementation);
        }
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

            expect(freemem).toHaveBeenCalled();
            expect(totalmem).toHaveBeenCalled();
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

        const originalSpyImplementation = readFileSpy.getMockImplementation()!;
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
            readFileSpy.mockImplementation(originalSpyImplementation);
            delete process.env.CRAWLEE_HEADLESS;
            await browser?.close();
        }
    });

    test('works with cgroup V1 with LIMITED memory', async () => {
        isDockerSpy.mockResolvedValueOnce(true);
        accessSpy.mockResolvedValueOnce();

        const originalSpyImplementation = readFileSpy.getMockImplementation()!;
        readFileSpy.mockImplementation((path) => {
            if (path === '/sys/fs/cgroup/memory/memory.limit_in_bytes') {
                return Promise.resolve('333');
            }

            if (path === '/sys/fs/cgroup/memory/memory.usage_in_bytes') {
                return Promise.resolve('111');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        try {
            const data = await getMemoryInfo();
            expect(data).toMatchObject({
                totalBytes: 333,
                freeBytes: 222,
                usedBytes: 111,
            });
        } finally {
            readFileSpy.mockImplementation(originalSpyImplementation);
        }
    });

    test('works with cgroup V1 with UNLIMITED memory', async () => {
        isDockerSpy.mockResolvedValueOnce(true);
        accessSpy.mockResolvedValueOnce();

        const originalSpyImplementation = readFileSpy.getMockImplementation()!;
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

        try {
            const data = await getMemoryInfo();
            expect(data).toMatchObject({
                totalBytes: 333,
                freeBytes: 222,
                usedBytes: 111,
            });
        } finally {
            readFileSpy.mockImplementation(originalSpyImplementation);
        }
    });

    test('works with cgroup V2 with LIMITED memory', async () => {
        isDockerSpy.mockResolvedValueOnce(true);
        accessSpy.mockRejectedValueOnce(new Error('ENOENT'));

        const originalSpyImplementation = readFileSpy.getMockImplementation()!;
        readFileSpy.mockImplementation((path) => {
            if (path === '/sys/fs/cgroup/memory.max') {
                return Promise.resolve('333\n');
            }

            if (path === '/sys/fs/cgroup/memory.current') {
                return Promise.resolve('111\n');
            }

            throw new Error(`Unexpected path ${path}`);
        });

        try {
            const data = await getMemoryInfo();
            expect(data).toMatchObject({
                totalBytes: 333,
                freeBytes: 222,
                usedBytes: 111,
            });
        } finally {
            readFileSpy.mockImplementation(originalSpyImplementation);
        }
    });

    test('works with cgroup V2 with UNLIMITED memory', async () => {
        isDockerSpy.mockResolvedValueOnce(true);
        accessSpy.mockRejectedValueOnce(new Error('ENOENT'));

        const originalSpyImplementation = readFileSpy.getMockImplementation()!;
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

        try {
            const data = await getMemoryInfo();
            expect(data).toMatchObject({
                totalBytes: 333,
                freeBytes: 222,
                usedBytes: 111,
            });
        } finally {
            readFileSpy.mockImplementation(originalSpyImplementation);
        }
    });
});
