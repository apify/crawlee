import asyncFs from 'node:fs/promises';

import { getCgroupsVersion, isDocker, isLambda, weightedAvg, sleep, snakeCaseToCamelCase } from '@crawlee/utils';

describe('isDocker()', () => {
    test('works for dockerenv && cgroup', async () => {
        const statMock = vitest.spyOn(asyncFs, 'stat').mockImplementationOnce(async () => null as any);
        const readMock = vitest
            .spyOn(asyncFs, 'readFile')
            .mockImplementationOnce(async () => Promise.resolve('something ... docker ... something'));

        const is = await isDocker(true);

        expect(is).toBe(true);
    });

    test('works for dockerenv', async () => {
        const statMock = vitest.spyOn(asyncFs, 'stat').mockImplementationOnce(async () => null as any);
        const readMock = vitest
            .spyOn(asyncFs, 'readFile')
            .mockImplementationOnce(async () => Promise.resolve('something ... ... something'));

        const is = await isDocker(true);

        expect(is).toBe(true);
    });

    test('works for cgroup', async () => {
        const statMock = vitest
            .spyOn(asyncFs, 'stat')
            .mockImplementationOnce(async () => Promise.reject(new Error('no.')));
        const readMock = vitest
            .spyOn(asyncFs, 'readFile')
            .mockImplementationOnce(async () => Promise.resolve('something ... docker ... something'));

        const is = await isDocker(true);

        expect(is).toBe(true);
    });

    test('works for nothing', async () => {
        const statMock = vitest
            .spyOn(asyncFs, 'stat')
            .mockImplementationOnce(async () => Promise.reject(new Error('no.')));
        const readMock = vitest
            .spyOn(asyncFs, 'readFile')
            .mockImplementationOnce(async () => Promise.resolve('something ... ... something'));

        const is = await isDocker(true);

        expect(is).toBe(false);
    });
});

describe('isContainerized()', () => {
    afterEach(() => {
        delete process.env.KUBERNETES_SERVICE_HOST;
        delete process.env.CRAWLEE_CONTAINERIZED;
        // resets the `isContainerizedResult` module scoped variable
        vi.resetModules();
    });

    test('returns true when CRAWLEE_CONTAINERIZED environment variable is set', async () => {
        // @ts-ignore flaky linting of dynamic import. Some environments throw ts(2307), others not.
        const { isContainerized } = await import('@crawlee/utils');
        process.env.CRAWLEE_CONTAINERIZED = '1';
        const result = await isContainerized();
        expect(result).toBe(true);
    });

    test('returns false when CRAWLEE_CONTAINERIZED environment variable is set to "false"', async () => {
        // @ts-ignore flaky linting of dynamic import. Some environments throw ts(2307), others not.
        const { isContainerized } = await import('@crawlee/utils');
        process.env.CRAWLEE_CONTAINERIZED = 'false';
        const result = await isContainerized();
        expect(result).toBe(false);
    });

    test('returns true when a "/.dockerenv" file exists', async () => {
        // @ts-ignore flaky linting of dynamic import. Some environments throw ts(2307), others not.
        const { isContainerized } = await import('@crawlee/utils');
        const statMock = vitest.spyOn(asyncFs, 'stat').mockImplementationOnce(async () => null as any);
        const result = await isContainerized();
        expect(result).toBe(true);
    });

    test('returns false when isLambda is true', async () => {
        // @ts-ignore flaky linting of dynamic import. Some environments throw ts(2307), others not.
        const utils = await import('@crawlee/utils');
        const lambdaMock = vitest.spyOn(utils, 'isLambda').mockReturnValue(true);
        const result = await utils.isContainerized();
        expect(result).toBe(false);
    });

    test('returns true when a "/proc/stat/cgroup" file contains "docker"', async () => {
        // @ts-ignore flaky linting of dynamic import. Some environments throw ts(2307), others not.
        const { isContainerized } = await import('@crawlee/utils');
        const readFileMock = vitest
            .spyOn(asyncFs, 'readFile')
            .mockResolvedValue("'something ... docker ... something'");
        const result = await isContainerized();
        expect(result).toBe(true);
    });

    test('returns true when KUBERNETES_SERVICE_HOST environment variable is set', async () => {
        // @ts-ignore flaky linting of dynamic import. Some environments throw ts(2307), others not.
        const { isContainerized } = await import('@crawlee/utils');
        process.env.KUBERNETES_SERVICE_HOST = 'some-host';
        const result = await isContainerized();
        expect(result).toBe(true);
    });

    test('returns false when no other conditions are met', async () => {
        // @ts-ignore flaky linting of dynamic import. Some environments throw ts(2307), others not.
        const { isContainerized } = await import('@crawlee/utils');
        const result = await isContainerized();
        expect(result).toBe(false);
    });
});

