import { parseArgument, schemas } from '@crawlee/utils/internal';
import { z } from 'zod';
import { CachedIdClient } from './cached-id-client.js';
const uniqueKeySchema = z.string();
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
function plainifyRequest(request) {
    return JSON.parse(JSON.stringify(request));
}
/**
 * A file-system request queue backend backed by the native `@crawlee/fs-storage-native` Rust
 * extension.
 *
 * Request ordering, in-progress locking and state persistence are all owned by the native client.
 * This adapter forwards each operation and converts result shapes to the `@crawlee/types` interfaces.
 */
export class RequestQueueBackend extends CachedIdClient {
    name;
    cacheKey;
    #nativeBackend;
    constructor(options) {
        super();
        this.name = options.name;
        this.cacheKey = options.cacheKey;
        this.#nativeBackend = options.nativeBackend;
    }
    get requestQueueDirectory() {
        return this.#nativeBackend.pathToRq;
    }
    static async create(options) {
        const backend = new RequestQueueBackend(options);
        backend.cachedId = (await options.nativeBackend.getMetadata()).id;
        return backend;
    }
    /**
     * Tells the native client how long (in seconds) a fetched request stays locked before it becomes
     * available again.
     */
    async setExpectedRequestProcessingTimeSecs(secs) {
        await this.#nativeBackend.setExpectedRequestProcessingTime(secs);
    }
    async getMetadata() {
        return this.#nativeBackend.getMetadata();
    }
    async drop() {
        await this.#nativeBackend.dropStorage();
    }
    async purge() {
        await this.#nativeBackend.purge();
    }
    async addBatchOfRequests(requests, options = {}) {
        parseArgument(requests, schemas.storageRequestBatch);
        parseArgument(options, schemas.requestQueueOperationOptions);
        const response = await this.#nativeBackend.addBatchOfRequests(requests.map((request) => plainifyRequest(request)), options.forefront ?? false);
        // `processedRequests` is structurally identical between the native and `storage` types, so it
        // passes through unchanged. `unprocessedRequests` only differs in that the native `method` is
        // a plain `string`, hence the cast to the narrower `AllowedHttpMethods` union.
        return {
            processedRequests: response.processedRequests,
            unprocessedRequests: response.unprocessedRequests,
        };
    }
    async getRequest(uniqueKey) {
        parseArgument(uniqueKey, uniqueKeySchema);
        // The native client tags requests with an internal `orderNo`; it's harmless to leak, so we
        // hand the request back as-is rather than copying it just to drop one undeclared property.
        // The native client already returns `undefined` for a missing request, matching this contract.
        return (await this.#nativeBackend.getRequest(uniqueKey));
    }
    async fetchNextRequest() {
        return (await this.#nativeBackend.fetchNextRequest());
    }
    async markRequestAsHandled(request) {
        parseArgument(request, schemas.storageRequest);
        return (await this.#nativeBackend.markRequestAsHandled(plainifyRequest(request))) ?? undefined;
    }
    async reclaimRequest(request, options = {}) {
        parseArgument(request, schemas.storageRequest);
        parseArgument(options, schemas.requestQueueOperationOptions);
        return ((await this.#nativeBackend.reclaimRequest(plainifyRequest(request), options.forefront ?? false)) ??
            undefined);
    }
    async isEmpty() {
        return this.#nativeBackend.isEmpty();
    }
    async isFinished() {
        return this.#nativeBackend.isFinished();
    }
    /**
     * Persist the native client's in-memory state to disk. Called by
     * {@link FileSystemStorageBackend.teardown} so that fetched-but-unhandled requests are not stuck
     * for the next consumer of the same on-disk queue.
     */
    async persistState() {
        await this.#nativeBackend.persistState();
    }
}
