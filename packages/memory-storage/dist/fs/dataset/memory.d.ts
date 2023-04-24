import type { StorageImplementation } from '../common';
export declare class DatasetMemoryEntry<Data> implements StorageImplementation<Data> {
    private data;
    get(): Promise<Data>;
    update(data: Data): void;
    delete(): void;
}
//# sourceMappingURL=memory.d.ts.map