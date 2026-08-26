import type { LiteralUnion } from 'type-fest';

import type { Request, Source } from '../request.js';
import type { IRequestLoader } from './request_loader.js';
import type {
    AddRequestsBatchedOptions,
    AddRequestsBatchedResult,
    RequestQueueOperationInfo,
    RequestQueueOperationOptions,
} from './request_queue.js';

export type RequestsLike = AsyncIterable<Source | string> | Iterable<Source | string> | (Source | string)[];

/**
 * Extends the read-only {@apilink IRequestLoader} interface with the capability to enqueue new requests
 * and reclaim failed ones.
 */
export interface IRequestManager extends IRequestLoader {
    /**
     * Reclaims request to the provider if its processing failed.
     * The request will be returned by some subsequent `fetchNextRequest()` call.
     */
    reclaimRequest(request: Request, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo | null>;

    addRequest(requestLike: Source, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo>;

    addRequestsBatched(requests: RequestsLike, options?: AddRequestsBatchedOptions): Promise<AddRequestsBatchedResult>;

    /**
     * Remove all requests from the queue but keep the queue itself, resetting it
     * so it can be reused (e.g. across multiple `crawler.run()` calls).
     *
     * Implementations that do not support purging may leave this `undefined`.
     */
    purge?(): Promise<void>;

    /**
     * Tells the manager how long a consumer expects to hold a request fetched via `fetchNextRequest()`
     * before marking it handled or reclaiming it (typically the request-handler timeout plus padding).
     *
     * Managers backed by a storage backend that reserves requests via locking use this to avoid handing
     * the same request out again while it is still being processed. Implementations that do not need
     * this hint may leave it `undefined`.
     */
    setExpectedRequestProcessingTimeSecs?(secs: number): Promise<void>;

    /**
     * Records something said about the pace requests should go out at, so that a manager which paces its own
     * dispatch can hold them back before handing any more out.
     *
     * Required rather than optional, so that reporting a signal is never a question of whether the manager
     * supports it. A manager that does not pace returns `false`; one that wraps another forwards the call, so
     * that a pacer nested inside a composition still receives it.
     *
     * @returns `true` if the manager took responsibility for the signal - which also tells a caller whether
     *  anything in a composition paces at all.
     */
    recordPacingSignal(signal: PacingSignal): boolean;
}

/**
 * How much of the URL space a {@apilink PacingSignal} covers.
 *
 * Open on purpose. `'hostname'` and `'registrableDomain'` are what Crawlee's own reporters send and what
 * {@apilink ThrottlingRequestManager} understands, so the type suggests them; any other string is still
 * accepted, which is what lets a pacer keyed on something else - an account, an API key, a platform tenant - be
 * reported to in its own vocabulary without this interface having to hear about it.
 *
 * A manager's own configuration is free to be stricter: {@apilink ThrottlingRequestManagerOptions.throttleBy}
 * is a closed union of the two it supports, so a typo there is a compile error rather than a signal it throws on.
 */
export type PacingScope = LiteralUnion<'hostname' | 'registrableDomain', string>;

/**
 * Something said about the pace requests should go out at, reported to a request manager through
 * {@apilink IRequestManager.recordPacingSignal}.
 *
 * One shape rather than a method per channel: a manager that paces switches on `reason`, one that merely wraps
 * another forwards the value without knowing what is in it, and a new kind of signal costs the interface
 * nothing. It is also why the `url` travels inside the value: the crawl-wide variant has none to name.
 * Nothing here names the mechanism a signal came from - HTTP status codes, response headers and robots.txt are
 * the crawler's business, not the manager's - and every delay is in milliseconds.
 *
 * ## Scope
 *
 * `scope` names how much of the URL space a signal covers. It is an open union: the two values Crawlee's own
 * reporters and {@apilink ThrottlingRequestManager} speak are suggested by the type, but any string is
 * accepted - see {@apilink PacingScope}.
 *
 * A manager may apply a signal to a **wider** scope than it was given - a floor that holds for one host still
 * holds when a whole site is paced by it - but never to a narrower one, which would leave some of the URLs the
 * signal covers running unpaced. A manager that can only do the latter, or that does not recognise the scope at
 * all, MUST throw rather than quietly under-apply it.
 */
export type PacingSignal =
    | {
          /**
           * The source turned a request away because we were going too fast — an HTTP 429 or 503, an exhausted
           * API quota, a platform-side limiter. Reactive and transient: a pacer typically backs off, escalating
           * if the source keeps refusing, and lets that decay once it stops.
           */
          reason: 'rateLimited';
          /** The URL that was turned away. */
          url: string;
          /** How long the source asked us to wait before trying again, if it said. */
          waitMs?: number;
          /**
           * How far this refusal reaches, if the reporter can tell. Usually it cannot — a 429 rarely says
           * whether the limit was per host, per account or per address — and leaving it out asks the manager to
           * apply the signal however it happens to group requests.
           */
          scope?: PacingScope;
      }
    | {
          /**
           * The source declared a standing floor on how often it may be requested — a robots.txt `Crawl-delay`,
           * a documented quota, a platform hint. Proactive and constant: a property of the source rather than
           * of the run, so a pacer keeps it for the whole crawl.
           */
          reason: 'minInterval';
          /** A URL of the source that declared the interval. */
          url: string;
          /** The declared minimum interval between two requests to the source. */
          intervalMs: number;
          /**
           * How much of the URL space the declared interval covers. Required, because whoever declares an
           * interval knows what it applies to.
           */
          scope: PacingScope;
      }
    | {
          /**
           * A standing floor under the pace of **every** domain the manager dispatches to, declared by whoever
           * owns the crawl rather than by a source — a crawler's `sameDomainDelaySecs`. A manager that paces only
           * some of its domains MUST throw rather than under-apply it.
           */
          reason: 'minIntervalEverywhere';
          /** The declared minimum interval between two requests to any one source. */
          intervalMs: number;
          /** At what granularity the floor applies — each hostname, or each registrable domain. */
          scope: PacingScope;
      };
