import type { Dictionary } from '@crawlee/types';

import type { Log } from '@apify/log';

import { log } from '../log';
import type { Request, RequestOptions, Source } from '../request';
import type { IRequestList } from './request_list';
import type {
    AddRequestsBatchedOptions,
    AddRequestsBatchedResult,
    IRequestManager,
    RequestQueueOperationInfo,
    RequestQueueOperationOptions,
    RequestsLike,
} from './request_provider';

/**
 * A request manager that combines a RequestList and a RequestQueue.
 * It first reads requests from the RequestList and then, when needed,
 * transfers them in batches to the RequestQueue.
 */
export class RequestManagerTandem implements IRequestManager {
    private log: Log;
    private requestList: IRequestList;
    private requestQueue: IRequestManager;

    constructor(requestList: IRequestList, requestQueue: IRequestManager) {
        this.log = log.child({ prefix: 'RequestManagerTandem' });
        this.requestList = requestList;
        this.requestQueue = requestQueue;
    }

    /**
     * Transfers a batch of requests from the RequestList to the RequestQueue.
     * Handles both successful transfers and failures appropriately.
     * @private
     */
    private async transferNextBatchToQueue(): Promise<void> {
        const request = await this.requestList.fetchNextRequest();

        if (request === null) {
            return;
        }

        try {
            await this.requestQueue.addRequest(request, { forefront: true });
        } catch (error) {
            // If requestQueue.addRequest() fails here then we must reclaim it back to
            // the RequestList because probably it's not yet in the queue!
            this.log.error(
                'Adding of request from the RequestList to the RequestQueue failed, reclaiming request back to the list.',
                { request },
            );
            await this.requestList.reclaimRequest(request);
            return;
        }

        await this.requestList.markRequestHandled(request);
    }

    /**
     * Fetches the next request from the RequestQueue. If the queue is empty and the RequestList
     * is not finished, it will transfer a batch of requests from the list to the queue first.
     * @inheritdoc
     */
    async fetchNextRequest<T extends Dictionary = Dictionary>(options?: RequestOptions): Promise<Request<T> | null> {
        // If queue is empty, check if we can transfer more from list
        const [listEmpty, listFinished] = await Promise.all([
            this.requestList.isEmpty(),
            this.requestList.isFinished(),
        ]);

        if (!listEmpty && !listFinished) {
            await this.transferNextBatchToQueue();
        }

        // Try to fetch from queue after potential transfer
        return this.requestQueue.fetchNextRequest<T>(options);
    }

    /**
     * @inheritdoc
     */
    async isFinished(): Promise<boolean> {
        const storagesFinished = await Promise.all([this.requestList.isFinished(), this.requestQueue.isFinished()]);
        return storagesFinished.every(Boolean);
    }

    /**
     * @inheritdoc
     */
    async isEmpty(): Promise<boolean> {
        const storagesEmpty = await Promise.all([this.requestList.isEmpty(), this.requestQueue.isEmpty()]);
        return storagesEmpty.every(Boolean);
    }

    /**
     * @inheritdoc
     */
    async handledCount(): Promise<number> {
        // Return the sum of both handled counts, although the actual number
        // might be less if the same request was processed in both list and queue
        const listHandled = this.requestList.handledCount();
        const queueHandled = await this.requestQueue.handledCount();
        return listHandled + queueHandled;
    }

    /**
     * @inheritdoc
     */
    async *[Symbol.asyncIterator]() {
        // Simply iterate through the queue
        for await (const request of this.requestQueue) {
            yield request;
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
    ): Promise<RequestQueueOperationInfo | void | null> {
        return this.requestQueue.reclaimRequest(request, options);
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
