import { setTimeout as sleep } from 'node:timers/promises';
import type { ProcessedRequest } from '@crawlee/types';

import { chunkedAsyncIterable, peekableAsyncIterable } from '../iterables.js';
import type { Source } from '../request.js';
import type { AddRequestsBatchedResult } from './request_queue.js';
import { activeStorageTransaction, withDirectStorageAccess } from './transaction.js';

export interface DrainRequestBatchesOptions<TItem extends Source> {
    /**
     * The requests to add, already normalized by the caller. Consumed lazily: an unbounded or expensive
     * iterable is only pulled from as far as the batching (and any `maxNewRequests` budget) requires.
     */
    items: AsyncGenerator<TItem>;

    batchSize: number;
    waitBetweenBatchesMillis: number;
    waitForAllRequestsToBeAdded: boolean;
    maxNewRequests?: number;

    /**
     * Adds a single chunk and reports what it processed.
     *
     * @param isInitial Whether this is the first chunk, which is added before this function returns. Later
     *  chunks land in the background, which is why some callers cache only the first.
     */
    processChunk: (chunk: TItem[], isInitial: boolean) => Promise<ProcessedRequest[]>;

    /**
     * Called with the promise covering every chunk after the first, so the caller can keep its own
     * `isFinished` honest while batches are still landing.
     */
    trackBackgroundBatches?: (batches: Promise<unknown>) => void;
}

/**
 * Drives the chunk-by-chunk half of `addRequestsBatched`: the first chunk is added before returning and the
 * rest continue in the background, paced by `waitBetweenBatchesMillis`.
 *
 * Callers differ only in how a chunk is added and how the input is normalized, so that is all
 * {@apilink DrainRequestBatchesOptions} asks for - the budget arithmetic, the lazy chunking, the
 * over-limit reporting and the transaction handling are identical for everyone and live here. In
 * particular, every caller has to keep its background chunks out of a transaction they will outlive,
 * so that is read from the ambient transaction rather than asked of the caller.
 */
export async function drainRequestBatches<TItem extends Source>(
    options: DrainRequestBatchesOptions<TItem>,
): Promise<AddRequestsBatchedResult> {
    const {
        items,
        batchSize,
        waitBetweenBatchesMillis,
        waitForAllRequestsToBeAdded,
        maxNewRequests,
        processChunk,
        trackBackgroundBatches,
    } = options;

    const deferred = activeStorageTransaction()?.policy.requestQueue === 'deferred';

    let remainingBudget = maxNewRequests ?? Infinity;
    const requestsOverLimit: Source[] = [];

    // Never hand a chunk more than the budget allows, so an over-large final batch cannot overshoot.
    const effectiveChunkSize = maxNewRequests !== undefined ? () => Math.min(batchSize, remainingBudget) : batchSize;

    const chunks = peekableAsyncIterable(chunkedAsyncIterable(items, effectiveChunkSize));
    const chunksIterator = chunks[Symbol.asyncIterator]();

    const addChunk = async (chunk: TItem[], isInitial: boolean) => {
        const processedRequests = await processChunk(chunk, isInitial);

        if (maxNewRequests !== undefined) {
            remainingBudget -= processedRequests.filter((request) => !request.wasAlreadyPresent).length;
        }

        return processedRequests;
    };

    const buildResult = async (
        addedRequests: ProcessedRequest[],
        waitForAll: Promise<ProcessedRequest[]>,
    ): Promise<AddRequestsBatchedResult> => {
        if (maxNewRequests !== undefined) {
            // `chunkedAsyncIterable` stops pulling once the budget-derived chunk size hits zero, so whatever
            // is left is still sitting in `items` rather than in a chunk we have seen.
            for await (const item of items) {
                requestsOverLimit.push(item);
            }
        }

        return { addedRequests, waitForAllRequestsToBeAdded: waitForAll, requestsOverLimit };
    };

    const initialChunk = await chunksIterator.peek();
    if (initialChunk === undefined) {
        return buildResult([], Promise.resolve([]));
    }

    const addedRequests = await addChunk(initialChunk, true);
    await chunksIterator.next();

    if ((await chunksIterator.peek()) === undefined) {
        return buildResult(addedRequests, Promise.resolve([]));
    }

    const processRemainingChunks = async () => {
        const added: ProcessedRequest[] = [];
        for await (const chunk of chunks) {
            added.push(...(await addChunk(chunk, false)));
            // Under `deferred` no chunk performs backend I/O, so pacing them would only stall the handler.
            await sleep(deferred ? 0 : waitBetweenBatchesMillis);
        }
        return added;
    };

    // With a budget we must drain everything before we can report what went over it; under `deferred` a
    // writer that finishes after commit would have nowhere to put its journal entries.
    const awaitsRemainder = waitForAllRequestsToBeAdded || maxNewRequests !== undefined || deferred;

    // An un-awaited writer outlives the transaction scope it inherits, so it must not record into a
    // transaction that may already be closed. It writes directly - its write-through additions were never
    // going to be rolled back anyway - which means the requests it adds are not journaled.
    // See `StorageTransactionView.enqueuedUrls`.
    const remainder = awaitsRemainder ? processRemainingChunks() : withDirectStorageAccess(processRemainingChunks);

    // The caller is not obliged to await `remainder`, so give it a handler of its own - an unhandled
    // rejection here would otherwise take the process down.
    trackBackgroundBatches?.(remainder.catch(() => {}));

    if (awaitsRemainder) {
        addedRequests.push(...(await remainder));
    }

    return buildResult(addedRequests, remainder);
}
