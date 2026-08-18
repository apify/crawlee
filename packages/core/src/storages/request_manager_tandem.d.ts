import type { Dictionary } from '@crawlee/types';
import type { Request, Source } from '../request.js';
import type { IRequestLoader } from './request_loader.js';
import type { IRequestManager, RequestsLike } from './request_manager.js';
import type { AddRequestsBatchedOptions, AddRequestsBatchedResult, RequestQueueOperationInfo, RequestQueueOperationOptions } from './request_queue.js';
/**
 * A request manager that combines a {@apilink IRequestLoader} (such as a `RequestList`) with a writable
 * {@apilink IRequestManager} (such as a `RequestQueue`).
 * It first reads requests from the loader and then, when needed, transfers them in batches to the manager.
 */
export declare class RequestManagerTandem implements IRequestManager {
    #private;
    /**
     * @param requestLoader The read-only loader to read requests from first.
     * @param requestManager The writable manager to transfer requests into and enqueue new ones. May be passed as a
     *  factory function so that the tandem can be constructed synchronously and the manager opened lazily on first use
     *  (e.g. a lazily-opened default {@apilink RequestQueue}).
     */
    constructor(requestLoader: IRequestLoader, requestManager: IRequestManager | (() => IRequestManager | Promise<IRequestManager>));
    /**
     * Resolves the writable request manager, opening it lazily (via the factory) on first use and memoizing the result.
     * @private
     */
    private getRequestManager;
    /**
     * Transfers a single request from the read-only loader to the writable manager.
     * If the transfer fails, the request is dropped (and logged) rather than reclaimed.
     *
     * @returns `true` if a request was successfully transferred (or there was nothing to transfer), and `false` if a
     *  transfer was attempted but failed - in which case the caller should not fetch from the manager this round.
     * @private
     */
    private transferNextRequestToQueue;
    /**
     * Fetches the next request from the request manager. If the manager is empty and the loader
     * is not finished, it will transfer a request from the loader to the manager first.
     * @inheritdoc
     */
    fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null>;
    /**
     * @inheritdoc
     */
    isFinished(): Promise<boolean>;
    /**
     * @inheritdoc
     */
    isEmpty(): Promise<boolean>;
    /**
     * @inheritdoc
     */
    getHandledCount(): Promise<number>;
    /**
     * @inheritdoc
     */
    getTotalCount(): Promise<number>;
    /**
     * @inheritdoc
     */
    getPendingCount(): Promise<number>;
    /**
     * @inheritdoc
     */
    [Symbol.asyncIterator](): AsyncGenerator<Request<Dictionary>, void, unknown>;
    /**
     * @inheritdoc
     */
    markRequestAsHandled(request: Request): Promise<RequestQueueOperationInfo | void | null>;
    /**
     * @inheritdoc
     */
    reclaimRequest(request: Request, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo | null>;
    /**
     * @inheritdoc
     */
    addRequest(requestLike: Source, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo>;
    /**
     * @inheritdoc
     */
    addRequestsBatched(requests: RequestsLike, options?: AddRequestsBatchedOptions): Promise<AddRequestsBatchedResult>;
    /**
     * Persists the state of the underlying read-only loader, if it supports persistence.
     * @inheritdoc
     */
    persistState(): Promise<void>;
    /**
     * Purges the writable request manager so the tandem can be reused (e.g. across repeated `crawler.run()` calls).
     * The read-only loader is immutable and cannot be purged, so only the manager side is reset.
     * @inheritdoc
     */
    purge(): Promise<void>;
    /**
     * Forwards the hint to the writable request manager — that is where requests are fetched from and
     * reserved. The manager is opened lazily, so the value is remembered and applied once it resolves.
     * @inheritdoc
     */
    setExpectedRequestProcessingTimeSecs(secs: number): Promise<void>;
}
