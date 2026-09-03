import { describe, expect, it, vitest } from 'vitest';

import { drainRequestBatches } from '../../../packages/core/src/storages/batched_adds.js';

describe('drainRequestBatches', () => {
    // A failure in the background (non-initial) chunk previously vanished with no log, no
    // `unprocessedRequests` entry, and no stats hit - the initial chunk's own success masked it entirely
    // on the default `waitForAllRequestsToBeAdded: false` path used by `crawler.run(urls)`.
    it('logs a background batch failure instead of swallowing it silently', async () => {
        async function* items() {
            yield { url: 'https://example.com/1' };
            yield { url: 'https://example.com/2' };
        }

        const log = { exception: vitest.fn() } as any;
        const backgroundError = new Error('backend unavailable');
        // `trackBackgroundBatches` receives the exact `remainder.catch(...)` promise the fix attaches its
        // logging to - awaiting *that* (rather than `result.waitForAllRequestsToBeAdded`, a separately
        // derived `.catch()` chain off the same underlying `remainder`) is what actually guarantees the
        // log call has already happened by the time the assertion below runs.
        let trackedPromise: Promise<unknown> | undefined;

        const result = await drainRequestBatches({
            items: items(),
            batchSize: 1,
            waitBetweenBatchesMillis: 0,
            waitForAllRequestsToBeAdded: false,
            log,
            processChunk: async (chunk, isInitial) => {
                if (!isInitial) throw backgroundError;
                return chunk.map(() => ({ wasAlreadyPresent: false, wasAlreadyHandled: false }) as any);
            },
            trackBackgroundBatches: (batches) => {
                trackedPromise = batches;
            },
        });

        // The call itself still returns as soon as the initial chunk lands, without waiting for
        // (or throwing because of) the background chunk - that part of the contract is unchanged.
        expect(result.addedRequests).toHaveLength(1);

        await trackedPromise;

        expect(log.exception).toHaveBeenCalledTimes(1);
        expect(log.exception).toHaveBeenCalledWith(backgroundError, expect.stringContaining('background'));
    });

    // The original swallow (`.catch(() => {})`) existed specifically to stop an un-awaited background
    // failure from crashing the process as an unhandled rejection - confirms that guarantee still holds
    // now that the same catch also logs.
    it('still hands trackBackgroundBatches a promise that settles instead of rejecting', async () => {
        async function* items() {
            yield { url: 'https://example.com/1' };
            yield { url: 'https://example.com/2' };
        }

        const log = { exception: vitest.fn() } as any;
        let trackedPromise: Promise<unknown> | undefined;

        await drainRequestBatches({
            items: items(),
            batchSize: 1,
            waitBetweenBatchesMillis: 0,
            waitForAllRequestsToBeAdded: false,
            log,
            processChunk: async (chunk, isInitial) => {
                if (!isInitial) throw new Error('backend unavailable');
                return chunk.map(() => ({ wasAlreadyPresent: false, wasAlreadyHandled: false }) as any);
            },
            trackBackgroundBatches: (batches) => {
                trackedPromise = batches;
            },
        });

        await expect(trackedPromise).resolves.toEqual([]);
    });

    it('does not log anything when every batch succeeds', async () => {
        async function* items() {
            yield { url: 'https://example.com/1' };
            yield { url: 'https://example.com/2' };
        }

        const log = { exception: vitest.fn() } as any;

        const result = await drainRequestBatches({
            items: items(),
            batchSize: 1,
            waitBetweenBatchesMillis: 0,
            waitForAllRequestsToBeAdded: true,
            log,
            processChunk: async (chunk) =>
                chunk.map(() => ({ wasAlreadyPresent: false, wasAlreadyHandled: false }) as any),
        });

        expect(result.addedRequests).toHaveLength(2);
        expect(log.exception).not.toHaveBeenCalled();
    });
});
