import type { Dictionary } from '@crawlee/types';

import type { StorageImplementation } from '../common.js';
import { DatasetFileSystemEntry } from './fs.js';

export function createDatasetStorageImplementation<Data extends Dictionary>(
    options: CreateStorageImplementationOptions,
): StorageImplementation<Data> {
    return new DatasetFileSystemEntry<Data>(options);
}

export interface CreateStorageImplementationOptions {
    storeDirectory: string;
    /** The actual id of the file to save */
    entityId: string;
}
