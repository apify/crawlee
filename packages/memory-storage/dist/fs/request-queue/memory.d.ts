import type { InternalRequest } from '../../resource-clients/request-queue';
import type { StorageImplementation } from '../common';
export declare class RequestQueueMemoryEntry implements StorageImplementation<InternalRequest> {
    private data;
    get(): Promise<InternalRequest>;
    update(data: InternalRequest): void;
    delete(): void;
}
//# sourceMappingURL=memory.d.ts.map