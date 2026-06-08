import type { Dictionary } from '@crawlee/types';

import type { CrawleeLogger } from '../log.js';
import type { Request, Source } from '../request.js';
import { serviceLocator } from '../service_locator.js';
import type { IRequestLoader } from './request_list.js';
import type {
    AddRequestsBatchedOptions,
    AddRequestsBatchedResult,
    IRequestManager,
    RequestQueueOperationInfo,
    RequestQueueOperationOptions,
    RequestsLike,
} from './request_provider.js';

/**
 * A request manager that combines a {@apilink IRequestLoader} (such as a `RequestList`) with a writable
 * {@apilink IRequestManager} (such as a `RequestQueue`).
 * It first reads requests from the loader and then, when needed, transfers them in batches to the manager.
 */
export class RequestManagerTandem implements IRequestManager {
    private log: CrawleeLogger;
    private requestLoader: IRequestLoader;
    private requestQueuePromise?: Promise<IRequestManager>;
    private resolvedRequestQueue?: IRequestManager;

    private requestQueueFactory: () => IRequestManager | Promise<IRequestManager>;

    /**
     * @param requestLoader The read-only loader to read requests from first.
     * @param requestQueue The writable manager to transfer requests into and enqueue new ones. May be passed as a
     *  factory function so that the tandem can be constructed synchronously and the queue opened lazily on first use
     *  (e.g. a lazily-opened default {@apilink RequestQueue}).
     */
    constructor(
        requestLoader: IRequestLoader,
        requestQueue: IRequestManager | (() => IRequestManager | Promise<IRequestManager>),
    ) {
        this.log = serviceLocator.getLogger().child({ prefix: 'RequestManagerTandem' });
        this.requestLoader = requestLoader;
        this.requestQueueFactory = typeof requestQueue === 'function' ? requestQueue : () => requestQueue;
    }

    /**
     * Resolves the writable request queue, opening it lazily (via the factory) on first use and memoizing the result.
     * @private
     */
    private async getRequestQueue(): Promise<IRequestManager> {
        if (this.resolvedRequestQueue === undefined) {
            this.requestQueuePromise ??= Promise.resolve(this.requestQueueFactory());
            this.resolvedRequestQueue = await this.requestQueuePromise;
        }
        return this.resolvedRequestQueue;
    }

    /**
     * Transfers a single request from the read-only loader to the writable manager.
     * If the transfer fails, the request is dropped (and logged) rather than reclaimed.
     * @private
     */
    private async transferNextBatchToQueue(): Promise<void> {
        const request = await this.requestLoader.fetchNextRequest();

        if (request === null) {
            return;
        }

        const requestQueue = await this.getRequestQueue();

        try {
            await requestQueue.addRequest(request, { forefront: true });
        } catch (error) {
            this.log.exception(
                error as Error,
                'Adding request from the RequestLoader to the RequestQueue failed, the request has been dropped.',
                { url: request.url, uniqueKey: request.uniqueKey },
            );
        } finally {
            // Mark it as handled so that the request doesn't get stuck in the `inProgress` state in the loader.
            await this.requestLoader.markRequestHandled(request);
        }
    }

    /**
     * Fetches the next request from the RequestQueue. If the queue is empty and the RequestList
     * is not finished, it will transfer a batch of requests from the list to the queue first.
     * @inheritdoc
     */
    async fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null> {
        // First, try to transfer a request from the requestList
        const [listEmpty, listFinished] = await Promise.all([
            this.requestLoader.isEmpty(),
            this.requestLoader.isFinished(),
        ]);

        if (!listEmpty && !listFinished) {
            await this.transferNextBatchToQueue();
        }

        // Try to fetch from queue after potential transfer
        return (await this.getRequestQueue()).fetchNextRequest<T>();
    }

    /**
     * @inheritdoc
     */
    async isFinished(): Promise<boolean> {
        const requestQueue = await this.getRequestQueue();
        const storagesFinished = await Promise.all([this.requestLoader.isFinished(), requestQueue.isFinished()]);
        return storagesFinished.every(Boolean);
    }

    /**
     * @inheritdoc
     */
    async isEmpty(): Promise<boolean> {
        const requestQueue = await this.getRequestQueue();
        const storagesEmpty = await Promise.all([this.requestLoader.isEmpty(), requestQueue.isEmpty()]);
        return storagesEmpty.every(Boolean);
    }

    /**
     * @inheritdoc
     */
    async handledCount(): Promise<number> {
        // Since one of the stores needs to have priority when both are present, we query the request queue - the request list will first be dumped into the queue and then left empty.
        return (await this.getRequestQueue()).handledCount();
    }

    /**
     * @inheritdoc
     */
    async getTotalCount(): Promise<number> {
        return (await this.getRequestQueue()).getTotalCount();
    }

    /**
     * @inheritdoc
     */
    async getPendingCount(): Promise<number> {
        const requestQueue = await this.getRequestQueue();
        const [queuePending, loaderPending] = await Promise.all([
            requestQueue.getPendingCount(),
            this.requestLoader.getPendingCount(),
        ]);
        return queuePending + loaderPending;
    }

    /**
     * @inheritdoc
     */
    async *[Symbol.asyncIterator]() {
        while (true) {
            const req = await this.fetchNextRequest();
            if (!req) break;
            yield req;
        }
    }

    /**
     * @inheritdoc
     */
    async markRequestHandled(request: Request): Promise<RequestQueueOperationInfo | void | null> {
        return (await this.getRequestQueue()).markRequestHandled(request);
    }

    /**
     * @inheritdoc
     */
    async reclaimRequest(
        request: Request,
        options?: RequestQueueOperationOptions,
    ): Promise<RequestQueueOperationInfo | null> {
        return (await this.getRequestQueue()).reclaimRequest(request, options);
    }

    /**
     * @inheritdoc
     */
    async addRequest(requestLike: Source, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo> {
        return (await this.getRequestQueue()).addRequest(requestLike, options);
    }

    /**
     * @inheritdoc
     */
    async addRequestsBatched(
        requests: RequestsLike,
        options?: AddRequestsBatchedOptions,
    ): Promise<AddRequestsBatchedResult> {
        return (await this.getRequestQueue()).addRequestsBatched(requests, options);
    }

    /**
     * Persists the state of the underlying read-only loader, if it supports persistence.
     * @inheritdoc
     */
    async persistState(): Promise<void> {
        await this.requestLoader.persistState?.();
    }
}
