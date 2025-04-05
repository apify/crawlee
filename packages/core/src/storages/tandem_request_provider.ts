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
     * Starts transferring requests from RequestList to RequestQueue in the background.
     * This should be called when the provider is initialized to ensure all requests
     * are properly transferred.
     */
    async startBackgroundTransfer(): Promise<void> {
        if (this.listFinishedPromise) return;

        this.listFinishedPromise = this.transferAllListRequestsToQueue();
    }

    /**
     * Transfers all requests from the RequestList to the RequestQueue in the background.
     * @private
     */
    private async transferAllListRequestsToQueue(): Promise<void> {
        for await (const request of this.requestList) {
            try {
                await this.requestQueue.addRequest(request, { forefront: true });
                await this.requestList.markRequestHandled(request);
            } catch (err) {
                this.log.error(
                    'Adding of request from the RequestList to the RequestQueue failed, reclaiming request back to the list.',
                    { request },
                );
                await this.requestList.reclaimRequest(request);
            }
        }
    }

    /**
     * @inheritdoc
     */
    async isFinished(): Promise<boolean> {
        const listFinished = await this.requestList.isFinished();
        return listFinished && await this.requestQueue.isFinished();
    }

    /**
     * @inheritdoc
     */
    async isEmpty(): Promise<boolean> {
        const listEmpty = await this.requestList.isEmpty();
        return listEmpty && await this.requestQueue.isEmpty();
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
    async fetchNextRequest<T extends Dictionary = Dictionary>(options?: RequestOptions): Promise<Request<T> | null> {
        // Start the background transfer if not already started
        if (!this.listFinishedPromise) {
            await this.startBackgroundTransfer();
        }

        // Simply forward the request to the queue
        return this.requestQueue.fetchNextRequest<T>(options);
    }

    /**
     * @inheritdoc
     */
    async *[Symbol.asyncIterator]() {
        if (!this.listFinishedPromise) {
            await this.startBackgroundTransfer();
        }
        
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
    async reclaimRequest(request: Request, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo | void | null> {
        return this.requestQueue.reclaimRequest(request, options);
    }

    /**
     * Additional method to add new requests directly to the underlying RequestQueue.
     */
    async addRequest(request: Request | RequestOptions, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo | null> {
        return this.requestQueue.addRequest(request, options);
    }
} 
