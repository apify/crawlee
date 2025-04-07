import type { Dictionary } from '@crawlee/types';
import type { Request, RequestOptions } from '../request';
import type { IRequestList } from './request_list';
import type { IRequestProvider, RequestQueueOperationInfo, RequestQueueOperationOptions } from './request_provider';

/**
 * Adapts the IRequestList interface to the IRequestProvider interface.
 * This class wraps a RequestList and makes it compatible with the IRequestProvider interface.
 */
export class RequestListAdapter implements IRequestProvider {
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
    async fetchNextRequest<T extends Dictionary = Dictionary>(_options?: RequestOptions): Promise<Request<T> | null> {
        return this.requestList.fetchNextRequest() as Promise<Request<T> | null>;
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
}
