import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import type { FileSystemRequestQueueClient as NativeFileSystemRequestQueueBackend } from '@crawlee/fs-storage-native';

import { CachedIdClient } from './cached-id-client.js';

/**
 * Convert a request (either a Crawlee `Request` instance or a plain schema object) into a plain object
 * whose properties are all enumerable.
 *
 * Crawlee's `Request` stores internal metadata (crawl depth, enqueue strategy, session id, ...) in a
 * *non-enumerable* `userData.__crawlee` bag. The native `@crawlee/fs-storage-native` client reads
 * request properties directly over the N-API boundary, which only exposes enumerable own properties
 * and does not honor `toJSON`. Passing a `Request` straight through would therefore silently drop the
 * `__crawlee` metadata, resetting `crawlDepth` to 0 on the next `fetchNextRequest` (breaking e.g.
 * `maxCrawlDepth` and enqueue-strategy handling). Round-tripping through JSON invokes the request's
 * `toJSON`, flattening everything into enumerable properties the native client can persist.
 */
function plainifyRequest(request: unknown): Record<string, unknown> {
    return JSON.parse(JSON.stringify(request)) as Record<string, unknown>;
}

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
export class RequestQueueBackend extends CachedIdClient implements storage.RequestQueueBackend {
    readonly name?: string;
    readonly cacheKey: string;

    private readonly nativeBackend: NativeFileSystemRequestQueueBackend;

    constructor(options: RequestQueueBackendOptions) {
        super();
        this.name = options.name;
        this.cacheKey = options.cacheKey;
        this.nativeBackend = options.nativeBackend;
    }

    get requestQueueDirectory(): string {
        return this.nativeBackend.pathToRq;
    }

    static async create(options: RequestQueueBackendOptions): Promise<RequestQueueBackend> {
        const backend = new RequestQueueBackend(options);
        backend.cachedId = (await options.nativeBackend.getMetadata()).id;
        return backend;
    }

    /**
     * Tells the native client how long (in seconds) a fetched request stays locked before it becomes
     * available again.
     */
    async setExpectedRequestProcessingTimeSecs(secs: number): Promise<void> {
        await this.nativeBackend.setExpectedRequestProcessingTime(secs);
    }

    async getMetadata(): Promise<storage.RequestQueueInfo> {
        return this.nativeBackend.getMetadata();
    }

    async drop(): Promise<void> {
        await this.nativeBackend.dropStorage();
    }

    async purge(): Promise<void> {
        await this.nativeBackend.purge();
    }

    async addBatchOfRequests(
        requests: storage.RequestSchema[],
        options: storage.RequestQueueOperationOptions = {},
    ): Promise<storage.BatchAddRequestsResult> {
        batchRequestShapeWithoutId.parse(requests);
        requestOptionsShape.parse(options);

        const response = await this.nativeBackend.addBatchOfRequests(
            requests.map((request) => plainifyRequest(request)),
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

    async getRequest(uniqueKey: string): Promise<storage.UpdateRequestSchema | undefined> {
        s.string().parse(uniqueKey);
        // The native client tags requests with an internal `orderNo`; it's harmless to leak, so we
        // hand the request back as-is rather than copying it just to drop one undeclared property.
        // The native client already returns `undefined` for a missing request, matching this contract.
        return (await this.nativeBackend.getRequest(uniqueKey)) as storage.UpdateRequestSchema | undefined;
    }

    async fetchNextRequest(): Promise<storage.UpdateRequestSchema | undefined> {
        return (await this.nativeBackend.fetchNextRequest()) as storage.UpdateRequestSchema | undefined;
    }

    async markRequestAsHandled(request: storage.UpdateRequestSchema): Promise<storage.QueueOperationInfo | undefined> {
        requestShape.parse(request);
        return (await this.nativeBackend.markRequestAsHandled(plainifyRequest(request))) ?? undefined;
    }

    async reclaimRequest(
        request: storage.UpdateRequestSchema,
        options: storage.RequestQueueOperationOptions = {},
    ): Promise<storage.QueueOperationInfo | undefined> {
        requestShape.parse(request);
        requestOptionsShape.parse(options);
        return (
            (await this.nativeBackend.reclaimRequest(plainifyRequest(request), options.forefront ?? false)) ?? undefined
        );
    }

    async isEmpty(): Promise<boolean> {
        return this.nativeBackend.isEmpty();
    }

    async isFinished(): Promise<boolean> {
        return this.nativeBackend.isFinished();
    }

    /**
     * Persist the native client's in-memory state to disk. Called by
     * {@link FileSystemStorageBackend.teardown} so that fetched-but-unhandled requests are not stuck
     * for the next consumer of the same on-disk queue.
     */
    async persistState(): Promise<void> {
        await this.nativeBackend.persistState();
    }
}
