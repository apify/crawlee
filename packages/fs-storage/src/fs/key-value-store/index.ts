import type { CrawleeLogger } from '@crawlee/types';

import type { InternalKeyRecord } from '../../resource-clients/key-value-store.js';
import type { StorageImplementation } from '../common.js';
import { KeyValueFileSystemEntry } from './fs.js';

export function createKeyValueStorageImplementation(
    options: CreateStorageImplementationOptions,
): StorageImplementation<InternalKeyRecord> {
    return new KeyValueFileSystemEntry(options);
}

export interface CreateStorageImplementationOptions {
    storeDirectory: string;
    writeMetadata: boolean;
    logger?: CrawleeLogger;
}
