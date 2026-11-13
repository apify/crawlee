import { readFile } from 'node:fs/promises';
import os from 'node:os';

import { getCgroupController } from '../../../packages/core/src/system-info/cgroup.js';

import {
    getContainerCpuUsage,
    getCpuPeriod,
    getCpuQuota,
    getCurrentCpuTicks,
    getCurrentCpuTicksV2,
    getSystemCpuUsage,
    sampleCpuUsage,
} from '../../../packages/core/src/system-info/cpu-info.js';

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
const readFileSpy = vitest.mocked(readFile);

// `getCurrentCpuTicks` keeps a module-level baseline of the previous tick sample.
// Zero it before each test so the singleton state cannot leak between tests.
function resetCpuTicksBaseline() {
    const cpusMock = vitest
        .spyOn(os, 'cpus')
        .mockReturnValue([{ times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }] as os.CpuInfo[]);
    getCurrentCpuTicks();
    cpusMock.mockRestore();
}

beforeEach(() => {
    resetCpuTicksBaseline();
});

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

    test('measures load between samples, not cumulatively since boot', () => {
        // First sample establishes the baseline: total = 400, idle = 200.
        const firstMock = vitest
            .spyOn(os, 'cpus')
            .mockReturnValue([{ times: { user: 100, nice: 0, sys: 100, idle: 200, irq: 0 } }] as os.CpuInfo[]);
        getCurrentCpuTicks();
        firstMock.mockRestore();

        // Second sample adds 150 busy ticks and 50 idle ticks: total = 600, idle = 250.
        // Chosen so the inter-sample delta and the cumulative-since-boot ratio differ.
        const secondMock = vitest
            .spyOn(os, 'cpus')
            .mockReturnValue([{ times: { user: 175, nice: 0, sys: 175, idle: 250, irq: 0 } }] as os.CpuInfo[]);
        const load = getCurrentCpuTicks();
        secondMock.mockRestore();

        // Delta since the previous sample: idleDelta = 50, totalDelta = 200 -> 1 - 50/200 = 0.75.
        // The cumulative-since-boot ratio would be 1 - 250/600 ≈ 0.583, which the buggy
        // (baseline-never-advanced) implementation returned instead.
        expect(load).toBeCloseTo(0.75);
        expect(load).not.toBeCloseTo(1 - 250 / 600);
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
        const quota = await getCpuQuota('V1', '/sys/fs/cgroup/cpu');
        expect(quota).toBeNull();
    });

    test('V1: returns numeric quota', async () => {
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpu/cpu.cfs_quota_us') {
                return Promise.resolve('200000\n');
            }
            throw new Error(`Unexpected path ${path}`);
        });
        const quota = await getCpuQuota('V1', '/sys/fs/cgroup/cpu');
        expect(quota).toEqual(200000);
    });

    test('V2: returns null for unlimited quota ("max")', async () => {
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpu.max') {
                return Promise.resolve('max 100000');
            }
            throw new Error(`Unexpected path ${path}`);
        });
        const quota = await getCpuQuota('V2', '/sys/fs/cgroup');
        expect(quota).toBeNull();
    });

    test('V2: returns numeric quota', async () => {
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpu.max') {
                return Promise.resolve('200000 100000');
            }
            throw new Error(`Unexpected path ${path}`);
        });
        const quota = await getCpuQuota('V2', '/sys/fs/cgroup');
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
        const period = await getCpuPeriod('V1', '/sys/fs/cgroup/cpu');
        expect(period).toBe(100000);
    });

    test('V2: returns period from the second field', async () => {
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpu.max') {
                return Promise.resolve('200000 100000');
            }
            throw new Error(`Unexpected path ${path}`);
        });
        const period = await getCpuPeriod('V2', '/sys/fs/cgroup');
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
        const usage = await getContainerCpuUsage('V1', '/sys/fs/cgroup/cpuacct');
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
        const usage = await getContainerCpuUsage('V2', '/sys/fs/cgroup');
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
        const sample = await sampleCpuUsage('V1', '/sys/fs/cgroup/cpuacct');
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
        const sample = await sampleCpuUsage('V2', '/sys/fs/cgroup');
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
        getCgroupControllerSpy
            .mockResolvedValueOnce({ version: 'V1', dirs: ['/sys/fs/cgroup/cpu'] })
            .mockResolvedValueOnce({ version: 'V1', dirs: ['/sys/fs/cgroup/cpuacct'] });
        // For V1:
        // - getCpuQuota: return 100000 → quota = 100000.
        // - getCpuPeriod: return 100000 → period = 100000.
        //   cpuAllowance = quota/period = 1.
        // - sampleCpuUsage: returns container usage and system usage.
        //   For container usage, simulate "1000000000\n"
        //   For system usage, simulate a /proc/stat line with 300 total ticks,
        //   so systemUsage = (300 * 1e9) / 100 = 3000000000.
        readFileSpy
            .mockResolvedValueOnce('100000\n') // for getCpuQuota
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
        const result = await getCurrentCpuTicksV2({ containerized: true });
        // Calculation:
        // containerDelta = 1000000, systemDelta = 3000000000, numCpus = 2, cpuAllowance = 1.
        // So: ((1000000000 / 3000000000) * 2) / 1 ≈ 0.6667
        expect(result).toBeCloseTo(0.6667, 4);
        cpusMock.mockRestore();
    });

    test('logs warningOnce when containerized but cgroups not available', async () => {
        getCgroupControllerSpy.mockResolvedValueOnce(null);
        const cpusMock = vitest
            .spyOn(os, 'cpus')
            .mockReturnValue([{ times: { user: 100, nice: 0, sys: 50, idle: 50, irq: 0 } }] as os.CpuInfo[]);
        const logger = { warningOnce: vitest.fn(), warning: vitest.fn() } as any;
        await getCurrentCpuTicksV2({ containerized: true, logger });
        expect(logger.warningOnce).toHaveBeenCalledOnce();
        expect(logger.warningOnce.mock.calls[0][0]).toContain('does not support cgroups');
        cpusMock.mockRestore();
    });

    test('logs warningOnce when cgroup cpu snapshot fails', async () => {
        getCgroupControllerSpy
            .mockResolvedValueOnce({ version: 'V1', dirs: ['/sys/fs/cgroup/cpu'] })
            .mockResolvedValueOnce({ version: 'V1', dirs: ['/sys/fs/cgroup/cpuacct'] });
        readFileSpy
            .mockResolvedValueOnce('50000\n') // for getCpuQuota
            .mockResolvedValueOnce('100000\n') // for getCpuPeriod
            .mockRejectedValue(new Error('permission denied'));
        const cpusMock = vitest
            .spyOn(os, 'cpus')
            .mockReturnValue([{ times: { user: 100, nice: 0, sys: 50, idle: 50, irq: 0 } }] as os.CpuInfo[]);
        const logger = { warningOnce: vitest.fn(), warning: vitest.fn() } as any;
        const result = await getCurrentCpuTicksV2({ containerized: true, logger });
        expect(logger.warningOnce).toHaveBeenCalledOnce();
        expect(logger.warningOnce.mock.calls[0][0]).toContain('Cpu snapshot failed');
        expect(logger.warningOnce.mock.calls[0][0]).toContain('permission denied');
        // Should fall back to bare metal
        expect(result).toBeCloseTo(0.75);
        cpusMock.mockRestore();
    });

    test('returns bare metal cpu ticks when containerized but no cgroup quota', async () => {
        getCgroupControllerSpy.mockResolvedValueOnce({ version: 'V1', dirs: ['/sys/fs/cgroup/cpu'] });
        // For V1, a quota of "-1" signals no limit → quota becomes null.
        readFileSpy.mockResolvedValueOnce('-1\n'); // getCpuQuota returns null
        // In this branch, getCpuInfo falls back to getCurrentCpuTicks.
        const cpusMock = vitest
            .spyOn(os, 'cpus')
            .mockReturnValue([{ times: { user: 300, nice: 0, sys: 150, idle: 150, irq: 0 } }] as os.CpuInfo[]);
        const result = await getCurrentCpuTicksV2({ containerized: true });
        // For one CPU: total = 300+0+150+150 = 600, idle = 150 → load = 0.75.
        expect(result).toBeCloseTo(0.75);
        cpusMock.mockRestore();
    });

    test('uses the tightest quota on the cgroup chain, also outside a container', async () => {
        const controller = {
            version: 'V2' as const,
            dirs: ['/sys/fs/cgroup/user.slice/run-u1.scope', '/sys/fs/cgroup/user.slice', '/sys/fs/cgroup'],
        };
        getCgroupControllerSpy.mockResolvedValueOnce(controller).mockResolvedValueOnce(controller);

        let usageUsec = 0;
        let systemTicks = 0;
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/user.slice/run-u1.scope/cpu.max') return 'max 100000\n';
            if (path === '/sys/fs/cgroup/user.slice/cpu.max') return '100000 100000\n';
            if (path === '/sys/fs/cgroup/user.slice/cpu.stat') return `usage_usec ${(usageUsec += 1_000_000)}\n`;
            if (path === '/proc/stat') return `cpu ${(systemTicks += 300)} 0 0 0 0 0 0\n`;
            throw new Error(`ENOENT: ${path}`);
        });
        const cpusMock = vitest
            .spyOn(os, 'cpus')
            .mockReturnValue([
                { times: { user: 200, nice: 0, sys: 100, idle: 100, irq: 0 } },
                { times: { user: 200, nice: 0, sys: 100, idle: 100, irq: 0 } },
            ] as os.CpuInfo[]);

        // The first call only sets the baseline sample.
        await getCurrentCpuTicksV2();
        const result = await getCurrentCpuTicksV2();
        // 1 s of slice cpu time per 3 s of system cpu time on 2 CPUs, against an allowance of 1 core.
        expect(result).toBeCloseTo(2 / 3, 4);
        cpusMock.mockRestore();
    });

    test('returns bare metal cpu ticks when the quota covers all cpus of the machine', async () => {
        getCgroupControllerSpy.mockResolvedValueOnce({ version: 'V2', dirs: ['/sys/fs/cgroup'] });
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpu.max') return '300000 100000\n';
            if (path === '/sys/fs/cgroup/cpu.stat') return 'usage_usec 1000000\n';
            if (path === '/proc/stat') return 'cpu 300 0 0 0 0 0 0\n';
            throw new Error(`ENOENT: ${path}`);
        });
        const cpusMock = vitest
            .spyOn(os, 'cpus')
            .mockReturnValue([
                { times: { user: 100, nice: 0, sys: 50, idle: 50, irq: 0 } },
                { times: { user: 100, nice: 0, sys: 50, idle: 50, irq: 0 } },
            ] as os.CpuInfo[]);

        const result = await getCurrentCpuTicksV2({ containerized: true });
        expect(result).toBeCloseTo(0.75);
        expect(readFileSpy).not.toHaveBeenCalledWith('/sys/fs/cgroup/cpu.stat', 'utf8');
        cpusMock.mockRestore();
    });

    test('gauges the load against the cpus available to the process (e.g. a cpuset)', async () => {
        getCgroupControllerSpy.mockResolvedValue({ version: 'V2', dirs: ['/sys/fs/cgroup'] });
        let usageUsec = 0;
        let systemTicks = 0;
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpu.max') return 'max 100000\n';
            if (path === '/sys/fs/cgroup/cpu.stat') return `usage_usec ${(usageUsec += 1_000_000)}\n`;
            if (path === '/proc/stat') return `cpu ${(systemTicks += 300)} 0 0 0 0 0 0\n`;
            throw new Error(`ENOENT: ${path}`);
        });
        vitest.spyOn(os, 'availableParallelism').mockReturnValue(1);
        const cpusMock = vitest
            .spyOn(os, 'cpus')
            .mockReturnValue([
                { times: { user: 200, nice: 0, sys: 100, idle: 100, irq: 0 } },
                { times: { user: 200, nice: 0, sys: 100, idle: 100, irq: 0 } },
            ] as os.CpuInfo[]);

        await getCurrentCpuTicksV2();
        const result = await getCurrentCpuTicksV2();
        // 1 s of cgroup cpu time per 3 s of system cpu time on 2 CPUs, against 1 available cpu.
        expect(result).toBeCloseTo(2 / 3, 4);
        cpusMock.mockRestore();
    });

    test('reads the usage from a separately mounted cpuacct hierarchy', async () => {
        getCgroupControllerSpy.mockImplementation(async (name) => ({
            version: 'V1',
            dirs: [`/sys/fs/cgroup/${name}/a.scope`, `/sys/fs/cgroup/${name}`],
        }));
        let usageNs = 0;
        let systemTicks = 0;
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/cpu/a.scope/cpu.cfs_quota_us') return '-1\n';
            if (path === '/sys/fs/cgroup/cpu/cpu.cfs_quota_us') return '100000\n';
            if (path === '/sys/fs/cgroup/cpu/cpu.cfs_period_us') return '100000\n';
            if (path === '/sys/fs/cgroup/cpuacct/cpuacct.usage') return `${(usageNs += 1e9)}\n`;
            if (path === '/proc/stat') return `cpu ${(systemTicks += 300)} 0 0 0 0 0 0\n`;
            throw new Error(`ENOENT: ${path}`);
        });
        const cpusMock = vitest
            .spyOn(os, 'cpus')
            .mockReturnValue([
                { times: { user: 200, nice: 0, sys: 100, idle: 100, irq: 0 } },
                { times: { user: 200, nice: 0, sys: 100, idle: 100, irq: 0 } },
            ] as os.CpuInfo[]);

        await getCurrentCpuTicksV2();
        const result = await getCurrentCpuTicksV2();
        expect(result).toBeCloseTo(2 / 3, 4);
        cpusMock.mockRestore();
    });

    test('restarts the measurement when the tightest quota moves to another cgroup', async () => {
        getCgroupControllerSpy.mockResolvedValue({
            version: 'V2',
            dirs: ['/sys/fs/cgroup/pod/container', '/sys/fs/cgroup/pod'],
        });
        let resized = false;
        readFileSpy.mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/pod/container/cpu.max') return resized ? 'max 100000\n' : '100000 100000\n';
            if (path === '/sys/fs/cgroup/pod/cpu.max') return resized ? '100000 100000\n' : 'max 100000\n';
            if (path === '/sys/fs/cgroup/pod/container/cpu.stat') return 'usage_usec 5000000\n';
            if (path === '/sys/fs/cgroup/pod/cpu.stat') return 'usage_usec 2000000\n';
            if (path === '/proc/stat') return resized ? 'cpu 600 0 0 0 0 0 0\n' : 'cpu 300 0 0 0 0 0 0\n';
            throw new Error(`ENOENT: ${path}`);
        });
        const cpusMock = vitest
            .spyOn(os, 'cpus')
            .mockReturnValue([
                { times: { user: 200, nice: 0, sys: 100, idle: 100, irq: 0 } },
                { times: { user: 200, nice: 0, sys: 100, idle: 100, irq: 0 } },
            ] as os.CpuInfo[]);

        await getCurrentCpuTicksV2();
        resized = true;
        const result = await getCurrentCpuTicksV2();
        // The pod counter is not compared with the container one: 2 s of pod cpu time per 6 s of system cpu time.
        expect(result).toBeCloseTo(2 / 3, 4);
        cpusMock.mockRestore();
    });
});
