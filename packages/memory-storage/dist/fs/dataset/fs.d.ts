import type { CreateStorageImplementationOptions } from './index';
import type { StorageImplementation } from '../common';
export declare class DatasetFileSystemEntry<Data> implements StorageImplementation<Data> {
    private filePath;
    private fsQueue;
    constructor(options: CreateStorageImplementationOptions);
    get(): Promise<any>;
    update(data: Data): Promise<void>;
    delete(): Promise<void>;
}
//# sourceMappingURL=fs.d.ts.map