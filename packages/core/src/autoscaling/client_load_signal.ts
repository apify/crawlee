import type { StorageClient } from '@crawlee/types';

import type { LoadSnapshot } from './load_signal';
import { SnapshotStore } from './load_signal';

const CLIENT_RATE_LIMIT_ERROR_RETRY_COUNT = 2;

export interface ClientSnapshot extends LoadSnapshot {
    rateLimitErrorCount: number;
}

export interface ClientLoadSignalOptions {
    client: StorageClient;
    clientSnapshotIntervalSecs?: number;
    maxClientErrors?: number;
    overloadedRatio?: number;
    snapshotHistoryMillis?: number;
}

/**
 * Periodically checks the storage client for rate-limit errors (HTTP 429)
 * and reports overload when the error delta exceeds a threshold.
 */
export function createClientLoadSignal(options: ClientLoadSignalOptions) {
    const maxClientErrors = options.maxClientErrors ?? 3;

    const signal = SnapshotStore.fromInterval<ClientSnapshot>({
        name: 'clientInfo',
        overloadedRatio: options.overloadedRatio ?? 0.3,
        intervalMillis: (options.clientSnapshotIntervalSecs ?? 1) * 1000,
        snapshotHistoryMillis: options.snapshotHistoryMillis,
        handler(store, intervalCallback) {
            const now = new Date();

            const allErrorCounts = options.client.stats?.rateLimitErrors ?? [];
            const currentErrCount = allErrorCounts[CLIENT_RATE_LIMIT_ERROR_RETRY_COUNT] || 0;

            const snapshot: ClientSnapshot = {
                createdAt: now,
                isOverloaded: false,
                rateLimitErrorCount: currentErrCount,
            };
            const all = store.getAll();
            const previousSnapshot = all[all.length - 1];
            if (previousSnapshot) {
                const { rateLimitErrorCount } = previousSnapshot;
                const delta = currentErrCount - rateLimitErrorCount;
                if (delta > maxClientErrors) snapshot.isOverloaded = true;
            }

            store.push(snapshot, now);
            intervalCallback();
        },
    });

    return signal;
}

/** @internal Return type for backward compat in Snapshotter facade */
export type ClientLoadSignal = ReturnType<typeof createClientLoadSignal>;
