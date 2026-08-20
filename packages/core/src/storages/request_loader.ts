import type { Dictionary } from '@crawlee/types';

import type { Request } from '../request.js';
import type { IRequestManager } from './request_manager.js';
import type { RequestQueueOperationInfo } from './request_queue.js';

/**
 * What a request source can tell a consumer about its own availability, in a single answer.
 *
 * - `ready` — the next {@apilink IRequestLoader.fetchNextRequest} is expected to hand something over.
 * - `waiting` — nothing to fetch right now, but the source is not done either: requests are in progress,
 *   are being added in the background, or are being held back until `readyAt`.
 * - `stalled` — the source is holding requests it cannot make progress on. Only a manager that paces its
 *   own dispatch can reach this; see {@apilink ThrottlingRequestManager}.
 * - `finished` — everything has been handled and nothing is left.
 */
export type RequestSourceState =
    | { status: 'ready' }
    | {
          status: 'waiting';
          /**
           * A `Date.now()` timestamp at which the source expects to become `ready`, when it knows one.
           * Absent when the wait is on something without a clock (an in-progress request, a background
           * add), in which case a consumer has nothing better to do than poll.
           */
          readyAt?: number;
      }
    | { status: 'stalled'; reason: string }
    | { status: 'finished' };

/** Loaders never stall — only a manager that paces its own dispatch can. */
export type RequestLoaderState = Exclude<RequestSourceState, { status: 'stalled' }>;

/**
 * Combines the states of two request sources read as one, with the precedence
 * `ready` > `stalled` > `waiting` > `finished`.
 *
 * Binary and non-variadic on purpose: this sits on the probe path a task loop runs several times a
 * second, and folding a pair allocates nothing.
 *
 * @internal
 */
export function joinRequestSourceStates(a: RequestSourceState, b: RequestSourceState): RequestSourceState {
    // `ready` if either is: with two sources read as one, work anywhere is work.
    if (a.status === 'ready') {
        return a;
    }
    if (b.status === 'ready') {
        return b;
    }

    // `ready` outranking `stalled` above means a stalled source is masked while the other one still has
    // work - which is deliberate, and matches what the crawler did before this was a single answer: the
    // stall check was only ever reached from `isFinishedFunction`, which the task loop calls exclusively
    // when nothing is in flight and nothing is ready. "Fixing" the masking turns a crawl that is making
    // progress elsewhere into a `PersistentRateLimitError`.
    //
    // `stalled` outranking `waiting` is parity with the same call site, which fired regardless of what
    // other domains' clocks were doing.
    if (a.status === 'stalled') {
        return a;
    }
    if (b.status === 'stalled') {
        return b;
    }

    if (a.status === 'waiting') {
        // The earlier of the two known wake-up times; unknown if neither source announced one, in which
        // case the consumer is left polling.
        if (b.status !== 'waiting' || b.readyAt === undefined) {
            return a;
        }
        return a.readyAt !== undefined && a.readyAt <= b.readyAt ? a : b;
    }

    // `a` is finished, so `b` decides: `waiting` if it is still working, `finished` otherwise.
    return b;
}

/**
 * An abstract interface defining a read-only stream of requests to crawl.
 *
 * Request loaders are used to manage and provide access to a storage of crawling requests.
 *
 * Key responsibilities:
 * - Fetching the next request to be processed.
 * - Marking requests as handled once they are no longer in progress.
 * - Managing state information such as the total and handled request counts.
 *
 * ## Request lifecycle contract
 *
 * Every request returned by {@apilink IRequestLoader.fetchNextRequest} is considered **in progress**
 * until it is passed to {@apilink IRequestLoader.markRequestAsHandled}. Once you fetch a request, you are
 * obligated to eventually mark it as handled — there is no way to hand a request back to a loader
 * (only an {@apilink IRequestManager} can reclaim requests for a retry). "Handled" therefore means
 * "finished with this request", whether processing succeeded or was abandoned after exhausting retries.
 *
 * Honoring this contract matters for three reasons:
 * - **Restarts and migrations:** loaders that persist their state (see {@apilink IRequestLoader.persistState})
 *   treat in-progress requests as interrupted and re-serve them after a restart. A request that is fetched
 *   but never marked handled will be crawled again.
 * - **Termination detection:** {@apilink IRequestLoader.readiness} only reports `finished` once nothing is
 *   in progress. Leaving a request unmarked keeps the crawler running indefinitely.
 * - **Bookkeeping:** the handled and pending counts are derived from the set of in-progress requests, so
 *   skipping {@apilink IRequestLoader.markRequestAsHandled} corrupts {@apilink IRequestLoader.getHandledCount}
 *   and {@apilink IRequestLoader.getPendingCount}.
 *
 * Concrete implementations such as {@apilink RequestList} or {@apilink SitemapRequestLoader} build on this interface.
 * The {@apilink IRequestManager} interface extends it with the capability to enqueue and reclaim requests.
 */
export interface IRequestLoader {
    /**
     * Returns an approximation of the total number of requests in the loader (i.e. pending + handled).
     */
    getTotalCount(): Promise<number>;

    /**
     * Returns an approximation of the number of pending requests in the loader.
     */
    getPendingCount(): Promise<number>;

    /**
     * Returns the number of requests in the loader that have been handled.
     */
    getHandledCount(): Promise<number>;

    /**
     * Reports whether the loader has a request to hand over, is waiting on one, or is done — see
     * {@apilink RequestSourceState}.
     *
     * A consumer's task loop is gated on this, so an implementation MUST return `ready` without evaluating
     * anything further: that is the answer that costs a caller nothing to act on, and the one it asks for
     * most often.
     *
     * Because a source may be backed by distributed storage, `finished` may occasionally arrive late — but
     * it is never wrong: a loader that reports `finished` has nothing left.
     */
    readiness(): Promise<RequestSourceState>;

    /**
     * Gets the next {@apilink Request} to process, or `null` if there are no more pending requests.
     *
     * The returned request is marked as **in progress** and remains so until it is passed to
     * {@apilink IRequestLoader.markRequestAsHandled}. The caller is responsible for eventually marking
     * every fetched request as handled; otherwise the loader never considers itself finished and the
     * request may be re-served after a restart. See the request lifecycle contract on {@apilink IRequestLoader}.
     */
    fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null>;

    /**
     * Can be used to iterate over the loader instance in a `for await .. of` loop.
     * Provides an alternative for the repeated use of `fetchNextRequest`.
     */
    [Symbol.asyncIterator](): AsyncGenerator<Request>;

    /**
     * Marks a request previously returned by {@apilink IRequestLoader.fetchNextRequest} as handled,
     * removing it from the set of in-progress requests.
     *
     * Call this once you are done with the request — whether processing succeeded or was abandoned after
     * exhausting retries. Because a loader cannot take a request back, marking it handled is the only way to
     * signal completion; failing to do so prevents {@apilink IRequestLoader.readiness} from ever reporting
     * `finished` and skews the handled and pending counts. See the request lifecycle contract on
     * {@apilink IRequestLoader}.
     */
    markRequestAsHandled(request: Request): Promise<RequestQueueOperationInfo | void | null>;

    /**
     * Persists the current state of the loader into the default {@apilink KeyValueStore}.
     *
     * Not all loaders support persistence; implementations that do not should leave this `undefined`.
     */
    persistState?(): Promise<void>;

    /**
     * Combines the loader with a request manager to support adding and reclaiming requests.
     *
     * @param requestManager Request manager to combine the loader with. If not provided, the default
     *  {@apilink RequestQueue} is used.
     */
    toTandem?(requestManager?: IRequestManager): Promise<IRequestManager>;
}
