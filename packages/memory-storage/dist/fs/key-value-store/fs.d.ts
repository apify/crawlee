import type { CreateStorageImplementationOptions } from '.';
import type { InternalKeyRecord } from '../../resource-clients/key-value-store';
import type { StorageImplementation } from '../common';
export declare class KeyValueFileSystemEntry implements StorageImplementation<InternalKeyRecord> {
    private storeDirectory;
    private writeMetadata;
    private filePath;
    private fileMetadataPath;
    private rawRecord;
    private fsQueue;
    constructor(options: CreateStorageImplementationOptions);
    get(): Promise<InternalKeyRecord>;
    update(data: InternalKeyRecord): Promise<void>;
    delete(): Promise<void>;
}
//# sourceMappingURL=fs.d.ts.map