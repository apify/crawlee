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
 * It first reads requests from the RequestList and then, when needed,
 * transfers them in batches to the RequestQueue.
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
     * Transfers a batch of requests from the RequestList to the RequestQueue.
     * Handles both successful transfers and failures appropriately.
     * @private
     */
    private async transferNextBatchToQueue(batchSize = 25): Promise<void> {
        const requests: Request[] = [];
        
        // First collect up to batchSize requests from the list
        while (requests.length < batchSize) {
            const request = await this.requestList.fetchNextRequest();
            if (!request) break; // RequestList is empty
            requests.push(request);
        }

        if (requests.length === 0) return;

        try {
            // Add all requests to the queue in a single batch operation
            const result = await this.requestQueue.addRequests(requests, { forefront: true });
            
            // Mark successfully added requests as handled in the list
            for (let i = 0; i < result.processedRequests.length; i++) {
                await this.requestList.markRequestHandled(requests[i]);
            }

            // Reclaim any requests that failed to be added
            if (result.unprocessedRequests?.length) {
                this.log.error(
                    'Adding some requests from the RequestList to the RequestQueue failed, reclaiming requests back to the list.',
                    { unprocessedCount: result.unprocessedRequests.length },
                );
                for (const failedRequest of result.unprocessedRequests) {
                    const originalRequest = requests.find((r) => r.uniqueKey === failedRequest.uniqueKey);
                    if (originalRequest) {
                        await this.requestList.reclaimRequest(originalRequest);
                    }
                }
            }
        } catch (err) {
            this.log.error(
                'Batch adding of requests from the RequestList to the RequestQueue failed, reclaiming all requests back to the list.',
                { requestCount: requests.length },
            );
            // If the batch operation fails entirely, reclaim all requests
            await Promise.all(requests.map((request) => this.requestList.reclaimRequest(request)));
        }
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
            this.requestList.isFinished()
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
