import { readFile } from 'node:fs/promises';
import os from 'node:os';

import { getCgroupsVersion } from '@crawlee/utils';

import {
    getContainerCpuUsage,
    getCpuPeriod,
    getCpuQuota,
    getCurrentCpuTicks,
    getCurrentCpuTicksV2,
    getSystemCpuUsage,
    sampleCpuUsage,
} from '../../packages/utils/src/internals/systemInfoV2/cpu-info.js';

vitest.mock('@crawlee/utils/src/internals/general', async (importActual) => {
    const original: typeof import('@crawlee/utils') = await importActual();
    return {
        ...original,
        getCgroupsVersion: vitest.fn(),
    };
});

vitest.mock('node:fs/promises', async (importActual) => {
    const originalFs: typeof import('node:fs/promises') = await importActual();
    return {
        ...originalFs,
        readFile: vitest.fn(originalFs.readFile),
    };
});

const getCgroupsVersionSpy = vitest.mocked(getCgroupsVersion);
const readFileSpy = vitest.mocked(readFile);

describe('getCurrentCpuTicks()', () => {
    test('calculates cpu load based on os.cpus', () => {
        // For two CPUs, we simulate:
        // CPU 1: { user: 100, nice: 0, sys: 50, idle: 50, irq: 0 }  → total = 200, idle = 50
        // CPU 2: { user: 200, nice: 0, sys: 100, idle: 100, irq: 0 } → total = 400, idle = 100
        // Combined: total = 600, idle = 150 → load = 1 - (150/600) = 0.75
        const cpusMock = vitest
            .spyOn(os, 'cpus')
            .mockReturnValue([
                { times: { user: 100, nice: 0, sys: 50, idle: 50, irq: 0 } },
                { times: { user: 200, nice: 0, sys: 100, idle: 100, irq: 0 } },
            ] as os.CpuInfo[]);
        const load = getCurrentCpuTicks();
        expect(load).toBeCloseTo(0.75);
        cpusMock.mockRestore();
    });
});

describe('getCpuQuota()', () => {
    test('V1: returns null for unlimited quota (-1)', async () => {
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpu/cpu.cfs_quota_us') {
                return Promise.resolve('-1\n');
            }
            throw new Error(`Unexpected path ${path}`);
        });
        const quota = await getCpuQuota('V1');
        expect(quota).toBeNull();
    });

    test('V1: returns numeric quota', async () => {
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpu/cpu.cfs_quota_us') {
                return Promise.resolve('200000\n');
            }
            throw new Error(`Unexpected path ${path}`);
        });
        const quota = await getCpuQuota('V1');
        expect(quota).toEqual(200000);
    });

    test('V2: returns null for unlimited quota ("max")', async () => {
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpu.max') {
                return Promise.resolve('max 100000');
            }
            throw new Error(`Unexpected path ${path}`);
        });
        const quota = await getCpuQuota('V2');
        expect(quota).toBeNull();
    });

    test('V2: returns numeric quota', async () => {
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpu.max') {
                return Promise.resolve('200000 100000');
            }
            throw new Error(`Unexpected path ${path}`);
        });
        const quota = await getCpuQuota('V2');
        expect(quota).toBe(200000);
    });
});

describe('getCpuPeriod()', () => {
    test('V1: returns period', async () => {
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpu/cpu.cfs_period_us') {
                return Promise.resolve('100000\n');
            }
            throw new Error(`Unexpected path ${path}`);
        });
        const period = await getCpuPeriod('V1');
        expect(period).toBe(100000);
    });

    test('V2: returns period from the second field', async () => {
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpu.max') {
                return Promise.resolve('200000 100000');
            }
            throw new Error(`Unexpected path ${path}`);
        });
        const period = await getCpuPeriod('V2');
        expect(period).toBe(100000);
    });
});

describe('getContainerCpuUsage()', () => {
    test('V1: returns container cpu usage', async () => {
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpuacct/cpuacct.usage') {
                return Promise.resolve('123456789\n');
            }
            throw new Error(`Unexpected path ${path}`);
        });
        const usage = await getContainerCpuUsage('V1');
        expect(usage).toBe(123456789);
    });

    test('V2: parses usage_usec and converts to nanoseconds', async () => {
        // Simulate a file with a line containing "usage_usec"
        const fileContent = 'other 0\nusage_usec 5000\nmoreinfo 0';
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpu.stat') {
                return Promise.resolve(fileContent);
            }
            throw new Error(`Unexpected path ${path}`);
        });
        const usage = await getContainerCpuUsage('V2');
        expect(usage).toBe(5000 * 1000);
    });
});

describe('getSystemCpuUsage()', () => {
    test('parses /proc/stat correctly', async () => {
        // Provide a fake /proc/stat file with a proper "cpu" line.
        // Example: "cpu 100 0 50 150 0 0 0" → total ticks = 300,
        // so systemUsage = (300 * 1e9) / 100 = 3000000000.
        const statContent = 'cpu 100 0 50 150 0 0 0\notherline';
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/proc/stat') {
                return Promise.resolve(statContent);
            }
            throw new Error(`Unexpected path ${path}`);
        });
        const usage = await getSystemCpuUsage();
        expect(usage).toBeCloseTo(3000000000);
    });

    test('throws error if no cpu line is found', async () => {
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/proc/stat') {
                return Promise.resolve('no cpu info');
            }
            throw new Error(`Unexpected path ${path}`);
        });
        await expect(getSystemCpuUsage()).rejects.toThrow('no cpu line');
    });
});

