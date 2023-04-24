import type * as storage from '@crawlee/types';
import type { MemoryStorage } from '../index';
export interface KeyValueStoreCollectionClientOptions {
    baseStorageDirectory: string;
    client: MemoryStorage;
}
export declare class KeyValueStoreCollectionClient implements storage.KeyValueStoreCollectionClient {
    private readonly keyValueStoresDirectory;
    private readonly client;
    constructor({ baseStorageDirectory, client }: KeyValueStoreCollectionClientOptions);
    list(): ReturnType<storage.KeyValueStoreCollectionClient['list']>;
    getOrCreate(name?: string): Promise<storage.KeyValueStoreInfo>;
}
//# sourceMappingURL=key-value-store-collection.d.ts.map