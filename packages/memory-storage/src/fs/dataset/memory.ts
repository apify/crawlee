import type { StorageImplementation } from '../common';

export class DatasetMemoryEntry<Data> implements StorageImplementation<Data> {
    private data!: Data;

    async get() {
        return this.data;
    }

    update(data: Data) {
        this.data = JSON.parse(JSON.stringify(data));
    }

    delete() {
        // No-op
    }
}
