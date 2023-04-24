import type { Dictionary } from '@crawlee/types';
import type { StorageImplementation } from '../common';
export declare function createDatasetStorageImplementation<Data extends Dictionary>(options: CreateStorageImplementationOptions): StorageImplementation<Data>;
export interface CreateStorageImplementationOptions {
    persistStorage: boolean;
    storeDirectory: string;
    /** The actual id of the file to save */
    entityId: string;
}
//# sourceMappingURL=index.d.ts.map