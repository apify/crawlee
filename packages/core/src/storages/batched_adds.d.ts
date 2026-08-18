import type { ProcessedRequest } from '@crawlee/types';
import type { Source } from '../request.js';
import type { AddRequestsBatchedResult } from './request_queue.js';
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
export declare function drainRequestBatches<TItem extends Source>(options: DrainRequestBatchesOptions<TItem>): Promise<AddRequestsBatchedResult>;
