import asyncFs from 'node:fs/promises';

import { getCgroupsVersion, isDocker, isLambda } from '../../../packages/core/src/system-info/runtime.js';

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

    test('returns true when a "/.dockerenv" file exists', async () => {
        // @ts-ignore flaky linting of dynamic import. Some environments throw ts(2307), others not.
        const { isContainerized } = await import('../../../packages/core/src/system-info/runtime.js');
        const statMock = vitest.spyOn(asyncFs, 'stat').mockImplementationOnce(async () => null as any);
        const result = await isContainerized();
        expect(result).toBe(true);
    });

    test('returns false when isLambda is true', async () => {
        // @ts-ignore flaky linting of dynamic import. Some environments throw ts(2307), others not.
        const utils = await import('../../../packages/core/src/system-info/runtime.js');
        const lambdaMock = vitest.spyOn(utils, 'isLambda').mockReturnValue(true);
        const result = await utils.isContainerized();
        expect(result).toBe(false);
    });

    test('returns true when a "/proc/stat/cgroup" file contains "docker"', async () => {
        // @ts-ignore flaky linting of dynamic import. Some environments throw ts(2307), others not.
        const { isContainerized } = await import('../../../packages/core/src/system-info/runtime.js');
        const readFileMock = vitest
            .spyOn(asyncFs, 'readFile')
            .mockResolvedValue("'something ... docker ... something'");
        const result = await isContainerized();
        expect(result).toBe(true);
    });

    test('returns true when KUBERNETES_SERVICE_HOST environment variable is set', async () => {
        // @ts-ignore flaky linting of dynamic import. Some environments throw ts(2307), others not.
        const { isContainerized } = await import('../../../packages/core/src/system-info/runtime.js');
        process.env.KUBERNETES_SERVICE_HOST = 'some-host';
        const result = await isContainerized();
        expect(result).toBe(true);
    });

    test('returns false when no other conditions are met', async () => {
        // @ts-ignore flaky linting of dynamic import. Some environments throw ts(2307), others not.
        const { isContainerized } = await import('../../../packages/core/src/system-info/runtime.js');
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
