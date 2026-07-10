import { Configuration } from '@crawlee/core';

import { createCpuLoadSignal } from '../../../packages/core/src/autoscaling/cpu_load_signal';

describe('createCpuLoadSignal()', () => {
    test('useProcessCpuUsage samples on its own interval, independent of Configuration events', async () => {
        vitest.useFakeTimers();

        const config = new Configuration({ maxUsedCpuRatio: 0.5 });
        const cpuUsageMock = vitest.spyOn(process, 'cpuUsage');
        const hrtimeMock = vitest.spyOn(process.hrtime, 'bigint');

        cpuUsageMock.mockReturnValueOnce({ user: 0, system: 0 });
        hrtimeMock.mockReturnValueOnce(0n);

        const signal = createCpuLoadSignal({
            config,
            useProcessCpuUsage: true,
            processCpuSnapshotIntervalSecs: 0.5,
        });

        await signal.start();

        // 450ms of CPU time consumed over a 500ms tick -> 0.9, above the 0.5 maxUsedCpuRatio.
        cpuUsageMock.mockReturnValueOnce({ user: 400_000, system: 50_000 });
        hrtimeMock.mockReturnValueOnce(500_000_000n);
        await vitest.advanceTimersByTimeAsync(500);

        const sample = signal.getSample();
        const last = sample[sample.length - 1];
        expect(last.isOverloaded).toBe(true);
        expect(last.usedRatio).toBeCloseTo(0.9);

        await signal.stop();
        cpuUsageMock.mockRestore();
        hrtimeMock.mockRestore();
        vitest.useRealTimers();
    });

    test('default mode listens to Configuration SYSTEM_INFO events instead', async () => {
        const config = new Configuration({ maxUsedCpuRatio: 0.5 });
        const signal = createCpuLoadSignal({ config });

        await signal.start();
        config.getEventManager().emit('systemInfo' as any, {
            createdAt: new Date(),
            cpuCurrentUsage: 80,
            isCpuOverloaded: true,
        } as any);

        const sample = signal.getSample();
        expect(sample).toHaveLength(1);
        expect(sample[0].isOverloaded).toBe(true);

        await signal.stop();
    });
});
