import type { CreateStorageImplementationOptions } from '.';
import type { InternalRequest } from '../../resource-clients/request-queue';
import type { StorageImplementation } from '../common';
export declare class RequestQueueFileSystemEntry implements StorageImplementation<InternalRequest> {
    private filePath;
    private fsQueue;
    constructor(options: CreateStorageImplementationOptions);
    get(): Promise<any>;
    update(data: InternalRequest): Promise<void>;
    delete(): Promise<void>;
}
//# sourceMappingURL=fs.d.ts.map