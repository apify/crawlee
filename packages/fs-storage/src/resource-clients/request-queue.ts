import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import type { FileSystemRequestQueueClient as NativeFileSystemRequestQueueClient } from '@crawlee/fs-storage-native';

import { CachedIdClient } from './cached-id-client.js';

const requestShape = s
    .object({
        id: s.string(),
        url: s.string().url({ allowedProtocols: ['http:', 'https:'] }),
        uniqueKey: s.string(),
        method: s.string().optional(),
        retryCount: s.number().int().optional(),
        handledAt: s.union([s.string(), s.date().valid()]).optional(),
    })
    .passthrough();

const requestShapeWithoutId = requestShape.omit(['id']);
const batchRequestShapeWithoutId = requestShapeWithoutId.array();

const requestOptionsShape = s.object({
    forefront: s.boolean().optional(),
});

export interface RequestQueueClientOptions {
    /** The user-facing storage name, or `undefined` for unnamed (alias / default) storages. */
    name?: string;
    /**
     * The key used for cache lookup in {@link FileSystemStorageClient}. For named storages this equals
     * the name; for alias (unnamed) storages it is the alias string. Falls back to the storage id.
     */
    cacheKey: string;
    nativeClient: NativeFileSystemRequestQueueClient;
    logger?: CrawleeLogger;
}

/**
 * A file-system request queue client backed by the native `@crawlee/fs-storage-native` Rust
 * extension.
 *
 * Request ordering, in-progress locking and state persistence are all owned by the native client.
 * This adapter forwards each operation and converts result shapes to the `@crawlee/types` interfaces.
 */
export class RequestQueueClient extends CachedIdClient implements storage.RequestQueueClient {
    readonly name?: string;
    readonly cacheKey: string;

    private readonly nativeClient: NativeFileSystemRequestQueueClient;
    private readonly logger?: CrawleeLogger;

    constructor(options: RequestQueueClientOptions) {
        super();
        this.name = options.name;
        this.cacheKey = options.cacheKey;
        this.nativeClient = options.nativeClient;
        this.logger = options.logger;
    }

    get requestQueueDirectory(): string {
        return this.nativeClient.pathToRq;
    }

    static async create(options: RequestQueueClientOptions): Promise<RequestQueueClient> {
        const client = new RequestQueueClient(options);
        client._cachedId = (await options.nativeClient.getMetadata()).id;
        return client;
    }

    /**
     * Tells the native client how long (in seconds) a fetched request stays locked before it becomes
     * available again. The `@crawlee/types` interface declares this as synchronous (fire-and-forget),
     * while the native call is asynchronous; we kick it off and let it settle in the background.
     */
    setExpectedRequestProcessingTimeSecs(secs: number): void {
        // Kick off the async native call and let it settle in the background, but swallow any
        // rejection so it doesn't surface as an unhandled promise rejection.
        this.nativeClient.setExpectedRequestProcessingTime(secs).catch((error) => {
            this.logger?.warning?.('Failed to set the expected request processing time', { error });
        });
    }

    async getMetadata(): Promise<storage.RequestQueueInfo> {
        return this.nativeClient.getMetadata();
    }

    async drop(): Promise<void> {
        await this.nativeClient.dropStorage();
    }

    async purge(): Promise<void> {
        await this.nativeClient.purge();
    }

    async addBatchOfRequests(
        requests: storage.RequestSchema[],
        options: storage.RequestOptions = {},
    ): Promise<storage.BatchAddRequestsResult> {
        batchRequestShapeWithoutId.parse(requests);
        requestOptionsShape.parse(options);

        const response = await this.nativeClient.addBatchOfRequests(
            requests as unknown as Record<string, unknown>[],
            options.forefront ?? false,
        );

        // `processedRequests` is structurally identical between the native and `storage` types, so it
        // passes through unchanged. `unprocessedRequests` only differs in that the native `method` is
        // a plain `string`, hence the cast to the narrower `AllowedHttpMethods` union.
        return {
            processedRequests: response.processedRequests,
            unprocessedRequests: response.unprocessedRequests as storage.BatchAddRequestsResult['unprocessedRequests'],
        };
    }

    async getRequest(uniqueKey: string): Promise<storage.RequestOptions | undefined> {
        s.string().parse(uniqueKey);
        // The native client tags requests with an internal `orderNo`; it's harmless to leak, so we
        // hand the request back as-is rather than copying it just to drop one undeclared property.
        // It returns `null` for a missing request, but this method's contract is `undefined`.
        return ((await this.nativeClient.getRequest(uniqueKey)) as storage.RequestOptions | null) ?? undefined;
    }

    async fetchNextRequest(): Promise<storage.RequestOptions | null> {
        return (await this.nativeClient.fetchNextRequest()) as storage.RequestOptions | null;
    }

    async markRequestAsHandled(request: storage.UpdateRequestSchema): Promise<storage.QueueOperationInfo | null> {
        requestShape.parse(request);
        return await this.nativeClient.markRequestAsHandled(request as unknown as Record<string, unknown>);
    }

    async reclaimRequest(
        request: storage.UpdateRequestSchema,
        options: storage.RequestOptions = {},
    ): Promise<storage.QueueOperationInfo | null> {
        requestShape.parse(request);
        requestOptionsShape.parse(options);
        return await this.nativeClient.reclaimRequest(
            request as unknown as Record<string, unknown>,
            options.forefront ?? false,
        );
    }

    async isEmpty(): Promise<boolean> {
        return this.nativeClient.isEmpty();
    }

    async isFinished(): Promise<boolean> {
        return this.nativeClient.isFinished();
    }

    /**
     * Persist the native client's in-memory state to disk. Called by
     * {@link FileSystemStorageClient.teardown} so that fetched-but-unhandled requests are not stuck
     * for the next consumer of the same on-disk queue.
     */
    async persistState(): Promise<void> {
        await this.nativeClient.persistState();
    }
}
