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
    private requestQueue: IRequestManager;

    constructor(requestLoader: IRequestLoader, requestQueue: IRequestManager) {
        this.log = serviceLocator.getLogger().child({ prefix: 'RequestManagerTandem' });
        this.requestLoader = requestLoader;
        this.requestQueue = requestQueue;
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

        try {
            await this.requestQueue.addRequest(request, { forefront: true });
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
        return this.requestQueue.fetchNextRequest<T>();
    }

    /**
     * @inheritdoc
     */
    async isFinished(): Promise<boolean> {
        const storagesFinished = await Promise.all([this.requestLoader.isFinished(), this.requestQueue.isFinished()]);
        return storagesFinished.every(Boolean);
    }

    /**
     * @inheritdoc
     */
    async isEmpty(): Promise<boolean> {
        const storagesEmpty = await Promise.all([this.requestLoader.isEmpty(), this.requestQueue.isEmpty()]);
        return storagesEmpty.every(Boolean);
    }

    /**
     * @inheritdoc
     */
    async handledCount(): Promise<number> {
        // Since one of the stores needs to have priority when both are present, we query the request queue - the request list will first be dumped into the queue and then left empty.
        return await this.requestQueue.handledCount();
    }

    /**
     * @inheritdoc
     */
    async getTotalCount(): Promise<number> {
        return this.requestQueue.getTotalCount();
    }

    /**
     * @inheritdoc
     */
    async getPendingCount(): Promise<number> {
        const [queuePending, loaderPending] = await Promise.all([
            this.requestQueue.getPendingCount(),
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
        return this.requestQueue.markRequestHandled(request);
    }

    /**
     * @inheritdoc
     */
    async reclaimRequest(
        request: Request,
        options?: RequestQueueOperationOptions,
    ): Promise<RequestQueueOperationInfo | null> {
        return await this.requestQueue.reclaimRequest(request, options);
    }

    /**
     * @inheritdoc
     */
    async addRequest(requestLike: Source, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo> {
        return await this.requestQueue.addRequest(requestLike, options);
    }

    /**
     * @inheritdoc
     */
    async addRequestsBatched(
        requests: RequestsLike,
        options?: AddRequestsBatchedOptions,
    ): Promise<AddRequestsBatchedResult> {
        return await this.requestQueue.addRequestsBatched(requests, options);
    }
}
