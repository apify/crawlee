import type { ProcessedRequest } from '@crawlee/types';
import { describe, expect, it, vitest } from 'vitest';

import { drainRequestBatches } from '../../../packages/core/src/storages/batched-adds.js';
import type { CrawleeLogger } from '../../../packages/core/src/log.js';

async function* twoItems() {
    yield { url: 'https://example.com/1' };
    yield { url: 'https://example.com/2' };
}

function setup(waitForAllRequestsToBeAdded: boolean) {
    const exception = vitest.fn();
    let tracked: Promise<unknown> | undefined;

    const result = drainRequestBatches({
        items: twoItems(),
        batchSize: 1,
        waitBetweenBatchesMillis: 0,
        waitForAllRequestsToBeAdded,
        sourceIsAsync: true,
        log: { exception } as unknown as CrawleeLogger,
        processChunk: async (chunk, isInitial) => {
            if (!isInitial) throw new Error('boom');
            return chunk.map((): ProcessedRequest => ({
                uniqueKey: '',
                requestId: '',
                wasAlreadyPresent: false,
                wasAlreadyHandled: false,
            }));
        },
        trackBackgroundBatches: (batches) => {
            tracked = batches;
        },
    });

    return { exception, result, tracked: () => tracked };
}

describe('drainRequestBatches', () => {
    it('logs a failed background batch', async () => {
        const { exception, result, tracked } = setup(false);

        expect((await result).addedRequests).toHaveLength(1);
        await tracked();

        expect(exception).toHaveBeenCalledOnce();
    });

    it('rethrows an awaited batch failure without logging it', async () => {
        const { exception, result, tracked } = setup(true);

        await expect(result).rejects.toThrow('boom');
        await tracked();

        expect(exception).not.toHaveBeenCalled();
    });
});
