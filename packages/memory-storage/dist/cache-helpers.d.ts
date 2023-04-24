import type * as storage from '@crawlee/types';
import type { MemoryStorage } from './memory-storage';
export declare function findOrCacheDatasetByPossibleId(client: MemoryStorage, entryNameOrId: string): Promise<DatasetClient<storage.Dictionary> | undefined>;
export declare function findOrCacheKeyValueStoreByPossibleId(client: MemoryStorage, entryNameOrId: string): Promise<KeyValueStoreClient | undefined>;
export declare function findRequestQueueByPossibleId(client: MemoryStorage, entryNameOrId: string): Promise<RequestQueueClient | undefined>;
import { DatasetClient } from './resource-clients/dataset';
import { KeyValueStoreClient } from './resource-clients/key-value-store';
import { RequestQueueClient } from './resource-clients/request-queue';
//# sourceMappingURL=cache-helpers.d.ts.map