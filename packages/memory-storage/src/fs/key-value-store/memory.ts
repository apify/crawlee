import type { InternalKeyRecord } from '../../resource-clients/key-value-store';
import type { StorageImplementation } from '../common';

export class KeyValueMemoryEntry implements StorageImplementation<InternalKeyRecord> {
    private data!: InternalKeyRecord;

    async get() {
        return this.data;
    }

    update(data: InternalKeyRecord) {
        this.data = data;
    }

    delete() {
        // No-op
    }
}
