import type { LoadSignal, LoadSignalStartContext, LoadSnapshot } from 'crawlee';
import { ConcurrencySystem, SnapshotStore } from 'crawlee';

// Stands in for whatever we actually measure - a health endpoint, a queue depth, an error counter.
async function areProxiesStruggling(): Promise<boolean> {
    const response = await fetch('https://proxy-monitor.example.com/health');
    const { queuedRequests } = (await response.json()) as { queuedRequests: number };

    return queuedRequests > 100;
}

class ProxyHealthSignal implements LoadSignal {
    readonly name = 'proxyHealth';
    readonly overloadedRatio = 0.3;

    private readonly store = new SnapshotStore();
    private interval?: NodeJS.Timeout;

    async start({ maxSampleWindowMillis }: LoadSignalStartContext): Promise<void> {
        // Retain exactly the window we will be sampled over - a store never given one keeps everything.
        this.store.useSampleWindow(maxSampleWindowMillis);
        // This may be a restart, so drop anything measured before the downtime.
        this.store.clear();

        this.interval = setInterval(async () => {
            const createdAt = new Date();
            this.store.push({ createdAt, isOverloaded: await areProxiesStruggling() }, createdAt);
        }, 1_000);
    }

    async stop(): Promise<void> {
        clearInterval(this.interval);
    }

    getSample(sampleDurationMillis?: number): LoadSnapshot[] {
        return this.store.getSample(sampleDurationMillis);
    }
}

const concurrencySystem = new ConcurrencySystem({
    loadSignals: { custom: [new ProxyHealthSignal()] },
});
