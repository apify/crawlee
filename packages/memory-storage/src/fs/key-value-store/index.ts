import type { InternalKeyRecord } from '../../resource-clients/key-value-store.js';
import type { StorageImplementation } from '../common.js';
import { KeyValueFileSystemEntry } from './fs.js';
import { KeyValueMemoryEntry } from './memory.js';

export function createKeyValueStorageImplementation(
    options: CreateStorageImplementationOptions,
): StorageImplementation<InternalKeyRecord> {
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
