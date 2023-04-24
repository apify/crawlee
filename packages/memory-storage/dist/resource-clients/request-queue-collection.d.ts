import type * as storage from '@crawlee/types';
import type { MemoryStorage } from '../index';
export interface RequestQueueCollectionClientOptions {
    baseStorageDirectory: string;
    client: MemoryStorage;
}
export declare class RequestQueueCollectionClient implements storage.RequestQueueCollectionClient {
    private readonly requestQueuesDirectory;
    private readonly client;
    constructor({ baseStorageDirectory, client }: RequestQueueCollectionClientOptions);
    list(): ReturnType<storage.RequestQueueCollectionClient['list']>;
    getOrCreate(name?: string): Promise<storage.RequestQueueInfo>;
}
//# sourceMappingURL=request-queue-collection.d.ts.map