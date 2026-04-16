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

export interface DatasetClientUpdateOptions {
    name?: string;
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
    getMetadata(): Promise<DatasetInfo>;
    update(newFields: DatasetClientUpdateOptions): Promise<Partial<DatasetInfo>>;
    delete(): Promise<void>;
    downloadItems(...args: unknown[]): Promise<Buffer>;
    listItems(options?: DatasetClientListOptions): AsyncIterable<Data> & Promise<PaginatedList<Data>>;
    listEntries?(
        options?: DatasetClientListOptions,
    ): AsyncIterable<[number, Data]> & Promise<PaginatedList<[number, Data]>>;
    pushItems(items: Data | Data[] | string | string[]): Promise<void>;
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

export interface KeyValueStoreRecordOptions {
    timeoutSecs?: number;
    doNotRetryTimeouts?: boolean;
}

export interface KeyValueStoreClientUpdateOptions {
    name?: string;
}

export interface KeyValueStoreClientListOptions {
    limit?: number;
    exclusiveStartKey?: string;
    collection?: string;
    prefix?: string;
}

export interface KeyValueStoreItemData {
    key: string;
    size: number;
}

export interface KeyValueStoreClientListData {
    count: number;
    limit: number;
    exclusiveStartKey?: string;
    isTruncated: boolean;
    nextExclusiveStartKey?: string;
    items: KeyValueStoreItemData[];
}

export interface KeyValueStoreClientGetRecordOptions {
    buffer?: boolean;
    stream?: boolean;
}

/**
 * Key-value Store client.
 */
export interface KeyValueStoreClient {
    getMetadata(): Promise<KeyValueStoreInfo>;
    update(newFields: KeyValueStoreClientUpdateOptions): Promise<Partial<KeyValueStoreInfo>>;
    delete(): Promise<void>;
    listKeys(
        options?: KeyValueStoreClientListOptions,
    ): Partial<AsyncIterable<KeyValueStoreItemData>> & Promise<KeyValueStoreClientListData>;
    keys?(options?: KeyValueStoreClientListOptions): AsyncIterable<string> & Promise<KeyValueStoreClientListData>;
    values?(options?: KeyValueStoreClientListOptions): AsyncIterable<unknown> & Promise<unknown[]>;
    entries?(options?: KeyValueStoreClientListOptions): AsyncIterable<[string, unknown]> & Promise<[string, unknown][]>;
    recordExists(key: string): Promise<boolean>;
    getRecordPublicUrl(key: string): Promise<string | undefined>;
    getRecord(key: string, options?: KeyValueStoreClientGetRecordOptions): Promise<KeyValueStoreRecord | undefined>;
    setRecord(record: KeyValueStoreRecord, options?: KeyValueStoreRecordOptions): Promise<void>;
    deleteRecord(key: string): Promise<void>;
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

export interface RequestQueueHeadItem {
    id: string;
    retryCount: number;
    uniqueKey: string;
    url: string;
    method: AllowedHttpMethods;
}

export interface QueueHead {
    limit: number;
    queueModifiedAt: Date;
    hadMultipleClients?: boolean;
    items: RequestQueueHeadItem[];
}

export interface ListOptions {
    /**
     * @default 100
     */
    limit?: number;
}

export interface ListAndLockOptions extends ListOptions {
    lockSecs: number;
}

export interface ListAndLockHeadResult extends QueueHead {
    lockSecs: number;
    queueHasLockedRequests?: boolean;
}

export interface ProlongRequestLockOptions {
    lockSecs: number;
    forefront?: boolean;
}

export interface ProlongRequestLockResult {
    lockExpiresAt: Date;
}

export interface DeleteRequestLockOptions {
    forefront?: boolean;
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

export interface RequestQueueClient {
    getMetadata(): Promise<RequestQueueInfo>;
    update(newFields: { name?: string }): Promise<Partial<RequestQueueInfo> | undefined>;
    delete(): Promise<void>;
    listHead(options?: ListOptions): Promise<QueueHead>;
    addRequest(request: RequestSchema, options?: RequestOptions): Promise<QueueOperationInfo>;
    batchAddRequests(requests: RequestSchema[], options?: RequestOptions): Promise<BatchAddRequestsResult>;
    getRequest(id: string): Promise<RequestOptions | undefined>;
    updateRequest(request: UpdateRequestSchema, options?: RequestOptions): Promise<QueueOperationInfo>;
    deleteRequest(id: string): Promise<unknown>;
    listAndLockHead(options: ListAndLockOptions): Promise<ListAndLockHeadResult>;
    prolongRequestLock(id: string, options: ProlongRequestLockOptions): Promise<ProlongRequestLockResult>;
    deleteRequestLock(id: string, options?: DeleteRequestLockOptions): Promise<void>;
}

export interface RequestQueueOptions {
    clientKey?: string;
    timeoutSecs?: number;
}

export interface SetStatusMessageOptions {
    isStatusMessageTerminal?: boolean;
    level?: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
}

/**
 * Identifies a storage by either its ID or its name. At most one should be provided.
 * If neither is provided, the default storage for the given type is used.
 */
export interface StorageIdentifier {
    /** ID of an existing storage to open. */
    id?: string;
    /** Name of the storage to open or create. */
    name?: string;
}

/**
 * Options for creating a dataset client via {@apilink StorageClient.createDatasetClient}.
 */
export interface CreateDatasetClientOptions extends StorageIdentifier {}

/**
 * Options for creating a key-value store client via {@apilink StorageClient.createKeyValueStoreClient}.
 */
export interface CreateKeyValueStoreClientOptions extends StorageIdentifier {}

/**
 * Options for creating a request queue client via {@apilink StorageClient.createRequestQueueClient}.
 */
export interface CreateRequestQueueClientOptions extends StorageIdentifier {
    /**
     * Client key for request locking.
     * TODO: This is an Apify-platform concern and should eventually be pushed down
     * into the Apify SDK's client implementation (aligning with crawlee-python).
     */
    clientKey?: string;
    /**
     * Timeout in seconds for request queue operations.
     * TODO: This is an Apify-platform concern and should eventually be pushed down
     * into the Apify SDK's client implementation (aligning with crawlee-python).
     */
    timeoutSecs?: number;
}

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
    purge?(): Promise<void>;
    teardown?(): Promise<void>;
    setStatusMessage?(message: string, options?: SetStatusMessageOptions): Promise<void>;
    stats?: { rateLimitErrors: number[] };
}
