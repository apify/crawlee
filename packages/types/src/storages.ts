import type { LogLevel } from '@apify/log';
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

export interface DatasetCollectionClientOptions {
    storageDir: string;
}

export interface DatasetCollectionData {
    id: string;
    name?: string;
    createdAt: Date;
    modifiedAt: Date;
    accessedAt: Date;
}

/**
 * Dataset collection client.
 */
export interface DatasetCollectionClient {
    list(): Promise<PaginatedList<Dataset>>;
    getOrCreate(name?: string): Promise<DatasetCollectionData>;
}

export interface Dataset extends DatasetCollectionData {
    itemCount: number;
}

export interface DatasetClientUpdateOptions {
    name?: string;
}

export interface DatasetClientListOptions {
    desc?: boolean;
    limit?: number;
    offset?: number;
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
    get(): Promise<DatasetInfo | undefined>;
    update(newFields: DatasetClientUpdateOptions): Promise<Partial<DatasetInfo>>;
    delete(): Promise<void>;
    downloadItems(...args: unknown[]): Promise<Buffer>;
    listItems(options?: DatasetClientListOptions): Promise<PaginatedList<Data>>;
    pushItems(items: Data | Data[] | string | string[]): Promise<void>;
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

export interface KeyValueStoreStats {
    readCount?: number;
    writeCount?: number;
    deleteCount?: number;
    listCount?: number;
    storageBytes?: number;
}

/**
 * Key-value store collection client.
 */
export interface KeyValueStoreCollectionClient {
    list(): Promise<PaginatedList<KeyValueStoreInfo>>;
    getOrCreate(name?: string): Promise<KeyValueStoreInfo>;
}

export interface KeyValueStoreRecord {
    key: string;
    value: any;
    contentType?: string;
}

export interface KeyValueStoreClientUpdateOptions {
    name?: string;
}

export interface KeyValueStoreClientListOptions {
    limit?: number;
    exclusiveStartKey?: string;
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
    get(): Promise<KeyValueStoreInfo | undefined>;
    update(newFields: KeyValueStoreClientUpdateOptions): Promise<Partial<KeyValueStoreInfo>>;
    delete(): Promise<void>;
    listKeys(options?: KeyValueStoreClientListOptions): Promise<KeyValueStoreClientListData>;
    getRecord(key: string, options?: KeyValueStoreClientGetRecordOptions): Promise<KeyValueStoreRecord | undefined>;
    setRecord(record: KeyValueStoreRecord): Promise<void>;
    deleteRecord(key: string): Promise<void>;
}

/**
 * Request queue collection client.
 */
export interface RequestQueueCollectionClient {
    list(): Promise<PaginatedList<RequestQueueInfo>>;
    getOrCreate(name: string): Promise<RequestQueueInfo>;
}

export interface QueueHead {
    limit: number;
    queueModifiedAt: Date;
    hadMultipleClients?: boolean;
    items: RequestQueueHeadItem[];
}

export interface RequestQueueHeadItem {
    id: string;
    retryCount: number;
    uniqueKey: string;
    url: string;
    method: AllowedHttpMethods;
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

export interface RequestQueueStats {
    readCount?: number;
    writeCount?: number;
    deleteCount?: number;
    headItemReadCount?: number;
    storageBytes?: number;
}

export interface ListOptions {
    /**
     * @default 100
     */
    limit?: number;
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
    get(): Promise<RequestQueueInfo | undefined>;
    update(newFields: { name?: string }): Promise<Partial<RequestQueueInfo> | undefined>;
    delete(): Promise<void>;
    listHead(options?: ListOptions): Promise<QueueHead>;
    addRequest(request: RequestSchema, options?: RequestOptions): Promise<QueueOperationInfo>;
    batchAddRequests(requests: RequestSchema[], options?: RequestOptions): Promise<BatchAddRequestsResult>;
    getRequest(id: string): Promise<RequestOptions | undefined>;
    updateRequest(request: UpdateRequestSchema, options?: RequestOptions): Promise<QueueOperationInfo>;
    deleteRequest(id: string): Promise<unknown>;
}

export interface RequestQueueOptions {
    clientKey?: string;
    timeoutSecs?: number;
}

export interface SetStatusMessageOptions {
    isStatusMessageTerminal?: boolean;
    level?: LogLevel.DEBUG | LogLevel.INFO | LogLevel.WARNING | LogLevel.ERROR;
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
