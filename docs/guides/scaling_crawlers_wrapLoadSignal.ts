import type { LoadSignal, LoadSignalStartContext, LoadSnapshot } from 'crawlee';
import { ConcurrencySystem, CpuLoadSignal } from 'crawlee';

const cooldownMillis = 10_000;

// The built-in still does all the measuring; we only reinterpret what it measured.
const cpu = new CpuLoadSignal();

const stickyCpu: LoadSignal = {
    // Taking the built-in's name over is allowed only because we switch the built-in off below.
    name: cpu.name,
    overloadedRatio: cpu.overloadedRatio,
    start: (context: LoadSignalStartContext) => cpu.start(context),
    stop: () => cpu.stop(),
    getSample(sampleDurationMillis?: number): LoadSnapshot[] {
        // Keep reporting overload for a while after the CPU recovers, so that scaling up does not immediately
        // overload it again.
        let overloadedUntil = 0;

        return cpu.getSample(sampleDurationMillis).map((snapshot) => {
            if (snapshot.isOverloaded) {
                overloadedUntil = +snapshot.createdAt + cooldownMillis;
            }

            return { ...snapshot, isOverloaded: +snapshot.createdAt < overloadedUntil };
        });
    },
};

const concurrencySystem = new ConcurrencySystem({
    loadSignals: {
        cpu: false,
        custom: [stickyCpu],
    },
});
