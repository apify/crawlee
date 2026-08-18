import type { AllowedHttpMethods, Dictionary } from './utility-types';

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

/** Options for a storage client that manages dataset collections. */
export interface DatasetCollectionClientOptions {
    storageDir: string;
}

/** Metadata shared by a dataset collection and its individual datasets. */
export interface DatasetCollectionData {
    /** Unique dataset identifier. */
    id: string;
    /** User-facing dataset name, when one was assigned. */
    name?: string;
    /** Time when the dataset was created. */
    createdAt: Date;
    /** Time when the dataset was last modified. */
    modifiedAt: Date;
    /** Time when the dataset was last accessed. */
    accessedAt: Date;
}

/** A page of items returned by a storage collection or listing operation. */
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

/** Dataset metadata including the current item count. */
export interface Dataset extends DatasetCollectionData {
    /** Number of items currently stored in the dataset. */
    itemCount: number;
}

/**
 * Dataset collection client.
 */
export interface DatasetCollectionClient {
    /** Lists datasets using the collection's default pagination. */
    list(): Promise<PaginatedList<Dataset>>;
    /** Returns an existing dataset or creates one with the supplied name. */
    getOrCreate(name?: string): Promise<DatasetCollectionData>;
}

/** Fields that can be changed on a dataset. */
export interface DatasetClientUpdateOptions {
    /** New user-facing dataset name. */
    name?: string;
}

/** Pagination and ordering options for dataset item listing. */
export interface DatasetClientListOptions {
    /** Whether to list items in descending order. */
    desc?: boolean;
    /** Maximum number of items to return. */
    limit?: number;
    /** Number of items to skip before the first returned item. */
    offset?: number;
}

/** Dataset metadata returned by a dataset client. */
export interface DatasetInfo {
    /** Unique dataset identifier. */
    id: string;
    /** User-facing dataset name, when one was assigned. */
    name?: string;
    /** Time when the dataset was created. */
    createdAt: Date;
    /** Time when the dataset was last modified. */
    modifiedAt: Date;
    /** Time when the dataset was last accessed. */
    accessedAt: Date;
    /** Number of items currently stored in the dataset. */
    itemCount: number;
    /** Apify actor identifier associated with the dataset. */
    actId?: string;
    /** Apify actor run identifier associated with the dataset. */
    actRunId?: string;
}
/** Optional counters and storage size reported for a dataset. */
export interface DatasetStats {
    /** Number of read operations. */
    readCount?: number;
    /** Number of write operations. */
    writeCount?: number;
    /** Number of delete operations. */
    deleteCount?: number;
    /** Number of bytes occupied by stored data. */
    storageBytes?: number;
}

/** Client for reading, updating, and writing items in one dataset. */
export interface DatasetClient<Data extends Dictionary = Dictionary> {
    /** Returns dataset metadata, or undefined when the dataset does not exist. */
    get(): Promise<DatasetInfo | undefined>;
    /** Updates mutable dataset metadata and returns the resulting fields. */
    update(newFields: DatasetClientUpdateOptions): Promise<Partial<DatasetInfo>>;
    /** Deletes the dataset and its stored items. */
    delete(): Promise<void>;
    /** Downloads all dataset items in the requested storage representation. */
    downloadItems(...args: unknown[]): Promise<Buffer>;
    /** Lists dataset items as an async iterable and paginated result. */
    listItems(options?: DatasetClientListOptions): AsyncIterable<Data> & Promise<PaginatedList<Data>>;
    /** Lists dataset entries with their numeric item indexes. */
    listEntries?(
        options?: DatasetClientListOptions,
    ): AsyncIterable<[number, Data]> & Promise<PaginatedList<[number, Data]>>;
    /** Appends one or more items to the dataset. */
    pushItems(items: Data | Data[] | string | string[]): Promise<void>;
}

/** Optional counters and storage size reported for a key-value store. */
export interface KeyValueStoreStats {
    /** Number of read operations. */
    readCount?: number;
    /** Number of write operations. */
    writeCount?: number;
    /** Number of delete operations. */
    deleteCount?: number;
    /** Number of key-listing operations. */
    listCount?: number;
    /** Number of bytes occupied by stored records. */
    storageBytes?: number;
}

