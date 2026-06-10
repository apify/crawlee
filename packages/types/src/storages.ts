import type { AllowedHttpMethods, Dictionary } from './utility-types.js';

/**
 * A helper class that is used to report results from various
 * {@apilink RequestQueue} functions as well as {@apilink enqueueLinks}.
 */
export interface QueueOperationInfo {
    /** Indicates if request was already present in the queue. */
    wasAlreadyPresent: boolean;

    /** Indicates if request was already marked as handled. */
    wasAlreadyHandled: boolean;

    /** The ID of the added request */
    requestId: string;
}

export interface PaginatedList<Data> {
    /** Total count of entries in the dataset. */
    total: number;
    /** Count of dataset entries returned in this set. */
    count: number;
    /** Position of the first returned entry in the dataset. */
    offset: number;
    /** Maximum number of dataset entries requested. */
    limit: number;
    /** Should the results be in descending order. */
    desc?: boolean;
    /** Dataset entries based on chosen format parameter. */
    items: Data[];
}

export interface DatasetClientListOptions {
    desc?: boolean;
    limit?: number;
    offset?: number;
}

export interface DatasetInfo {
    id: string;
    name?: string;
    createdAt: Date;
    modifiedAt: Date;
    accessedAt: Date;
    itemCount: number;
    actId?: string;
    actRunId?: string;
}
export interface DatasetStats {
    readCount?: number;
    writeCount?: number;
    deleteCount?: number;
    storageBytes?: number;
}

export interface DatasetClient<Data extends Dictionary = Dictionary> {
    /**
     * Returns metadata about the dataset (id, name, timestamps, item count, etc.).
     *
     * Implementations should throw if the underlying storage no longer exists
     * (e.g. it was deleted externally). This method should never return stale data
     * for a storage that has been removed.
     */
    getMetadata(): Promise<DatasetInfo>;

    /** Remove the dataset and all its data. */
    drop(): Promise<void>;

    /** Remove all items from the dataset but keep the dataset itself. */
    purge(): Promise<void>;

    /** Add items to the dataset. */
    pushData(items: Data[]): Promise<void>;

    /** Fetch a page of items from the dataset. */
    getData(options?: DatasetClientListOptions): Promise<PaginatedList<Data>>;
}

export interface KeyValueStoreStats {
    readCount?: number;
    writeCount?: number;
    deleteCount?: number;
    listCount?: number;
    storageBytes?: number;
}

export interface KeyValueStoreInfo {
    id: string;
    name?: string;
    userId?: string;
    createdAt: Date;
    modifiedAt: Date;
    accessedAt: Date;
    actId?: string;
    actRunId?: string;
    stats?: KeyValueStoreStats;
}

export interface KeyValueStoreRecord {
    key: string;
    value: any;
    contentType?: string;
}

export interface KeyValueStoreListKeysOptions {
    /** If set, only keys that start with this prefix are returned. */
    prefix?: string;
    /** All keys up to this one are skipped from the result. */
    exclusiveStartKey?: string;
    /** Maximum number of keys to return. */
    limit?: number;
}

export interface KeyValueStoreItemData {
    key: string;
    size: number;
}

/**
 * Key-value Store client.
 */
export interface KeyValueStoreClient {
    /**
     * Returns metadata about the key-value store (id, name, timestamps, etc.).
     *
     * Implementations should throw if the underlying storage no longer exists
     * (e.g. it was deleted externally). This method should never return stale data
     * for a storage that has been removed.
     */
    getMetadata(): Promise<KeyValueStoreInfo>;

    /** Remove the key-value store and all its data. */
    drop(): Promise<void>;

    /** Remove all records from the store but keep the store itself. */
    purge(): Promise<void>;

    /** Get a record value by key. Returns the parsed value or `undefined` if not found. */
    getValue(key: string): Promise<KeyValueStoreRecord | undefined>;

    /** Set a record value. */
    setValue(record: KeyValueStoreRecord): Promise<void>;

    /** Delete a record by key. */
    deleteValue(key: string): Promise<void>;

    /** List keys in the store. Returns at most `limit` keys starting after `exclusiveStartKey`. */
    listKeys(options?: KeyValueStoreListKeysOptions): Promise<KeyValueStoreItemData[]>;

    /** Get the public URL for a record, or `undefined` if unavailable. */
    getPublicUrl(key: string): Promise<string | undefined>;

    /** Check whether a record with the given key exists. */
    recordExists(key: string): Promise<boolean>;
}

export interface RequestQueueStats {
    readCount?: number;
    writeCount?: number;
    deleteCount?: number;
    headItemReadCount?: number;
    storageBytes?: number;
}

