import type * as storage from '@crawlee/types';
/**
 * Removes all properties with a null value
 * from the provided object.
 */
export declare function purgeNullsFromObject<T>(object: T): T;
/**
 * Creates a standard request ID (same as Platform).
 */
export declare function uniqueKeyToRequestId(uniqueKey: string): string;
export declare function isBuffer(value: unknown): boolean;
export declare function isStream(value: any): boolean;
export declare const memoryStorageLog: import("@apify/log").Log;
export interface WorkerData {
    datasetsDirectory: string;
    keyValueStoresDirectory: string;
    requestQueuesDirectory: string;
}
export type WorkerReceivedMessage = WorkerUpdateMetadataMessage;
export type WorkerUpdateMetadataMessage = MetadataUpdate<'datasets', storage.DatasetInfo> | MetadataUpdate<'keyValueStores', storage.KeyValueStoreInfo> | MetadataUpdate<'requestQueues', storage.RequestQueueInfo>;
type EntityType = 'datasets' | 'keyValueStores' | 'requestQueues';
interface MetadataUpdate<Type extends EntityType, DataType> {
    entityType: Type;
    id: string;
    action: 'update-metadata';
    entityDirectory: string;
    data: DataType;
    writeMetadata: boolean;
    persistStorage: boolean;
}
export {};
//# sourceMappingURL=utils.d.ts.map