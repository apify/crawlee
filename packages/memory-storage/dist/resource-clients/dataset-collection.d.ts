import type * as storage from '@crawlee/types';
import type { MemoryStorage } from '../index';
export interface DatasetCollectionClientOptions {
    baseStorageDirectory: string;
    client: MemoryStorage;
}
export declare class DatasetCollectionClient implements storage.DatasetCollectionClient {
    private readonly datasetsDirectory;
    private readonly client;
    constructor({ baseStorageDirectory, client }: DatasetCollectionClientOptions);
    list(): ReturnType<storage.DatasetCollectionClient['list']>;
    getOrCreate(name?: string): Promise<storage.DatasetInfo>;
}
//# sourceMappingURL=dataset-collection.d.ts.map