export interface RequestQueueInfo {
    id: string;
    name?: string;
    userId?: string;
    createdAt: Date;
    modifiedAt: Date;
    accessedAt: Date;
    expireAt?: string;
    totalRequestCount: number;
    handledRequestCount: number;
    pendingRequestCount: number;
    actId?: string;
    actRunId?: string;
    hadMultipleClients?: boolean;
    stats?: RequestQueueStats;
}

export interface RequestOptions {
    forefront?: boolean;
    [k: string]: unknown;
}

export interface RequestSchema {
    id?: string;
    url: string;
    uniqueKey: string;
    method?: AllowedHttpMethods;
    payload?: string;
    noRetry?: boolean;
    retryCount?: number;
    errorMessages?: string[];
    headers?: Dictionary<string>;
    userData?: Dictionary;
    handledAt?: string;
    loadedUrl?: string;
}

export interface UpdateRequestSchema extends RequestSchema {
    id: string;
}

export interface ProcessedRequest {
    uniqueKey: string;
    requestId: string;
    wasAlreadyPresent: boolean;
    wasAlreadyHandled: boolean;
}

export interface UnprocessedRequest {
    uniqueKey: string;
    url: string;
    method?: AllowedHttpMethods;
}

export interface BatchAddRequestsResult {
    processedRequests: ProcessedRequest[];
    unprocessedRequests: UnprocessedRequest[];
}

/**
 * Operations on a single request queue.
 *
 * A backend implementation owns all request bookkeeping (pending, in-progress, handled). Any
 * coordination required between multiple distributed clients accessing the same queue (e.g. request
 * locking on the Apify platform) is an internal concern of the implementation and is not exposed on
 * this interface.
 */
export interface RequestQueueClient {
    /**
     * Returns metadata about the request queue (id, name, timestamps, request counts, etc.).
     *
     * Implementations should throw if the underlying storage no longer exists
     * (e.g. it was deleted externally). This method should never return stale data
     * for a storage that has been removed.
     */
    getMetadata(): Promise<RequestQueueInfo>;

    /** Remove the request queue and all its data. */
    drop(): Promise<void>;

    /** Remove all requests from the queue but keep the queue itself. */
    purge(): Promise<void>;

    /**
     * Add a batch of requests to the queue.
     *
     * Each request is deduplicated by its `uniqueKey`. Duplicates are reported in the result
     * but not re-added. With `forefront`, requests are placed at the beginning of the queue so
     * they are processed sooner.
     */
    addBatchOfRequests(requests: RequestSchema[], options?: RequestOptions): Promise<BatchAddRequestsResult>;

    /**
     * Retrieve a request from the queue by its `uniqueKey`, or `undefined` if it does not exist.
     */
    getRequest(uniqueKey: string): Promise<RequestOptions | undefined>;

    /**
     * Return the next request in the queue to be processed, or `null` if there are currently no
     * pending requests.
     *
     * The returned request is marked as in-progress; it will not be returned again until it is
     * either reclaimed via {@link reclaimRequest} or marked as handled via {@link markRequestAsHandled}.
     *
     * A `null` return value does not mean processing is finished — only that there are no pending
     * requests right now. Use {@link isEmpty} (together with the frontend's knowledge of pending
     * add operations) to determine whether the queue is truly finished.
     */
    fetchNextRequest(): Promise<RequestOptions | null>;

    /**
     * Mark a request previously returned by {@link fetchNextRequest} as handled.
     *
     * Handled requests are never returned again by {@link fetchNextRequest}. Returns information
     * about the operation, or `null` if the request was not in progress.
     */
    markRequestAsHandled(request: UpdateRequestSchema): Promise<QueueOperationInfo | null>;

    /**
     * Reclaim a failed request back to the queue so it can be processed again by a later call to
     * {@link fetchNextRequest}. With `forefront`, the request is returned to the beginning of the
     * queue. Returns information about the operation, or `null` if the request was not in progress.
     */
    reclaimRequest(request: UpdateRequestSchema, options?: RequestOptions): Promise<QueueOperationInfo | null>;

    /**
     * Resolves to `true` if there is no outstanding work left in the queue at all — i.e. there are no
     * pending requests to fetch **and** no requests currently in progress (fetched but not yet handled
     * or reclaimed, including requests locked by other clients sharing the same queue).
     *
     * This is stronger than "the next {@link fetchNextRequest} would return `null`": a queue whose only
     * remaining requests are in progress is **not** empty. This method is therefore a building block for
     * determining whether crawling is finished — though background tasks may still add more requests, so
     * an empty queue does not by itself guarantee completion.
     */
    isEmpty(): Promise<boolean>;
}

