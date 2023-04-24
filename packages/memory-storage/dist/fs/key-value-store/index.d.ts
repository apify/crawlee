import type { InternalKeyRecord } from '../../resource-clients/key-value-store';
import type { StorageImplementation } from '../common';
export declare function createKeyValueStorageImplementation(options: CreateStorageImplementationOptions): StorageImplementation<InternalKeyRecord>;
export interface CreateStorageImplementationOptions {
    persistStorage: boolean;
    storeDirectory: string;
    writeMetadata: boolean;
}
//# sourceMappingURL=index.d.ts.map