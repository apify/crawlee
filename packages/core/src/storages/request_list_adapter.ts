import type { Dictionary } from '@crawlee/types';

import type { Request, RequestOptions } from '../request';
import type { IRequestList } from './request_list';
import type {
    AddRequestsBatchedResult,
    IRequestManager,
    RequestQueueOperationInfo,
    RequestQueueOperationOptions,
} from './request_provider';

/**
 * Adapts the IRequestList interface to the IRequestManager interface.
 * It simply throws an exception when inserting requests is attempted.
 * @internal
 */
export class RequestListAdapter implements IRequestManager {
    constructor(private requestList: IRequestList) {}

    /**
     * @inheritdoc
     */
    async isFinished(): Promise<boolean> {
        return this.requestList.isFinished();
    }

    /**
     * @inheritdoc
     */
    async isEmpty(): Promise<boolean> {
        return this.requestList.isEmpty();
    }

    /**
     * @inheritdoc
     */
    async handledCount(): Promise<number> {
        return Promise.resolve(this.requestList.handledCount());
    }

    /**
     * @inheritdoc
     */
    getTotalCount(): number {
        return this.requestList.length();
    }

    /**
     * @inheritdoc
     */
    getPendingCount(): number {
        return this.requestList.length() - this.requestList.handledCount();
    }

    /**
     * @inheritdoc
     */
    async fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null> {
        return await this.requestList.fetchNextRequest();
    }

    /**
     * @inheritdoc
     */
    async markRequestHandled(request: Request): Promise<void> {
        return this.requestList.markRequestHandled(request);
    }

    /**
     * @inheritdoc
     */
    async reclaimRequest(request: Request, _options?: RequestQueueOperationOptions): Promise<void> {
        return this.requestList.reclaimRequest(request);
    }

    /**
     * @inheritdoc
     */
    async *[Symbol.asyncIterator]() {
        for await (const request of this.requestList) {
            yield request;
        }
    }

    /**
     * @inheritdoc
     */
    addRequestsBatched(): Promise<AddRequestsBatchedResult> {
        throw new Error('Cannot add requests to a read-only request list');
    }

    /**
     * @inheritdoc
     */
    addRequest(): Promise<RequestQueueOperationInfo> {
        throw new Error('Cannot add requests to a read-only request list');
    }
}
