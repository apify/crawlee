import type { Dictionary } from '@crawlee/types';

import type { Request } from '../request.js';
import type { ReclaimableRequestLoader } from './request_list.js';
import type {
    AddRequestsBatchedResult,
    IRequestManager,
    RequestQueueOperationInfo,
    RequestQueueOperationOptions,
} from './request_provider.js';

/**
 * Adapts the {@apilink IRequestLoader} interface to the {@apilink IRequestManager} interface.
 * It simply throws an exception when inserting requests is attempted.
 * @internal
 */
export class RequestListAdapter implements IRequestManager {
    constructor(private requestLoader: ReclaimableRequestLoader) {}

    /**
     * @inheritdoc
     */
    async isFinished(): Promise<boolean> {
        return this.requestLoader.isFinished();
    }

    /**
     * @inheritdoc
     */
    async isEmpty(): Promise<boolean> {
        return this.requestLoader.isEmpty();
    }

    /**
     * @inheritdoc
     */
    async handledCount(): Promise<number> {
        return this.requestLoader.handledCount();
    }

    /**
     * @inheritdoc
     */
    getTotalCount(): number {
        return this.requestLoader.getTotalCount();
    }

    /**
     * @inheritdoc
     */
    getPendingCount(): number {
        return this.requestLoader.getPendingCount();
    }

    /**
     * @inheritdoc
     */
    async fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null> {
        return await this.requestLoader.fetchNextRequest();
    }

    /**
     * @inheritdoc
     */
    async markRequestHandled(request: Request): Promise<RequestQueueOperationInfo | void | null> {
        return this.requestLoader.markRequestHandled(request);
    }

    /**
     * @inheritdoc
     */
    async reclaimRequest(
        request: Request,
        _options?: RequestQueueOperationOptions,
    ): Promise<RequestQueueOperationInfo | null> {
        await this.requestLoader.reclaimRequest(request);
        return null;
    }

    /**
     * @inheritdoc
     */
    async *[Symbol.asyncIterator]() {
        for await (const request of this.requestLoader) {
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
