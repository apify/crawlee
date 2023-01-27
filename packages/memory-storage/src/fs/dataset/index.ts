import type { Dictionary } from '@crawlee/types';
import type { StorageImplementation } from '../common';
import { DatasetFileSystemEntry } from './fs';
import { DatasetMemoryEntry } from './memory';

export function createDatasetStorageImplementation<Data extends Dictionary>(options: CreateStorageImplementationOptions): StorageImplementation<Data> {
    if (options.persistStorage) {
        return new DatasetFileSystemEntry<Data>(options);
    }

    return new DatasetMemoryEntry<Data>();
}

export interface CreateStorageImplementationOptions {
    persistStorage: boolean;
    storeDirectory: string;
    /** The actual id of the file to save */
    entityId: string;
}