export interface SetStatusMessageOptions {
    isStatusMessageTerminal?: boolean;
    level?: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
}

/**
 * Identifies a storage by its ID, name, or alias. At most one may be provided.
 *
 * - `{ id }` — open a pre-existing storage by its unique ID.
 * - `{ name }` — open or create a globally named storage (persists across runs).
 * - `{ alias }` — open or create a run-scoped unnamed storage identified by this alias.
 *   The alias is used locally (e.g. as a directory name or cache key) but the storage
 *   itself has no persistent name. Use this for non-default unnamed storages.
 * - `{}` / omitted — open the default storage.
 */
export type StorageIdentifier =
    | { id: string; name?: never; alias?: never }
    | { id?: never; name: string; alias?: never }
    | { id?: never; name?: never; alias: string }
    | { id?: never; name?: never; alias?: never };

/**
 * Options for creating a dataset client via {@apilink StorageClient.createDatasetClient}.
 */
export type CreateDatasetClientOptions = StorageIdentifier;

/**
 * Options for creating a key-value store client via {@apilink StorageClient.createKeyValueStoreClient}.
 */
export type CreateKeyValueStoreClientOptions = StorageIdentifier;

/**
 * Options for creating a request queue client via {@apilink StorageClient.createRequestQueueClient}.
 */
export type CreateRequestQueueClientOptions = StorageIdentifier & {
    /**
     * Client key for request locking.
     * TODO: This is an Apify-platform concern and should eventually be pushed down
     * into the Apify SDK's client implementation (aligning with crawlee-python).
     * https://github.com/apify/crawlee/issues/3328
     */
    clientKey?: string;
    /**
     * Timeout in seconds for request queue operations.
     * TODO: This is an Apify-platform concern and should eventually be pushed down
     * into the Apify SDK's client implementation (aligning with crawlee-python).
     * https://github.com/apify/crawlee/issues/3328
     */
    timeoutSecs?: number;
};

/**
 * Represents a storage backend capable of working with datasets, key-value stores and request queues.
 *
 * A new storage backend needs to implement 4 classes:
 * - `StorageClient` - the factory that creates sub-clients
 * - `DatasetClient` - operations on a single dataset
 * - `KeyValueStoreClient` - operations on a single key-value store
 * - `RequestQueueClient` - operations on a single request queue
 *
 * The `StorageClient` acts as an async factory: each `create*` method either opens an existing
 * storage or creates a new one, returning a sub-client bound to that storage instance.
 */
export interface StorageClient {
    /**
     * Create (or open) a dataset client.
     * If `id` is provided, opens the dataset with that ID.
     * If `name` is provided, opens an existing dataset with that name or creates a new one.
     * If neither is provided, opens or creates the default dataset.
     */
    createDatasetClient(options?: CreateDatasetClientOptions): Promise<DatasetClient>;
    /**
     * Create (or open) a key-value store client.
     * If `id` is provided, opens the key-value store with that ID.
     * If `name` is provided, opens an existing store with that name or creates a new one.
     * If neither is provided, opens or creates the default key-value store.
     */
    createKeyValueStoreClient(options?: CreateKeyValueStoreClientOptions): Promise<KeyValueStoreClient>;
    /**
     * Create (or open) a request queue client.
     * If `id` is provided, opens the request queue with that ID.
     * If `name` is provided, opens an existing queue with that name or creates a new one.
     * If neither is provided, opens or creates the default request queue.
     */
    createRequestQueueClient(options?: CreateRequestQueueClientOptions): Promise<RequestQueueClient>;
    /**
     * Check whether a storage with the given ID exists.
     *
     * Used internally to resolve ambiguous `idOrName` strings passed to `Dataset.open()`,
     * `KeyValueStore.open()`, and `RequestQueue.open()`.
     */
    storageExists?(id: string, type: 'Dataset' | 'KeyValueStore' | 'RequestQueue'): Promise<boolean>;
    /**
     * Return an opaque key that uniquely identifies this storage backend instance.
     *
     * The key is used by `StorageInstanceManager` to partition the storage cache per-backend,
     * so that two storages with the same name but backed by different clients
     * (e.g. a local `MemoryStorage` and a cloud `ApifyClient`) are cached as separate instances.
     *
     * When not provided, the fallback uses the client's constructor name, so different
     * `StorageClient` implementations automatically get separate cache partitions.
     */
    getStorageClientCacheKey?(): string;
    purge?(): Promise<void>;
    teardown?(): Promise<void>;
    setStatusMessage?(message: string, options?: SetStatusMessageOptions): Promise<void>;
    stats?: { rateLimitErrors: number[] };
}
