import type { InternalRequest } from '../../resource-clients/request-queue.js';
import type { StorageImplementation } from '../common.js';

export class RequestQueueMemoryEntry implements StorageImplementation<InternalRequest> {
    private data!: InternalRequest;

    public orderNo?: number | null;

    async get() {
        return this.data;
    }

    update(data: InternalRequest) {
        this.data = data;
        this.orderNo = data.orderNo;
    }

    delete() {
        // No-op
    }
}
