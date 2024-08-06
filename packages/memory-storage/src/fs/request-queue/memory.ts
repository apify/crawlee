import type { InternalRequest } from '../../resource-clients/request-queue';
import type { StorageImplementation } from '../common';

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
