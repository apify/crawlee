import type { InternalKeyRecord } from '../../resource-clients/key-value-store';
import type { StorageImplementation } from '../common';
import { KeyValueFileSystemEntry } from './fs';
import { KeyValueMemoryEntry } from './memory';

export function createKeyValueStorageImplementation(options: CreateStorageImplementationOptions): StorageImplementation<InternalKeyRecord> {
    if (options.persistStorage) {
        return new KeyValueFileSystemEntry(options);
    }

    return new KeyValueMemoryEntry();
}

export interface CreateStorageImplementationOptions {
    persistStorage: boolean;
    storeDirectory: string;
    writeMetadata: boolean;
}
