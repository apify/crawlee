import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import type {
    FileSystemRequestQueueClient as NativeFileSystemRequestQueueClient,
    ProcessedRequest as NativeProcessedRequest,
} from '@crawlee/fs-storage-native';

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
 * The native client tags each request it returns with an internal `orderNo` (its lock / ordering
 * timestamp). Strip it before handing the request back so consumers see a plain `RequestOptions` as
 * promised by the `@crawlee/types` contract, rather than a native implementation detail. Returns a
 * fresh object — the native client's value is left untouched.
 */
function stripNativeInternals(request: Record<string, unknown> | null): storage.RequestOptions | undefined {
    if (!request) return undefined;
    const { orderNo, ...rest } = request;
    return rest as storage.RequestOptions;
}

function toQueueOperationInfo(processed: NativeProcessedRequest | null): storage.QueueOperationInfo | null {
    if (!processed) return null;
    return {
        requestId: processed.requestId,
        wasAlreadyHandled: processed.wasAlreadyHandled,
        wasAlreadyPresent: processed.wasAlreadyPresent,
    };
}

/**
 * A file-system request queue client backed by the native `@crawlee/fs-storage-native` Rust
 * extension.
 *
 * Request ordering, in-progress locking and state persistence are all owned by the native client.
 * This adapter forwards each operation, converts result shapes to the `@crawlee/types` interfaces,
 * and strips the internal bookkeeping fields the native client adds to returned requests.
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

        return {
            processedRequests: response.processedRequests.map((processed) => ({
                requestId: processed.requestId,
                uniqueKey: processed.uniqueKey,
                wasAlreadyHandled: processed.wasAlreadyHandled,
                wasAlreadyPresent: processed.wasAlreadyPresent,
            })),
            unprocessedRequests: response.unprocessedRequests.map((unprocessed) => ({
                uniqueKey: unprocessed.uniqueKey,
                url: unprocessed.url,
                method: unprocessed.method ?? undefined,
            })) as storage.BatchAddRequestsResult['unprocessedRequests'],
        };
    }

    async getRequest(uniqueKey: string): Promise<storage.RequestOptions | undefined> {
        s.string().parse(uniqueKey);
        return stripNativeInternals(await this.nativeClient.getRequest(uniqueKey));
    }

    async fetchNextRequest(): Promise<storage.RequestOptions | null> {
        return stripNativeInternals(await this.nativeClient.fetchNextRequest()) ?? null;
    }

    async markRequestAsHandled(request: storage.UpdateRequestSchema): Promise<storage.QueueOperationInfo | null> {
        requestShape.parse(request);
        return toQueueOperationInfo(
            await this.nativeClient.markRequestAsHandled(request as unknown as Record<string, unknown>),
        );
    }

    async reclaimRequest(
        request: storage.UpdateRequestSchema,
        options: storage.RequestOptions = {},
    ): Promise<storage.QueueOperationInfo | null> {
        requestShape.parse(request);
        requestOptionsShape.parse(options);
        return toQueueOperationInfo(
            await this.nativeClient.reclaimRequest(
                request as unknown as Record<string, unknown>,
                options.forefront ?? false,
            ),
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
