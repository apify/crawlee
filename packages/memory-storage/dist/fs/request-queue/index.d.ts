import type { InternalRequest } from '../../resource-clients/request-queue';
import type { StorageImplementation } from '../common';
export declare function createRequestQueueStorageImplementation(options: CreateStorageImplementationOptions): StorageImplementation<InternalRequest>;
export interface CreateStorageImplementationOptions {
    persistStorage: boolean;
    storeDirectory: string;
    requestId: string;
}
//# sourceMappingURL=index.d.ts.map