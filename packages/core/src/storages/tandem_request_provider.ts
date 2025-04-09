import type { Dictionary } from '@crawlee/types';
import type { Log } from '@apify/log';

import { log } from '../log';
import type { Request, RequestOptions } from '../request';
import type { IRequestList } from './request_list';
import type { IRequestProvider } from './request_provider';
import { RequestProvider } from './request_provider';
import type { RequestQueueOperationInfo, RequestQueueOperationOptions } from './request_provider';

/**
 * A request provider that combines a RequestList and a RequestQueue.
 * It first reads all requests from the RequestList and then, when the list is empty,
 * it continues reading from the RequestQueue. All requests from the RequestList are
 * enqueued into the RequestQueue in the background to ensure they're not processed twice.
 */
export class TandemRequestProvider implements IRequestProvider {
    private log: Log;
    private requestList: IRequestProvider;
    private requestQueue: RequestProvider;
    private listFinishedPromise: Promise<void> | null = null;

    constructor(requestList: IRequestProvider, requestQueue: RequestProvider) {
        this.log = log.child({ prefix: 'TandemRequestProvider' });
        this.requestList = requestList;
        this.requestQueue = requestQueue;
    }

    /**
     * Fetches the next request from the RequestQueue. If the queue is empty and the RequestList
     * is not finished, it will transfer a batch of requests from the list to the queue.
     * @private
     */
    private async transferNextBatchToQueue(batchSize = 25): Promise<void> {
        let transferredCount = 0;
        
        while (transferredCount < batchSize) {
            const request = await this.requestList.fetchNextRequest();
            if (!request) break; // RequestList is empty
            
            try {
                await this.requestQueue.addRequest(request);
                await this.requestList.markRequestHandled(request);
                transferredCount++;
            } catch (err) {
                this.log.error(
                    'Adding of request from the RequestList to the RequestQueue failed, reclaiming request back to the list.',
                    { request },
                );
                await this.requestList.reclaimRequest(request);
                break; // Stop on error to prevent cascade failures
            }
        }
    }

    /**
     * @inheritdoc
     */
    async fetchNextRequest<T extends Dictionary = Dictionary>(options?: RequestOptions): Promise<Request<T> | null> {
        // Try to fetch from queue first
        const request = await this.requestQueue.fetchNextRequest<T>(options);
        if (request) return request;

        // If queue is empty, check if we can transfer more from list
        const [listEmpty, listFinished] = await Promise.all([
            this.requestList.isEmpty(),
            this.requestList.isFinished()
        ]);

        if (!listEmpty && !listFinished) {
            await this.transferNextBatchToQueue();
            // Try queue again after transfer
            return this.requestQueue.fetchNextRequest<T>(options);
        }

        return null;
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
        const listHandled = await this.requestList.handledCount();
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
     * Additional method to add new requests directly to the underlying RequestQueue.
     */
    async addRequest(
        request: Request | RequestOptions,
        options?: RequestQueueOperationOptions,
    ): Promise<RequestQueueOperationInfo | null> {
        return this.requestQueue.addRequest(request, options);
    }
}
