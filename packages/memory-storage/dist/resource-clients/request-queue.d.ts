import type * as storage from '@crawlee/types';
import type { MemoryStorage } from '../index';
import { BaseClient } from './common/base-client';
export interface RequestQueueClientOptions {
    name?: string;
    id?: string;
    baseStorageDirectory: string;
    client: MemoryStorage;
}
export interface InternalRequest {
    id: string;
    orderNo: number | null;
    url: string;
    uniqueKey: string;
    method: Exclude<storage.RequestOptions['method'], undefined>;
    retryCount: number;
    json: string;
}
export declare class RequestQueueClient extends BaseClient implements storage.RequestQueueClient {
    name?: string;
    createdAt: Date;
    accessedAt: Date;
    modifiedAt: Date;
    handledRequestCount: number;
    pendingRequestCount: number;
    requestQueueDirectory: string;
    private readonly requests;
    private readonly client;
    constructor(options: RequestQueueClientOptions);
    get(): Promise<storage.RequestQueueInfo | undefined>;
    update(newFields: {
        name?: string | undefined;
    }): Promise<storage.RequestQueueInfo | undefined>;
    delete(): Promise<void>;
    listHead(options?: storage.ListOptions): Promise<storage.QueueHead>;
    addRequest(request: storage.RequestSchema, options?: storage.RequestOptions): Promise<storage.QueueOperationInfo>;
    batchAddRequests(requests: storage.RequestSchema[], options?: storage.RequestOptions): Promise<storage.BatchAddRequestsResult>;
    getRequest(id: string): Promise<storage.RequestOptions | undefined>;
    updateRequest(request: storage.UpdateRequestSchema, options?: storage.RequestOptions): Promise<storage.QueueOperationInfo>;
    deleteRequest(id: string): Promise<void>;
    toRequestQueueInfo(): storage.RequestQueueInfo;
    private updateTimestamps;
    private _jsonToRequest;
    private _createInternalRequest;
    private _calculateOrderNo;
}
//# sourceMappingURL=request-queue.d.ts.map