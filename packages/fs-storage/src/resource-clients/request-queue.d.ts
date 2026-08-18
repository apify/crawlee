import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import type { FileSystemRequestQueueClient as NativeFileSystemRequestQueueBackend } from '@crawlee/fs-storage-native';
import { CachedIdClient } from './cached-id-client.js';
export interface RequestQueueBackendOptions {
    /** The user-facing storage name, or `undefined` for unnamed (alias / default) storages. */
    name?: string;
    /**
     * The key used for cache lookup in {@link FileSystemStorageBackend}. For named storages this equals
     * the name; for alias (unnamed) storages it is the alias string. Falls back to the storage id.
     */
    cacheKey: string;
    nativeBackend: NativeFileSystemRequestQueueBackend;
    logger?: CrawleeLogger;
}
/**
 * A file-system request queue backend backed by the native `@crawlee/fs-storage-native` Rust
 * extension.
 *
 * Request ordering, in-progress locking and state persistence are all owned by the native client.
 * This adapter forwards each operation and converts result shapes to the `@crawlee/types` interfaces.
 */
export declare class RequestQueueBackend extends CachedIdClient implements storage.RequestQueueBackend {
    #private;
    readonly name?: string;
    readonly cacheKey: string;
    constructor(options: RequestQueueBackendOptions);
    get requestQueueDirectory(): string;
    static create(options: RequestQueueBackendOptions): Promise<RequestQueueBackend>;
    /**
     * Tells the native client how long (in seconds) a fetched request stays locked before it becomes
     * available again.
     */
    setExpectedRequestProcessingTimeSecs(secs: number): Promise<void>;
    getMetadata(): Promise<storage.RequestQueueInfo>;
    drop(): Promise<void>;
    purge(): Promise<void>;
    addBatchOfRequests(requests: storage.RequestSchema[], options?: storage.RequestQueueOperationOptions): Promise<storage.BatchAddRequestsResult>;
    getRequest(uniqueKey: string): Promise<storage.UpdateRequestSchema | undefined>;
    fetchNextRequest(): Promise<storage.UpdateRequestSchema | undefined>;
    markRequestAsHandled(request: storage.UpdateRequestSchema): Promise<storage.QueueOperationInfo | undefined>;
    reclaimRequest(request: storage.UpdateRequestSchema, options?: storage.RequestQueueOperationOptions): Promise<storage.QueueOperationInfo | undefined>;
    isEmpty(): Promise<boolean>;
    isFinished(): Promise<boolean>;
    /**
     * Persist the native client's in-memory state to disk. Called by
     * {@link FileSystemStorageBackend.teardown} so that fetched-but-unhandled requests are not stuck
     * for the next consumer of the same on-disk queue.
     */
    persistState(): Promise<void>;
}