/** Metadata returned for a key-value store. */
export interface KeyValueStoreInfo {
    /** Unique key-value store identifier. */
    id: string;
    /** User-facing key-value store name, when one was assigned. */
    name?: string;
    /** User identifier associated with the store. */
    userId?: string;
    /** Time when the store was created. */
    createdAt: Date;
    /** Time when the store was last modified. */
    modifiedAt: Date;
    /** Time when the store was last accessed. */
    accessedAt: Date;
    /** Apify actor identifier associated with the store. */
    actId?: string;
    /** Apify actor run identifier associated with the store. */
    actRunId?: string;
    /** Optional operation statistics. */
    stats?: KeyValueStoreStats;
}

/**
 * Key-value store collection client.
 */
export interface KeyValueStoreCollectionClient {
    /** Lists key-value stores using the collection's default pagination. */
    list(): Promise<PaginatedList<KeyValueStoreInfo>>;
    /** Returns an existing store or creates one with the supplied name. */
    getOrCreate(name?: string): Promise<KeyValueStoreInfo>;
}

export interface KeyValueStoreRecord {
    /** Record key. */
    key: string;
    /** Value stored under the key. */
    value: any;
    /** MIME type associated with the value. */
    contentType?: string;
}

export interface KeyValueStoreRecordOptions {
    /** Maximum time to wait for the operation, in seconds. */
    timeoutSecs?: number;
    /** Whether timeout errors should be returned without retrying. */
    doNotRetryTimeouts?: boolean;
}

/** Fields that can be changed on a key-value store. */
export interface KeyValueStoreClientUpdateOptions {
    /** New user-facing store name. */
    name?: string;
}

/** Pagination and filtering options for key listing. */
export interface KeyValueStoreClientListOptions {
    /** Maximum number of keys or records to return. */
    limit?: number;
    /** Provider cursor used to continue a previous listing. */
    exclusiveStartKey?: string;
    /** Optional collection name used to scope the listing. */
    collection?: string;
    /** Optional key prefix used to filter the listing. */
    prefix?: string;
}

/** Key metadata returned by a key listing operation. */
export interface KeyValueStoreItemData {
    /** Record key. */
    key: string;
    /** Record size in bytes. */
    size: number;
}

/** A page of key metadata and its continuation state. */
export interface KeyValueStoreClientListData {
    count: number;
    limit: number;
    exclusiveStartKey?: string;
    isTruncated: boolean;
    nextExclusiveStartKey?: string;
    items: KeyValueStoreItemData[];
}

/** Output options for reading a key-value record. */
export interface KeyValueStoreClientGetRecordOptions {
    /** Whether binary content should be returned as a buffer. */
    buffer?: boolean;
    /** Whether content should be returned as a stream. */
    stream?: boolean;
}

/**
 * Key-value Store client.
 */
export interface KeyValueStoreClient {
    /** Returns store metadata, or undefined when the store does not exist. */
    get(): Promise<KeyValueStoreInfo | undefined>;
    /** Updates mutable store metadata and returns the resulting fields. */
    update(newFields: KeyValueStoreClientUpdateOptions): Promise<Partial<KeyValueStoreInfo>>;
    /** Deletes the key-value store and its records. */
    delete(): Promise<void>;
    /** Lists keys and their metadata. */
    listKeys(
        options?: KeyValueStoreClientListOptions,
    ): Partial<AsyncIterable<KeyValueStoreItemData>> & Promise<KeyValueStoreClientListData>;
    /** Iterates over keys and returns paginated listing metadata. */
    keys?(options?: KeyValueStoreClientListOptions): AsyncIterable<string> & Promise<KeyValueStoreClientListData>;
    /** Iterates over stored values and returns the collected values. */
    values?(options?: KeyValueStoreClientListOptions): AsyncIterable<unknown> & Promise<unknown[]>;
    /** Iterates over key-value entries and returns the collected entries. */
    entries?(options?: KeyValueStoreClientListOptions): AsyncIterable<[string, unknown]> & Promise<[string, unknown][]>;
    /** Checks whether a record exists under the supplied key. */
    recordExists(key: string): Promise<boolean>;
    /** Reads a record and returns undefined when the key does not exist. */
    getRecord(key: string, options?: KeyValueStoreClientGetRecordOptions): Promise<KeyValueStoreRecord | undefined>;
    /** Writes a record, replacing any existing value under the same key. */
    setRecord(record: KeyValueStoreRecord, options?: KeyValueStoreRecordOptions): Promise<void>;
    /** Deletes the record under the supplied key. */
    deleteRecord(key: string): Promise<void>;
}

