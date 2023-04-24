import type { InternalKeyRecord } from '../../resource-clients/key-value-store';
import type { StorageImplementation } from '../common';
export declare class KeyValueMemoryEntry implements StorageImplementation<InternalKeyRecord> {
    private data;
    get(): Promise<InternalKeyRecord>;
    update(data: InternalKeyRecord): void;
    delete(): void;
}
//# sourceMappingURL=memory.d.ts.map