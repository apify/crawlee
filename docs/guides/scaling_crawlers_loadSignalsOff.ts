import { ConcurrencySystem } from 'crawlee';

const concurrencySystem = new ConcurrencySystem({
    loadSignals: {
        // Our storage backend reports no rate-limit statistics, so stop polling it every second.
        client: false,
        eventLoop: { maxBlockedMillis: 100 },
    },
});
