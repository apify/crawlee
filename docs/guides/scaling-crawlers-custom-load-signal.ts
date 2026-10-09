import type { LoadSignal } from 'crawlee';
import { ConcurrencySystem, SnapshotStore } from 'crawlee';

// The only part that is ours: anything we can poll and reduce to "is this resource in trouble?"
async function areProxiesStruggling(): Promise<boolean> {
    const response = await fetch('https://proxy-monitor.example.com/health');

    return !response.ok;
}

const store = new SnapshotStore();
let interval: NodeJS.Timeout;

const proxyHealth: LoadSignal = {
    name: 'proxyHealth',
    overloadedRatio: 0.3,
    async start({ maxSampleWindowMillis }) {
        // Retain exactly the window we will be sampled over, and drop anything measured before a restart.
        store.useSampleWindow(maxSampleWindowMillis);
        store.clear();

        interval = setInterval(async () => {
            const createdAt = new Date();
            store.push({ createdAt, isOverloaded: await areProxiesStruggling() }, createdAt);
        }, 1_000);
    },
    async stop() {
        clearInterval(interval);
    },
    getSample: (sampleDurationMillis) => store.getSample(sampleDurationMillis),
};

const concurrencySystem = new ConcurrencySystem({ loadSignals: { custom: [proxyHealth] } });