/** Optional operation counters and storage size for a request queue. */
export interface RequestQueueStats {
    /** Number of read operations. */
    readCount?: number;
    /** Number of write operations. */
    writeCount?: number;
    /** Number of delete operations. */
    deleteCount?: number;
    /** Number of head-item reads. */
    headItemReadCount?: number;
    /** Number of bytes occupied by stored requests. */
    storageBytes?: number;
}

/** Metadata and counters for a request queue. */
export interface RequestQueueInfo {
    /** Unique request queue identifier. */
    id: string;
    /** User-facing request queue name, when one was assigned. */
    name?: string;
    /** User identifier associated with the queue. */
    userId?: string;
    /** Time when the queue was created. */
    createdAt: Date;
    /** Time when the queue was last modified. */
    modifiedAt: Date;
    /** Time when the queue was last accessed. */
    accessedAt: Date;
    /** Optional expiration timestamp for the queue. */
    expireAt?: string;
    /** Total number of requests in the queue. */
    totalRequestCount: number;
    /** Number of requests already handled. */
    handledRequestCount: number;
    /** Number of requests waiting to be handled. */
    pendingRequestCount: number;
    /** Apify actor identifier associated with the queue. */
    actId?: string;
    /** Apify actor run identifier associated with the queue. */
    actRunId?: string;
    /** Whether multiple clients have used the queue. */
    hadMultipleClients?: boolean;
    /** Optional operation statistics. */
    stats?: RequestQueueStats;
}

/**
 * Request queue collection client.
 */
export interface RequestQueueCollectionClient {
    /** Lists request queues using the collection's default pagination. */
    list(): Promise<PaginatedList<RequestQueueInfo>>;
    /** Returns an existing queue or creates one with the supplied name. */
    getOrCreate(name: string): Promise<RequestQueueInfo>;
}

/** A request summary returned in the head of a request queue. */
export interface RequestQueueHeadItem {
    /** Storage-specific request identifier. */
    id: string;
    /** Number of retries already attempted for the request. */
    retryCount: number;
    /** Stable key used to identify the request uniquely. */
    uniqueKey: string;
    /** Request URL. */
    url: string;
    /** HTTP method associated with the request. */
    method: AllowedHttpMethods;
}

/** A page of request-queue head items and queue state. */
export interface QueueHead {
    /** Maximum number of items requested for the head. */
    limit: number;
    /** Time when the queue was last modified. */
    queueModifiedAt: Date;
    /** Whether multiple clients have used the queue. */
    hadMultipleClients?: boolean;
    /** Requests returned from the queue head. */
    items: RequestQueueHeadItem[];
}

/** Pagination options for request queue reads. */
export interface ListOptions {
    /** Maximum number of items to return. @default 100 */
    limit?: number;
}

/** Options for reading and locking a request queue head. */
export interface ListAndLockOptions extends ListOptions {
    /** Duration of the lock in seconds. */
    lockSecs: number;
}

/** Queue head items returned together with their lock state. */
export interface ListAndLockHeadResult extends QueueHead {
    /** Duration for which returned items are locked. */
    lockSecs: number;
    /** Whether the queue contains requests locked by another client. */
    queueHasLockedRequests?: boolean;
}

/** Options for extending a request lock. */
export interface ProlongRequestLockOptions {
    /** New lock duration in seconds. */
    lockSecs: number;
    /** Whether the request should be moved to the front of the queue. */
    forefront?: boolean;
}

/** Result of extending a request lock. */
export interface ProlongRequestLockResult {
    /** Time when the lock expires. */
    lockExpiresAt: Date;
}

/** Options for deleting a request lock. */
export interface DeleteRequestLockOptions {
    /** Whether the request should be moved to the front of the queue. */
    forefront?: boolean;
}

/** Optional request metadata accepted by storage adapters. */
export interface RequestOptions {
    /** Whether the request should be placed at the front of the queue. */
    forefront?: boolean;
    /** Storage-provider-specific request options. */
    [k: string]: unknown;
}

