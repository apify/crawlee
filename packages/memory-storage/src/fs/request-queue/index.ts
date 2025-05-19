import { RequestQueueFileSystemEntry } from './fs.js';
import { RequestQueueMemoryEntry } from './memory.js';

export function createRequestQueueStorageImplementation(options: CreateStorageImplementationOptions) {
    if (options.persistStorage) {
        return new RequestQueueFileSystemEntry(options);
    }

    return new RequestQueueMemoryEntry();
}

export interface CreateStorageImplementationOptions {
    persistStorage: boolean;
    storeDirectory: string;
    requestId: string;
}
