import { BatchAddRequestsResult, Dictionary } from '@crawlee/types';
import { Source, Request } from '../request';
import {
    AddRequestsBatchedOptions,
    AddRequestsBatchedResult,
    IRequestManager,
    RequestQueueOperationInfo,
    RequestQueueOperationOptions,
} from './request_manager';
import type { IRequestList } from './request_list';
import type { Log } from '@apify/log';

export class RequestManagerTandem implements IRequestManager {
    private readOnlyRequestLoader: IRequestList;
    private readWriteRequestManager: IRequestManager;
    private log: Log;

    constructor({
        requestList,
        requestQueue,
        log,
    }: { requestList: IRequestList; requestQueue: IRequestManager; log: Log }) {
        this.readOnlyRequestLoader = requestList;
        this.readWriteRequestManager = requestQueue;
        this.log = log;
    }

    async drop(): Promise<void> {
        await this.readWriteRequestManager.drop();
    }

    getTotalCount(): number {
        return this.readOnlyRequestLoader.length() + this.readWriteRequestManager.getTotalCount();
    }

    async addRequest(requestLike: Source, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo> {
        return await this.readWriteRequestManager.addRequest(requestLike, options);
    }

    async addRequests(requestsLike: Source[], options?: RequestQueueOperationOptions): Promise<BatchAddRequestsResult> {
        return await this.readWriteRequestManager.addRequests(requestsLike, options);
    }

    async addRequestsBatched(
        requests: (string | Source)[],
        options?: AddRequestsBatchedOptions,
    ): Promise<AddRequestsBatchedResult> {
        return await this.readWriteRequestManager.addRequestsBatched(requests, options);
    }

    async getRequest<T extends Dictionary = Dictionary>(id: string): Promise<Request<T> | null> {
        return await this.readWriteRequestManager.getRequest(id);
    }

    async fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null> {
        if (await this.readOnlyRequestLoader.isFinished()) {
            return await this.readWriteRequestManager.fetchNextRequest();
        }

        const request = await this.readOnlyRequestLoader.fetchNextRequest();
        if (!request) {
            return await this.readWriteRequestManager.fetchNextRequest();
        }

        try {
            await this.readWriteRequestManager.addRequest(request, { forefront: true });
        } catch (err) {
            // If readWriteRequestManager.addRequest() fails here then we must reclaim it back to
            // the RequestList because probably it's not yet in the queue!
            this.log.error(
                'Adding of request from the RequestList to the RequestQueue failed, reclaiming request back to the list.',
                { request },
            );
            await this.readOnlyRequestLoader.reclaimRequest(request);
            return null;
        }
        await this.readOnlyRequestLoader.markRequestHandled(request);
        return this.readWriteRequestManager.fetchNextRequest();
    }

    async markRequestHandled(request: Request): Promise<RequestQueueOperationInfo | null> {
        return await this.readWriteRequestManager.markRequestHandled(request);
    }

    async reclaimRequest(
        request: Request,
        options?: RequestQueueOperationOptions,
    ): Promise<RequestQueueOperationInfo | null> {
        return await this.readWriteRequestManager.reclaimRequest(request, options);
    }

    async isEmpty(): Promise<boolean> {
        return (await this.readOnlyRequestLoader.isEmpty()) && (await this.readWriteRequestManager.isEmpty());
    }

    async isFinished(): Promise<boolean> {
        return (await this.readOnlyRequestLoader.isFinished()) && (await this.readWriteRequestManager.isFinished());
    }

    async handledCount(): Promise<number> {
        return await this.readWriteRequestManager.handledCount();
    }
}