describe('isLambda()', () => {
    afterEach(() => {
        delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
    });

    test('returns true when AWS_LAMBDA_FUNCTION_MEMORY_SIZE environment variable is set', () => {
        process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = '12345';
        const result = isLambda();
        expect(result).toBe(true);
    });
});

describe('getCgroupsVersion()', () => {
    // Reset the module cache so that _cgroupsVersion is not retained across tests.
    beforeEach(() => {
        vitest.resetModules();
    });

    test('returns null when access to /sys/fs/cgroup/ fails', async () => {
        vitest.spyOn(asyncFs, 'access').mockRejectedValue(new Error('not found'));
        const version = await getCgroupsVersion(true);
        expect(version).toBe(null);
    });

    test('returns V2 when access to /sys/fs/cgroup/memory/ fails', async () => {
        vitest.spyOn(asyncFs, 'access').mockImplementation(async (path) => {
            if (path === '/sys/fs/cgroup/') {
                return;
            }
            throw new Error('not found');
        });
        const version = await getCgroupsVersion(true);
        expect(version).toBe('V2');
    });

    test('returns V1 when access to /sys/fs/cgroup/memory/ succeeds', async () => {
        vitest.spyOn(asyncFs, 'access').mockResolvedValue();
        const version = await getCgroupsVersion(true);
        expect(version).toBe('V1');
    });
});

describe('weightedAvg()', () => {
    test('works', () => {
        expect(weightedAvg([10, 10, 10], [1, 1, 1])).toBe(10);
        expect(weightedAvg([5, 10, 15], [1, 1, 1])).toBe(10);
        expect(weightedAvg([10, 10, 10], [0.5, 1, 1.5])).toBe(10);
        expect(weightedAvg([29, 35, 89], [13, 91, 3])).toEqual((29 * 13 + 35 * 91 + 89 * 3) / (13 + 91 + 3));
        expect(weightedAvg([], [])).toEqual(NaN);
        expect(weightedAvg([1], [0])).toEqual(NaN);
        expect(weightedAvg([], [1])).toEqual(NaN);
    });
});

describe('sleep()', () => {
    test('works', async () => {
        await Promise.resolve();
        await sleep(0);
        await sleep();
        // @ts-expect-error invalid input type
        await sleep(null);
        await sleep(-1);

        const timeBefore = Date.now();
        await sleep(100);
        const timeAfter = Date.now();

        expect(timeAfter - timeBefore).toBeGreaterThanOrEqual(95);
    });
});

describe('snakeCaseToCamelCase()', () => {
    test('should camel case all sneaky cases of snake case', () => {
        const tests = {
            'aaa_bbb_': 'aaaBbb',
            '': '',
            'AaA_bBb_cCc': 'aaaBbbCcc',
            'a_1_b_1a': 'a1B1a',
        };

        Object.entries(tests).forEach(([snakeCase, camelCase]) => {
            expect(snakeCaseToCamelCase(snakeCase)).toEqual(camelCase);
        });
    });
});