describe('sampleCpuUsage()', () => {
    test('returns a valid CpuSample for V1', async () => {
        // For V1, getContainerCpuUsage reads from its stat file and
        // getSystemCpuUsage reads from /proc/stat.
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpuacct/cpuacct.usage') {
                return Promise.resolve('1000000\n');
            }
            if (path === '/proc/stat') {
                return Promise.resolve('cpu 100 0 50 150 0 0 0\n');
            }

            throw new Error(`Unexpected path ${path}`);
        });
        const sample = await sampleCpuUsage('V1');
        expect(sample).toEqual({
            containerUsage: 1000000,
            systemUsage: 3000000000, // as computed above.
        });
    });

    test('returns a valid CpuSample for V2', async () => {
        // For V1, getContainerCpuUsage reads from its stat file and
        // getSystemCpuUsage reads from /proc/stat.
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpu.stat') {
                return Promise.resolve('other 0\nusage_usec 1000\nmoreinfo 0');
            }
            if (path === '/proc/stat') {
                return Promise.resolve('cpu 100 0 50 150 0 0 0\n');
            }

            throw new Error(`Unexpected path ${path}`);
        });
        const sample = await sampleCpuUsage('V2');
        expect(sample).toEqual({
            containerUsage: 1000000,
            systemUsage: 3000000000, // as computed above.
        });
    });
});

describe('getCpuInfo()', () => {
    test('returns bare metal cpu ticks in AWS Lambda environment', async () => {
        // Simulate AWS Lambda by setting the env variable.
        process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = '128';
        const cpusMock = vitest
            .spyOn(os, 'cpus')
            .mockReturnValue([{ times: { user: 100, nice: 0, sys: 50, idle: 50, irq: 0 } }] as os.CpuInfo[]);
        const load = await getCurrentCpuTicksV2();
        // For one CPU: total = 100+0+50+50 = 200, idle = 50 → load = 0.75.
        expect(load).toBeCloseTo(0.75);
        cpusMock.mockRestore();
        delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
    });

    test('returns bare metal cpu ticks when not containerized', async () => {
        const cpusMock = vitest
            .spyOn(os, 'cpus')
            .mockReturnValue([{ times: { user: 200, nice: 0, sys: 100, idle: 100, irq: 0 } }] as os.CpuInfo[]);
        const load = await getCurrentCpuTicksV2();
        // For one CPU: total = 200+0+100+100 = 400, idle = 100 → load = 0.75.
        expect(load).toBeCloseTo(0.75);
        cpusMock.mockRestore();
    });

    test('returns container-aware cpu usage when containerized with quota set', async () => {
        getCgroupsVersionSpy.mockResolvedValueOnce('V1');
        // For V1:
        // - getCpuQuota: return 200000 → quota = 200000.
        // - getCpuPeriod: return 100000 → period = 100000.
        //   cpuAllowance = quota/period = 2.
        // - sampleCpuUsage: returns container usage and system usage.
        //   For container usage, simulate "1000000000\n"
        //   For system usage, simulate a /proc/stat line with 300 total ticks,
        //   so systemUsage = (300 * 1e9) / 100 = 3000000000.
        readFileSpy
            .mockResolvedValueOnce('200000\n') // for getCpuQuota
            .mockResolvedValueOnce('100000\n') // for getCpuPeriod
            .mockResolvedValueOnce('1000000000\n') // for getContainerCpuUsage
            .mockResolvedValueOnce('cpu 300 0 0 0 0 0 0\n'); // for getSystemCpuUsage
        // Simulate a system with 2 CPUs.
        const cpusMock = vitest
            .spyOn(os, 'cpus')
            .mockReturnValue([
                { times: { user: 200, nice: 0, sys: 100, idle: 100, irq: 0 } },
                { times: { user: 200, nice: 0, sys: 100, idle: 100, irq: 0 } },
            ] as os.CpuInfo[]);
        // Initially, previousSample is { containerUsage: 0, systemUsage: 0 }.
        const result = await getCurrentCpuTicksV2(true);
        // Calculation:
        // containerDelta = 1000000, systemDelta = 3000000000, numCpus = 2, cpuAllowance = 2.
        // So: ((1000000000 / 3000000000) * 2) / 2 ≈ 0.3333
        expect(result).toBeCloseTo(0.3333, 4);
        cpusMock.mockRestore();
    });

    test('returns bare metal cpu ticks when containerized but no cgroup quota', async () => {
        getCgroupsVersionSpy.mockResolvedValueOnce('V1');
        // For V1, a quota of "-1" signals no limit → quota becomes null.
        readFileSpy.mockResolvedValueOnce('-1\n'); // getCpuQuota returns null
        // In this branch, getCpuInfo falls back to getCurrentCpuTicks.
        const cpusMock = vitest
            .spyOn(os, 'cpus')
            .mockReturnValue([{ times: { user: 300, nice: 0, sys: 150, idle: 150, irq: 0 } }] as os.CpuInfo[]);
        const result = await getCurrentCpuTicksV2(true);
        // For one CPU: total = 300+0+150+150 = 600, idle = 150 → load = 0.75.
        expect(result).toBeCloseTo(0.75);
        cpusMock.mockRestore();
    });
});
