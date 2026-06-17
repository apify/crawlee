import { RequestQueueFileSystemEntry } from './fs.js';

export function createRequestQueueStorageImplementation(options: CreateStorageImplementationOptions) {
    return new RequestQueueFileSystemEntry(options);
}

export interface CreateStorageImplementationOptions {
    storeDirectory: string;
    requestId: string;
}