/** Serialized request fields used by storage clients. */
export interface RequestSchema {
    /** Storage-specific request identifier. */
    id?: string;
    /** URL to request. */
    url: string;
    /** Stable key used to deduplicate the request. */
    uniqueKey: string;
    /** HTTP method used for the request. */
    method?: AllowedHttpMethods;
    /** Optional request payload. */
    payload?: string;
    /** Whether the request should not be retried after failure. */
    noRetry?: boolean;
    /** Number of retries already attempted. */
    retryCount?: number;
    /** Error messages collected from previous attempts. */
    errorMessages?: string[];
    /** Request headers. */
    headers?: Dictionary<string>;
    /** User-defined request data. */
    userData?: Dictionary;
    /** Time when the request was handled. */
    handledAt?: string;
    /** URL reached after redirects or navigation. */
    loadedUrl?: string;
}

/** Request fields required when updating an existing request. */
export interface UpdateRequestSchema extends RequestSchema {
    /** Storage-specific request identifier. */
    id: string;
}

/** A request that was processed during a batch add operation. */
export interface ProcessedRequest {
    /** Stable key used to identify the request. */
    uniqueKey: string;
    /** Storage-specific request identifier. */
    requestId: string;
    /** Whether the request already existed. */
    wasAlreadyPresent: boolean;
    /** Whether the request was already handled. */
    wasAlreadyHandled: boolean;
}

/** A request that could not be processed during a batch add operation. */
export interface UnprocessedRequest {
    /** Stable key used to identify the request. */
    uniqueKey: string;
    /** Request URL. */
    url: string;
    /** HTTP method used for the request. */
    method?: AllowedHttpMethods;
}

/** Results of adding a batch of requests to a queue. */
export interface BatchAddRequestsResult {
    /** Requests successfully processed by the batch operation. */
    processedRequests: ProcessedRequest[];
    /** Requests that could not be processed. */
    unprocessedRequests: UnprocessedRequest[];
}

export interface RequestQueueClient {
    /** Returns queue metadata, or undefined when the queue does not exist. */
    get(): Promise<RequestQueueInfo | undefined>;
    /** Updates mutable queue metadata. */
    update(newFields: { name?: string }): Promise<Partial<RequestQueueInfo> | undefined>;
    /** Deletes the queue and its requests. */
    delete(): Promise<void>;
    /** Reads the next pending requests without locking them. */
    listHead(options?: ListOptions): Promise<QueueHead>;
    /** Adds a request to the queue. */
    addRequest(request: RequestSchema, options?: RequestOptions): Promise<QueueOperationInfo>;
    /** Adds multiple requests and reports per-request results. */
    batchAddRequests(requests: RequestSchema[], options?: RequestOptions): Promise<BatchAddRequestsResult>;
    /** Retrieves a request by storage identifier. */
    getRequest(id: string): Promise<RequestOptions | undefined>;
    /** Updates an existing request and its queue position. */
    updateRequest(request: UpdateRequestSchema, options?: RequestOptions): Promise<QueueOperationInfo>;
    /** Deletes a request by storage identifier. */
    deleteRequest(id: string): Promise<unknown>;
    /** Reads and locks pending requests for exclusive processing. */
    listAndLockHead(options: ListAndLockOptions): Promise<ListAndLockHeadResult>;
    /** Extends the lock held for a request. */
    prolongRequestLock(id: string, options: ProlongRequestLockOptions): Promise<ProlongRequestLockResult>;
    /** Releases a request lock. */
    deleteRequestLock(id: string, options?: DeleteRequestLockOptions): Promise<void>;
}

/** Options controlling request queue client behavior. */
export interface RequestQueueOptions {
    /** Client identifier used when coordinating queue locks. */
    clientKey?: string;
    /** Maximum operation time in seconds. */
    timeoutSecs?: number;
}

/** Options for publishing a storage status message. */
export interface SetStatusMessageOptions {
    /** Whether this is the final status message for the run. */
    isStatusMessageTerminal?: boolean;
    /** Severity level used when displaying the message. */
    level?: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
}

/**
 * Represents a storage capable of working with datasets, KV stores and request queues.
 */
export interface StorageClient {
    datasets(): DatasetCollectionClient;
    dataset(id: string): DatasetClient;
    keyValueStores(): KeyValueStoreCollectionClient;
    keyValueStore(id: string): KeyValueStoreClient;
    requestQueues(): RequestQueueCollectionClient;
    requestQueue(id: string, options?: RequestQueueOptions): RequestQueueClient;
    purge?(): Promise<void>;
    teardown?(): Promise<void>;
    setStatusMessage?(message: string, options?: SetStatusMessageOptions): Promise<void>;
    stats?: { rateLimitErrors: number[] };
}
