import { inspect } from 'node:util';

import type { BaseHttpClient } from '@crawlee/http-client';
import type {
    BatchAddRequestsResult,
    Constructor,
    Dictionary,
    ProcessedRequest,
    QueueOperationInfo,
    RequestQueueBackend,
    RequestQueueInfo,
} from '@crawlee/types';
import { isAsyncIterable, isIterable } from '@crawlee/utils/internal';
import { downloadListOfUrls } from '@crawlee/utils';
import type { ReadonlyDeep } from 'type-fest';
import { z } from 'zod';

import { LruCache } from '@apify/datastructures';
import { tryCancel } from '@apify/timeout';

import { Configuration } from '../configuration.js';
import { getObjectType } from '../debug.js';
import type { EventManager } from '../events/event_manager.js';
import { EventType } from '../events/event_manager.js';
import type { CrawleeLogger } from '../log.js';
import type { IProxyConfiguration } from '../proxy_configuration.js';
import type { InternalSource, RequestOptions, Source } from '../request.js';
import { Request } from '../request.js';
import { serviceLocator } from '../service_locator.js';
import { parseArgument, schemas, validators } from '../validators.js';
import type { JournalEntry, StorageTransaction } from './transaction.js';
import { activeStorageTransaction, rejectOperationInTransaction } from './transaction.js';
import { drainRequestBatches } from './batched_adds.js';
import type { RequestLoaderStatus } from './request_loader.js';
import type { IRequestManager, PacingSignal, RequestsLike } from './request_manager.js';
import type { RequestQueueStats } from './storage_stats.js';
import { StorageStatsTracker } from './storage_stats.js';
import type { IStorage, StorageIdentifier } from './storage_instance_manager.js';
import type { StorageOpenOptions } from './utils.js';
import { resolveStorageIdentifier } from './storage_instance_manager.js';
import { getRequestId, purgeDefaultStorages } from './utils.js';
import { RequestDeduplicationCache } from './request_dedup_cache.js';

/**
 * The maximum number of requests cached locally to avoid redundant calls to the storage backend.
 * @internal
 */
const MAX_CACHED_REQUESTS = 2_000_000;

const iterableSchema = z.custom((value) => isIterable(value) || isAsyncIterable(value), {
    error: (issue) => `Expected an iterable or async iterable, got ${getObjectType(issue.input)}`,
});
const operationOptionsSchema = z.strictObject({
    forefront: z.boolean().default(false),
});
const addRequestsOptionsSchema = z.strictObject({
    forefront: z.boolean().default(false),
    cache: z.boolean().default(true),
});
const addRequestsBatchedOptionsSchema = z.strictObject({
    forefront: z.boolean().optional(),
    waitForAllRequestsToBeAdded: z.boolean().default(false),
    batchSize: schemas.anyNumber.default(1000),
    waitBetweenBatchesMillis: schemas.anyNumber.default(1000),
    maxNewRequests: schemas.anyNumber.optional(),
});
const newRequestLikeSchema = z.looseObject({
    url: z.string(),
    id: z.undefined().optional(),
});
const handledRequestSchema = z.looseObject({
    id: z.string(),
    uniqueKey: z.string(),
    handledAt: z.string().optional(),
});
const reclaimedRequestSchema = z.looseObject({
    id: z.string(),
    uniqueKey: z.string(),
});
const uniqueKeySchema = z.string();
const openOptionsSchema = z.strictObject({
    configuration: z.instanceof(Configuration).optional(),
    storageBackend: validators.storageBackend.optional(),
    proxyConfiguration: validators.proxyConfiguration.optional(),
    httpClient: schemas.httpClient.optional(),
});

/**
 * Represents a queue of URLs to crawl, which is used for deep crawling of websites
 * where you start with several URLs and then recursively
 * follow links to other pages. The data structure supports both breadth-first and depth-first crawling orders.
 *
 * Each URL is represented using an instance of the {@apilink Request} class.
 * The queue can only contain unique URLs. More precisely, it can only contain {@apilink Request} instances
 * with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be overridden.
 * To add a single URL multiple times to the queue,
 * corresponding {@apilink Request} objects will need to have different `uniqueKey` properties.
 *
 * Do not instantiate this class directly, use the {@apilink RequestQueue.open} function instead.
 *
 * `RequestQueue` is used by {@apilink BasicCrawler}, {@apilink CheerioCrawler}, {@apilink PuppeteerCrawler}
 * and {@apilink PlaywrightCrawler} as a source of URLs to crawl.
 * Unlike {@apilink RequestList}, `RequestQueue` supports dynamic adding and removing of requests.
 * On the other hand, the queue is not optimized for operations that add or remove a large number of URLs in a batch.
 *
 * **Example usage:**
 *
 * ```javascript
 * // Open the default request queue associated with the crawler run
 * const queue = await RequestQueue.open();
 *
 * // Open a named request queue
 * const queueWithName = await RequestQueue.open('some-name');
 *
 * // Enqueue few requests
 * await queue.addRequest({ url: 'http://example.com/aaa' });
 * await queue.addRequest({ url: 'http://example.com/bbb' });
 * await queue.addRequest({ url: 'http://example.com/foo/bar' }, { forefront: true });
 * ```
 * @category Sources
 */
export class RequestQueue implements IStorage, IRequestManager {
    readonly id: string;
    readonly name?: string;
    readonly backend: RequestQueueBackend;
    #proxyConfiguration?: IProxyConfiguration;

    readonly log: CrawleeLogger;

    #requestCache: LruCache<RequestLruItem>;

    /**
     * Remembers the `requestId` of every request already submitted to the client — including background
     * batches that `requestCache` skips — so overlapping URL sets aren't re-submitted.
     * See {@link RequestDeduplicationCache} for why this is a separate, cheaper cache.
     */
    #requestSeenCache: RequestDeduplicationCache;

    #queuePausedForMigration = false;

    #inProgressRequestBatchCount = 0;

    /**
     * The largest expected request-processing time (in seconds) seen so far via
     * {@link setExpectedRequestProcessingTimeSecs}. Used to ensure that value is only ever raised, never
     * lowered, before being forwarded to the storage backend.
     */
    #expectedRequestProcessingSecs = 0;

    #httpClient?: BaseHttpClient;

    readonly #events: EventManager;

    readonly #statsTracker = new StorageStatsTracker<RequestQueueStats>({
        writeCount: 0,
        headItemReadCount: 0,
    });

    /**
     * Backend-independent usage counters tracked for this request queue (write operations and
     * queue-head reads issued to the underlying storage backend). Counted per backend call.
     */
    get stats(): RequestQueueStats {
        return this.#statsTracker.current;
    }

    /**
     * @internal
     */
    constructor(options: RequestQueueOptions) {
        this.id = options.metadata.id;
        this.name = options.metadata.name;
        this.#events = serviceLocator.getEventManager();
        this.backend = options.backend;

        this.#proxyConfiguration = options.proxyConfiguration;

        this.#requestCache = new LruCache({ maxLength: MAX_CACHED_REQUESTS });
        this.#requestSeenCache = new RequestDeduplicationCache();
        this.log = serviceLocator.getLogger().child({ prefix: `RequestQueue(${this.id}, ${this.name ?? 'no-name'})` });

        this.#events.on(EventType.MIGRATING, async () => {
            this.#queuePausedForMigration = true;
        });
    }

    /**
     * Returns the total number of requests in the queue (i.e. pending + handled).
     *
     * Survives restarts and actor migrations.
     */
    async getTotalCount() {
        const { totalRequestCount } = await this.getInfo();
        return totalRequestCount;
    }

    /**
     * Returns the total number of pending requests in the queue.
     *
     * Survives restarts and Actor migrations.
     */
    async getPendingCount() {
        const { totalRequestCount, handledRequestCount } = await this.getInfo();
        return totalRequestCount - handledRequestCount;
    }

    /**
     * Adds a request to the queue.
     *
     * If a request with the same `uniqueKey` property is already present in the queue,
     * it will not be updated. You can find out whether this happened from the resulting
     * {@apilink QueueOperationInfo} object.
     *
     * To add multiple requests to the queue by extracting links from a webpage,
     * see the {@apilink enqueueLinks} helper function.
     *
     * @param requestLike {@apilink Request} object or vanilla object with request data.
     * Note that the function sets the `uniqueKey` and `id` fields to the passed Request.
     * @param [options] Request queue operation options.
     */
    async addRequest(
        requestLike: Source,
        options: RequestQueueOperationOptions = {},
    ): Promise<RequestQueueOperationInfo> {
        const transaction = activeStorageTransaction();

        parseArgument(requestLike, schemas.anyObject);
        const { forefront } = parseArgument(options, operationOptionsSchema);

        if ('requestsFromUrl' in requestLike) {
            const requests = await this.fetchRequestsFromUrl(requestLike as InternalSource);
            const processedRequests = await this.addFetchedRequests(requestLike as InternalSource, requests, options);

            return { ...processedRequests[0], forefront };
        }

        parseArgument(requestLike, newRequestLikeSchema);

        const request = requestLike instanceof Request ? requestLike : new Request(requestLike as RequestOptions);

        if (transaction?.policy.requestQueue === 'deferred') {
            return this.addRequestDeferred(transaction, request, forefront);
        }

        const cacheKey = getRequestId(request.uniqueKey);
        const cachedInfo = this.#requestCache.get(cacheKey);

        if (cachedInfo) {
            request.id = cachedInfo.id;
            this.recordRequestJournalEntry(transaction, [request], forefront, true);
            return {
                wasAlreadyPresent: true,
                // We may assume that if request is in local cache then also the information if the
                // request was already handled is there because just one client should be using one queue.
                wasAlreadyHandled: cachedInfo.isHandled,
                requestId: cachedInfo.id,
                uniqueKey: cachedInfo.uniqueKey,
                forefront,
            };
        }

        this.#statsTracker.add('writeCount');
        const { processedRequests } = await this.backend.addBatchOfRequests([request], { forefront });
        this.recordRequestJournalEntry(transaction, [request], forefront, true);
        const queueOperationInfo = {
            ...processedRequests[0],
            uniqueKey: request.uniqueKey,
            forefront,
        } satisfies RequestQueueOperationInfo;

        this.cacheRequest(cacheKey, queueOperationInfo);
        this.#requestSeenCache.add(cacheKey, request.id!);

        return queueOperationInfo;
    }

    /**
     * Journals an addition for introspection only; these entries are never replayed. A no-op unless the
     * transaction is open, so detached and outliving writers stay out of the journal.
     */
    private recordRequestJournalEntry(
        transaction: StorageTransaction | undefined,
        requests: Request[],
        forefront: boolean,
        writeThrough: boolean,
    ): void {
        if (!transaction?.isActive || requests.length === 0) return;

        transaction.recordJournalEntry({
            type: 'requestQueue',
            participant: this,
            requests: requests.map((request) => ({
                url: request.url,
                uniqueKey: request.uniqueKey,
                label: request.label,
            })),
            forefront,
            writeThrough,
        });
    }

    /**
     * The requests buffered by the given transaction for this queue, keyed by `uniqueKey` — a dedup
     * index derived from the transaction journal.
     */
    private bufferedRequests(transaction: StorageTransaction): Map<string, Dictionary> {
        const buffered = new Map<string, Dictionary>();

        // Only `deferred` records snapshots, so scanning the journal under `writeThrough` never finds any.
        if (transaction.policy.requestQueue !== 'deferred') return buffered;

        for (const entry of transaction.journal) {
            if (entry.type !== 'requestQueue' || entry.participant !== this) continue;
            for (const request of entry.requests) {
                if (request.snapshot !== undefined) buffered.set(request.uniqueKey, request.snapshot);
            }
        }

        return buffered;
    }

    /**
     * Adds a request under the `deferred` policy: journaled now, really added by the commit replay.
     * A new request's `requestId` is the local `uniqueKey` hash and is **provisional** — never write it
     * to `request.id` or the dedup caches. Dedup is cheapest-first: buffer, caches, then a backend probe.
     */
    private async addRequestDeferred(
        transaction: StorageTransaction,
        request: Request,
        forefront: boolean,
        buffered = this.bufferedRequests(transaction),
    ): Promise<RequestQueueOperationInfo> {
        // This transaction's own buffered adds; the shared caches never see them (provisional ids).
        if (buffered.has(request.uniqueKey)) {
            this.recordRequestJournalEntry(transaction, [request], forefront, false);
            return {
                wasAlreadyPresent: true,
                wasAlreadyHandled: false,
                requestId: getRequestId(request.uniqueKey),
                uniqueKey: request.uniqueKey,
                forefront,
            };
        }

        // The caches hold real backend ids. Only *writing* provisional ids to them would be wrong;
        // reading saves a probe. Same lookup as the write-through path.
        const cacheKey = getRequestId(request.uniqueKey);
        const cachedInfo = this.#requestCache.get(cacheKey);
        const knownRequestId = cachedInfo?.id ?? this.#requestSeenCache.get(cacheKey);

        if (knownRequestId) {
            this.recordRequestJournalEntry(transaction, [request], forefront, false);
            return {
                wasAlreadyPresent: true,
                // The dedup cache doesn't track the handled state; only the full record does.
                wasAlreadyHandled: cachedInfo?.isHandled ?? false,
                requestId: knownRequestId,
                uniqueKey: request.uniqueKey,
                forefront,
            };
        }

        // The caches are bounded, so a miss is not proof of absence - probe for an accurate answer.
        const existing = await this.backend.getRequest(request.uniqueKey);

        if (existing) {
            this.recordRequestJournalEntry(transaction, [request], forefront, false);
            return {
                wasAlreadyPresent: true,
                wasAlreadyHandled: existing.handledAt != null,
                requestId: existing.id,
                uniqueKey: request.uniqueKey,
                forefront,
            };
        }

        // The entry below *is* the write, so a transaction closed during the probe must not receive it -
        // pass through instead, per the closed-transaction rule. Under `deferred` that can land an
        // addition a rollback would have discarded; dedup bounds that cost, silent loss is unbounded.
        if (!transaction.isActive) {
            return await this.addRequest(request, { forefront });
        }

        const snapshot = JSON.parse(JSON.stringify(request)) as Dictionary;

        // Strip-list, not allow-list: every user-facing field flows through, including ones added to
        // `Request` in the future. The exceptions are `id` and `handledAt`, the two backend-owned
        // lifecycle fields.
        delete snapshot.id;
        delete snapshot.handledAt;

        transaction.recordJournalEntry({
            type: 'requestQueue',
            participant: this,
            requests: [{ url: request.url, uniqueKey: request.uniqueKey, label: request.label, snapshot }],
            forefront,
            writeThrough: false,
        });
        buffered.set(request.uniqueKey, snapshot);

        return {
            wasAlreadyPresent: false,
            wasAlreadyHandled: false,
            requestId: getRequestId(request.uniqueKey),
            uniqueKey: request.uniqueKey,
            forefront,
        };
    }

    /** @internal */
    async commitJournalEntries(entries: JournalEntry[]): Promise<void> {
        // Replay through `backend.addBatchOfRequests`, *not* the batched frontend wrapper - the wrapper
        // resolves after the first chunk and sleeps between the rest, neither of which commit may
        // inherit. One call per `forefront` flag; the order of forefront additions is arbitrary anyway.
        for (const forefront of [false, true]) {
            const requests = entries.flatMap((entry) =>
                entry.type === 'requestQueue' && entry.forefront === forefront
                    ? // Requests without a snapshot were deduplicated or written through; nothing to replay.
                      entry.requests
                          .filter((journaled) => journaled.snapshot !== undefined)
                          .map((journaled) => new Request(journaled.snapshot as unknown as RequestOptions))
                    : [],
            );

            if (requests.length === 0) continue;

            this.#statsTracker.add('writeCount');
            const { processedRequests, unprocessedRequests } = await this.backend.addBatchOfRequests(requests, {
                forefront,
            });

            // Only now, with the real backend-assigned ids, may the shared dedup caches be populated.
            for (const processed of processedRequests) {
                const cacheKey = getRequestId(processed.uniqueKey);
                this.cacheRequest(cacheKey, { ...processed, forefront });
                this.#requestSeenCache.add(cacheKey, processed.requestId);
            }

            if (unprocessedRequests.length > 0) {
                // Warn and skip, rather than retry or fail. `unprocessedRequests` is what remains after
                // the backend's own transient-error handling - a semantic rejection that retrying here
                // would only re-poke. And failing the commit would let one malformed request hold the
                // whole transaction hostage.
                this.log.warning(
                    'Some requests were rejected by the request queue while committing a storage transaction and will be skipped. ' +
                        "This usually means the request data is malformed (e.g. an invalid 'userData' shape).",
                    { unprocessedRequests },
                );
            }
        }
    }

    /**
     * Adds requests to the queue in batches of 25. This method will wait till all the requests are added
     * to the queue before resolving. You should prefer using `queue.addRequestsBatched()` or `crawler.addRequests()`
     * if you don't want to block the processing, as those methods will only wait for the initial 1000 requests,
     * start processing right after that happens, and continue adding more in the background.
     *
     * If a request passed in is already present due to its `uniqueKey` property being the same,
     * it will not be updated. You can find out whether this happened by finding the request in the resulting
     * {@apilink BatchAddRequestsResult} object.
     *
     * @param requestsLike {@apilink Request} objects or vanilla objects with request data.
     * Note that the function sets the `uniqueKey` and `id` fields to the passed requests if missing.
     * @param [options] Request queue operation options.
     */
    async addRequests(
        requestsLike: RequestsLike,
        options: RequestQueueOperationOptions = {},
    ): Promise<BatchAddRequestsResult> {
        const transaction = activeStorageTransaction();

        parseArgument(requestsLike, iterableSchema);
        const { forefront, cache } = parseArgument(options, addRequestsOptionsSchema);

        const uniqueKeyToCacheKey = new Map<string, string>();
        const getCachedRequestId = (uniqueKey: string) => {
            const cached = uniqueKeyToCacheKey.get(uniqueKey);

            if (cached) return cached;

            const newCacheKey = getRequestId(uniqueKey);
            uniqueKeyToCacheKey.set(uniqueKey, newCacheKey);

            return newCacheKey;
        };

        const results: BatchAddRequestsResult = {
            processedRequests: [],
            unprocessedRequests: [],
        };

        const requests: Request<Dictionary>[] = [];

        for await (const requestLike of requestsLike) {
            if (typeof requestLike === 'string') {
                requests.push(new Request({ url: requestLike }));
            } else if ('requestsFromUrl' in requestLike) {
                const fetchedRequests = await this.fetchRequestsFromUrl(requestLike as InternalSource);
                await this.addFetchedRequests(requestLike as InternalSource, fetchedRequests, options);
            } else {
                requests.push(
                    requestLike instanceof Request ? requestLike : new Request(requestLike as RequestOptions),
                );
            }
        }

        if (transaction?.policy.requestQueue === 'deferred') {
            const buffered = this.bufferedRequests(transaction);

            for (const request of requests) {
                results.processedRequests.push(
                    await this.addRequestDeferred(transaction, request, forefront, buffered),
                );
            }

            return results;
        }

        this.recordRequestJournalEntry(transaction, requests, forefront, true);

        const requestsToAdd = new Map<string, Request>();

        for (const request of requests) {
            const cacheKey = getCachedRequestId(request.uniqueKey);
            // Prefer the full `requestCache` record; fall back to the dedup cache for background batches it skips.
            const cachedInfo = this.#requestCache.get(cacheKey);
            const knownRequestId = cachedInfo?.id ?? this.#requestSeenCache.get(cacheKey);

            if (knownRequestId) {
                request.id = knownRequestId;
                results.processedRequests.push({
                    wasAlreadyPresent: true,
                    // The dedup cache doesn't track the handled state; only the full record does.
                    wasAlreadyHandled: cachedInfo?.isHandled ?? false,
                    requestId: knownRequestId,
                    uniqueKey: request.uniqueKey,
                });
            } else if (!requestsToAdd.has(request.uniqueKey)) {
                requestsToAdd.set(request.uniqueKey, request);
            }
        }

        // Early exit if all provided requests were already added
        if (!requestsToAdd.size) {
            return results;
        }

        this.#statsTracker.add('writeCount');
        const apiResults = await this.backend.addBatchOfRequests([...requestsToAdd.values()], { forefront });

        // Report unprocessed requests
        results.unprocessedRequests = apiResults.unprocessedRequests;

        // Add all new requests to the requestCache
        for (const newRequest of apiResults.processedRequests) {
            // Add the new request to the processed list
            results.processedRequests.push(newRequest);

            const cacheKey = getCachedRequestId(newRequest.uniqueKey);

            if (cache) {
                this.cacheRequest(cacheKey, { ...newRequest, forefront });
            }

            // Unlike `requestCache`, populate this on every batch (including background ones).
            this.#requestSeenCache.add(cacheKey, newRequest.requestId!);
        }

        return results;
    }

    /**
     * Adds requests to the queue in batches. By default, it will resolve after the initial batch is added, and continue
     * adding the rest in the background. You can configure the batch size via `batchSize` option and the sleep time in between
     * the batches via `waitBetweenBatchesMillis`. If you want to wait for all batches to be added to the queue, you can use
     * the `waitForAllRequestsToBeAdded` promise you get in the response object.
     *
     * @param requests The requests to add
     * @param options Options for the request queue
     */
    async addRequestsBatched(
        requests: ReadonlyDeep<RequestsLike>,
        options: AddRequestsBatchedOptions = {},
    ): Promise<AddRequestsBatchedResult> {
        parseArgument(requests, iterableSchema);

        const { forefront, waitForAllRequestsToBeAdded, batchSize, waitBetweenBatchesMillis, maxNewRequests } =
            parseArgument(options, addRequestsBatchedOptionsSchema);

        const addRequest = this.addRequest.bind(this);

        async function* generateRequests() {
            for await (const opts of requests) {
                // Validate the input
                if (typeof opts === 'object' && opts !== null) {
                    if (opts.url !== undefined && typeof opts.url !== 'string') {
                        throw new Error(
                            `Request options are not valid, the 'url' property is not a string. Input: ${inspect(opts)}`,
                        );
                    }

                    if (opts.id !== undefined) {
                        throw new Error(
                            `Request options are not valid, the 'id' property must not be present. Input: ${inspect(opts)}`,
                        );
                    }

                    if (
                        (opts as any).requestsFromUrl !== undefined &&
                        typeof (opts as any).requestsFromUrl !== 'string'
                    ) {
                        throw new Error(
                            `Request options are not valid, the 'requestsFromUrl' property is not a string. Input: ${inspect(opts)}`,
                        );
                    }
                }

                if (opts && typeof opts === 'object' && 'requestsFromUrl' in opts) {
                    // Handle URL lists right away
                    await addRequest(opts, { forefront });
                } else {
                    // Yield valid requests
                    yield typeof opts === 'string' ? { url: opts } : (opts as RequestOptions);
                }
            }
        }

        return drainRequestBatches<RequestOptions>({
            items: generateRequests(),
            batchSize,
            waitBetweenBatchesMillis,
            waitForAllRequestsToBeAdded,
            maxNewRequests,

            /**
             * Requests the backend reports as unprocessed are warned about and skipped rather than retried:
             * `unprocessedRequests` is what remains after the backend's own transient-error handling - a
             * semantic rejection (e.g. a malformed `userData` shape) that re-sending would only re-poke.
             * Retrying transient failures is the storage backend's job, not the frontend's.
             */
            processChunk: async (chunk, isInitial) => {
                const { processedRequests, unprocessedRequests } = await this.addRequests(chunk, {
                    forefront,
                    cache: isInitial,
                });

                if (unprocessedRequests.length > 0) {
                    this.log.warning(
                        'Some requests were rejected by the request queue and will be skipped. ' +
                            "This usually means the request data is malformed (e.g. an invalid 'userData' shape).",
                        { unprocessedRequests },
                    );
                }

                return processedRequests;
            },

            trackBackgroundBatches: (batches) => {
                this.#inProgressRequestBatchCount += 1;
                void batches.finally(() => {
                    this.#inProgressRequestBatchCount -= 1;
                });
            },
        });
    }

    /**
     * Gets the request from the queue specified by its `uniqueKey`.
     *
     * @param uniqueKey Unique key of the request.
     * @returns Returns the request object, or `null` if it was not found.
     */
    async getRequest<T extends Dictionary = Dictionary>(uniqueKey: string): Promise<Request<T> | null> {
        const transaction = activeStorageTransaction();

        parseArgument(uniqueKey, uniqueKeySchema);

        // Requests buffered by the active transaction (under the `deferred` write policy) are visible to it.
        const buffered = transaction && this.bufferedRequests(transaction).get(uniqueKey);
        if (buffered) {
            return new Request(buffered as unknown as RequestOptions);
        }

        const requestOptions = await this.backend.getRequest(uniqueKey);
        if (!requestOptions) return null;

        return new Request(requestOptions as unknown as RequestOptions);
    }

    /**
     * Returns a next request in the queue to be processed, or `null` if there are no more pending requests.
     *
     * Once you successfully finish processing of the request, you need to call
     * {@apilink RequestQueue.markRequestAsHandled}
     * to mark the request as handled in the queue. If there was some error in processing the request,
     * call {@apilink RequestQueue.reclaimRequest} instead,
     * so that the queue will give the request to some other consumer in another call to the `fetchNextRequest` function.
     *
     * Note that the `null` return value doesn't mean the queue processing finished,
     * it means there are currently no pending requests.
     * To check whether all requests in queue were finished,
     * use {@apilink RequestQueue.checkReadiness} instead.
     *
     * @returns
     *   Returns the request object or `null` if there are no more pending requests.
     */
    async fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null> {
        rejectOperationInTransaction(
            'RequestQueue.fetchNextRequest()',
            'it is part of the crawler request-processing bookkeeping, which a transaction must not affect.',
        );

        if (this.#queuePausedForMigration) {
            return null;
        }

        this.#statsTracker.add('headItemReadCount');
        const requestOptions = await this.backend.fetchNextRequest();
        if (!requestOptions) return null;

        return new Request(requestOptions as unknown as RequestOptions);
    }

    /**
     * Marks a request that was previously returned by the
     * {@apilink RequestQueue.fetchNextRequest}
     * function as handled after successful processing.
     * Handled requests will never again be returned by the `fetchNextRequest` function.
     */
    async markRequestAsHandled(request: Request): Promise<RequestQueueOperationInfo | null> {
        rejectOperationInTransaction(
            'RequestQueue.markRequestAsHandled()',
            'it is part of the crawler request-processing bookkeeping, which a transaction must not affect.',
        );

        parseArgument(request, handledRequestSchema);

        const forefront = this.#requestCache.get(getRequestId(request.uniqueKey))?.forefront ?? false;

        const handledAt = request.handledAt ?? new Date().toISOString();
        this.#statsTracker.add('writeCount');
        const processedRequest = await this.backend.markRequestAsHandled({
            ...(request as Request & { id: string }),
            handledAt,
        });

        // The request was not in progress (e.g. already handled) — nothing to do.
        if (!processedRequest) {
            return null;
        }

        request.handledAt = handledAt;

        const queueOperationInfo = {
            ...processedRequest,
            uniqueKey: request.uniqueKey,
            forefront,
        } satisfies RequestQueueOperationInfo;

        this.cacheRequest(getRequestId(request.uniqueKey), queueOperationInfo);

        return queueOperationInfo;
    }

    /**
     * Reclaims a failed request back to the queue, so that it can be returned for processing later again
     * by another call to {@apilink RequestQueue.fetchNextRequest}.
     * The request record in the queue is updated using the provided `request` parameter.
     * For example, this lets you store the number of retries or error messages for the request.
     */
    async reclaimRequest(
        request: Request,
        options: RequestQueueOperationOptions = {},
    ): Promise<RequestQueueOperationInfo | null> {
        rejectOperationInTransaction(
            'RequestQueue.reclaimRequest()',
            'it is part of the crawler request-processing bookkeeping, which a transaction must not affect.',
        );

        parseArgument(request, reclaimedRequestSchema);
        const { forefront } = parseArgument(options, operationOptionsSchema);

        this.#statsTracker.add('writeCount');
        const processedRequest = await this.backend.reclaimRequest(request as Request & { id: string }, {
            forefront,
        });

        // The request was not in progress — nothing to reclaim.
        if (!processedRequest) {
            return null;
        }

        const queueOperationInfo = {
            ...processedRequest,
            uniqueKey: request.uniqueKey,
            forefront,
        } satisfies RequestQueueOperationInfo;
        this.cacheRequest(getRequestId(request.uniqueKey), queueOperationInfo);

        return queueOperationInfo;
    }

    /**
     * A queue hands requests out as fast as they are asked for; pacing is a job for a manager wrapped around it,
     * such as {@apilink ThrottlingRequestManager}.
     * @inheritdoc
     */
    recordPacingSignal(_signal: PacingSignal): boolean {
        return false;
    }

    /**
     * Reports whether the queue has a request to hand over, is waiting on one, or is done.
     *
     * `waiting` means requests are in progress (fetched but not yet handled or reclaimed, possibly by another
     * client sharing the queue) or a background add is still landing; neither has a clock, so no `readyAt`.
     *
     * Due to the nature of distributed storage used by the queue, `finished` may occasionally arrive a probe or
     * two late, but it is never reported early.
     */
    async checkReadiness(): Promise<RequestLoaderStatus> {
        const transaction = activeStorageTransaction();

        // Requests buffered by the active transaction count as pending from its point of view.
        if (transaction && this.bufferedRequests(transaction).size > 0) {
            return { status: 'ready' };
        }

        // Something fetchable outranks everything below, so this is the only backend call a probe needs.
        if (!(await this.backend.isEmpty())) {
            return { status: 'ready' };
        }

        // We are not finished if we're still adding new requests in the background.
        if (this.#inProgressRequestBatchCount > 0) {
            return { status: 'waiting' };
        }

        return (await this.backend.isFinished()) ? { status: 'finished' } : { status: 'waiting' };
    }

    /**
     * Tells the queue how long a consumer expects to hold a fetched request before marking it handled
     * or reclaiming it (typically the request-handler timeout plus padding), so that a storage backend
     * that reserves requests via locking does not hand the same request out again while it is still
     * being processed.
     *
     * Several consumers may share one queue (and therefore one client) in a single process, so we only
     * ever raise the reservation duration, never lower it — otherwise a short-lived consumer could cut
     * short the reservation of a long-lived one and have its in-flight request stolen.
     */
    async setExpectedRequestProcessingTimeSecs(secs: number): Promise<void> {
        if (secs <= this.#expectedRequestProcessingSecs) {
            return;
        }

        this.#expectedRequestProcessingSecs = secs;
        await this.backend.setExpectedRequestProcessingTimeSecs?.(secs);
    }

    /**
     * Caches information about request to beware of unneeded addRequest() calls.
     */
    private cacheRequest(cacheKey: string, queueOperationInfo: RequestQueueOperationInfo): void {
        // Remove the previous entry, as otherwise our cache will never update 👀
        this.#requestCache.remove(cacheKey);

        this.#requestCache.add(cacheKey, {
            id: queueOperationInfo.requestId,
            isHandled: queueOperationInfo.wasAlreadyHandled,
            uniqueKey: queueOperationInfo.uniqueKey,
            hydrated: null,
            lockExpiresAt: null,
            forefront: queueOperationInfo.forefront,
        });
    }

    /**
     * Removes the queue either from the Apify Cloud storage or from the local database,
     * depending on the mode of operation.
     */
    async drop(): Promise<void> {
        rejectOperationInTransaction('RequestQueue.drop()');

        await this.backend.drop();
        serviceLocator.getStorageInstanceManager().removeFromCache(this);
    }

    /**
     * Remove all requests from the queue but keep the queue itself, resetting it
     * so it can be reused (e.g. across multiple `crawler.run()` calls).
     */
    async purge(): Promise<void> {
        rejectOperationInTransaction('RequestQueue.purge()');

        await this.backend.purge();

        // Reset in-memory bookkeeping so the queue behaves as if freshly opened.
        this.#requestCache.clear();
        this.#requestSeenCache.clear();
        this.#inProgressRequestBatchCount = 0;

        // Reset the expected-processing-time high-water mark too, otherwise the monotonic-raise guard
        // in `setExpectedRequestProcessingTimeSecs` would let a value raised in an earlier run leak into a
        // later one and silently swallow a lower hint (the queue is meant to be reusable across runs).
        this.#expectedRequestProcessingSecs = 0;
    }

    /**
     * @inheritdoc
     */
    async *[Symbol.asyncIterator]() {
        while (true) {
            const req = await this.fetchNextRequest();
            if (!req) break;
            yield req;
        }
    }

    /**
     * Returns the number of handled requests.
     *
     * This function is just a convenient shortcut for:
     *
     * ```javascript
     * const { handledRequestCount } = await queue.getInfo();
     * ```
     * @inheritdoc
     */
    async getHandledCount(): Promise<number> {
        // NOTE: We keep this function for compatibility with RequestList.getHandledCount()
        const { handledRequestCount } = await this.getInfo();
        return handledRequestCount;
    }

    /**
     * Returns an object containing general information about the request queue.
     *
     * **Example:**
     * ```
     * {
     *   id: "WkzbQMuFYuamGv3YF",
     *   name: "my-queue",
     *   createdAt: new Date("2015-12-12T07:34:14.202Z"),
     *   modifiedAt: new Date("2015-12-13T08:36:13.202Z"),
     *   accessedAt: new Date("2015-12-14T08:36:13.202Z"),
     *   totalRequestCount: 25,
     *   handledRequestCount: 5,
     *   pendingRequestCount: 20,
     * }
     * ```
     *
     * @throws If the underlying storage no longer exists (e.g. it was deleted externally).
     */
    async getInfo(): Promise<RequestQueueInfo> {
        const transaction = activeStorageTransaction();

        const metadata = await this.backend.getMetadata();
        const bufferedCount = transaction ? this.bufferedRequests(transaction).size : 0;

        if (bufferedCount > 0) {
            return {
                ...metadata,
                totalRequestCount: metadata.totalRequestCount + bufferedCount,
                pendingRequestCount: metadata.pendingRequestCount + bufferedCount,
            };
        }

        return metadata;
    }

    /**
     * Fetches URLs from requestsFromUrl and returns them in format of list of requests
     */
    private async fetchRequestsFromUrl(source: InternalSource): Promise<RequestOptions[]> {
        const { requestsFromUrl, regex, ...sharedOpts } = source;

        // Download remote resource and parse URLs.
        let urlsArr;
        try {
            urlsArr = await this.downloadListOfUrls({
                url: requestsFromUrl,
                urlRegExp: regex,
                proxyUrl: (await this.#proxyConfiguration?.newProxyInfo())?.url,
            });
        } catch (err) {
            throw new Error(`Cannot fetch a request list from ${requestsFromUrl}: ${err}`);
        }

        // Skip if resource contained no URLs.
        if (!urlsArr.length) {
            this.log.warning('The fetched list contains no valid URLs.', { requestsFromUrl, regex });
            return [];
        }

        return urlsArr.map((url) => ({ url, ...sharedOpts }));
    }

    /**
     * Adds all fetched requests from a URL from a remote resource.
     */
    private async addFetchedRequests(
        source: InternalSource,
        fetchedRequests: RequestOptions[],
        options: RequestQueueOperationOptions,
    ) {
        const { requestsFromUrl, regex } = source;
        const { addedRequests } = await this.addRequestsBatched(fetchedRequests, options);

        this.log.info('Fetched and loaded Requests from a remote resource.', {
            requestsFromUrl,
            regex,
            fetchedCount: fetchedRequests.length,
            importedCount: addedRequests.length,
            duplicateCount: fetchedRequests.length - addedRequests.length,
            sample: JSON.stringify(fetchedRequests.slice(0, 5)),
        });

        return addedRequests;
    }

    /**
     * @internal wraps public utility for mocking purposes
     */
    private async downloadListOfUrls(options: {
        url: string;
        urlRegExp?: RegExp;
        proxyUrl?: string;
    }): Promise<string[]> {
        return downloadListOfUrls({
            ...options,
            httpClient: this.#httpClient,
        });
    }

    /**
     * Opens a request queue and returns a promise resolving to an instance
     * of the {@apilink RequestQueue} class.
     *
     * {@apilink RequestQueue} represents a queue of URLs to crawl, which is stored either on local filesystem or in the cloud.
     * The queue is used for deep crawling of websites, where you start with several URLs and then
     * recursively follow links to other pages. The data structure supports both breadth-first
     * and depth-first crawling orders.
     *
     * For more details and code examples, see the {@apilink RequestQueue} class.
     *
     * @param [identifier]
     *   ID or name of the request queue to be opened. If a string is provided, it will first be
     *   looked up as an ID; if no such storage exists, it will be treated as a name.
     *   If `null` or `undefined`, the function returns the default request queue associated with the crawler run.
     * @param [options] Open Request Queue options.
     */
    static async open(
        identifier?: string | StorageIdentifier | null,
        options: StorageOpenOptions = {},
    ): Promise<RequestQueue> {
        tryCancel();

        const parsedOptions = parseArgument(options, openOptionsSchema);

        const storageBackend = parsedOptions.storageBackend ?? serviceLocator.getStorageBackend();
        const configuration = parsedOptions.configuration ?? serviceLocator.getConfiguration();

        await purgeDefaultStorages({ onlyPurgeOnce: true, storageBackend, configuration });

        const resolved = await resolveStorageIdentifier(identifier, storageBackend, 'RequestQueue');

        const queue = await serviceLocator
            .getStorageInstanceManager()
            .openStorage<RequestQueue>(this as unknown as Constructor<RequestQueue>, {
                ...resolved,
                backendOpener: () => storageBackend.createRequestQueueBackend(resolved),
                backendCacheKey: storageBackend.getStorageBackendCacheKey?.() ?? storageBackend.constructor.name,
            });
        queue.#proxyConfiguration = parsedOptions.proxyConfiguration;
        queue.#httpClient = parsedOptions.httpClient;

        return queue;
    }
}

interface RequestLruItem {
    uniqueKey: string;
    isHandled: boolean;
    id: string;
    hydrated: Request | null;
    lockExpiresAt: number | null;
    forefront: boolean;
}

export interface RequestQueueOptions {
    /** Resolved metadata for the request queue, as returned by the backend's `getMetadata()`. */
    metadata: RequestQueueInfo;
    backend: RequestQueueBackend;

    /**
     * Used to pass the proxy configuration for the `requestsFromUrl` objects.
     * Takes advantage of the internal address rotation and authentication process.
     * If undefined, the `requestsFromUrl` requests will be made without proxy.
     */
    proxyConfiguration?: IProxyConfiguration;
}

export interface RequestQueueOperationOptions {
    /**
     * If set to `true`:
     *   - while adding the request to the queue: the request will be added to the foremost position in the queue.
     *   - while reclaiming the request: the request will be placed to the beginning of the queue, so that it's returned
     *   in the next call to {@apilink RequestQueue.fetchNextRequest}.
     * By default, it's put to the end of the queue.
     *
     * In case the request is already present in the queue, this option has no effect.
     *
     * If more requests are added with this option at once, their order in the following `fetchNextRequest` call
     * is arbitrary.
     * @default false
     */
    forefront?: boolean;
    /**
     * Should the requests be added to the local LRU cache?
     * @default false
     * @internal
     */
    cache?: boolean;
}

export interface RequestQueueOperationInfo extends QueueOperationInfo {
    uniqueKey: string;
    forefront: boolean;
}

export interface AddRequestsBatchedOptions extends RequestQueueOperationOptions {
    /**
     * Whether to wait for all the provided requests to be added, instead of waiting just for the initial batch of up to `batchSize`.
     * @default false
     */
    waitForAllRequestsToBeAdded?: boolean;

    /**
     * @default 1000
     */
    batchSize?: number;

    /**
     * @default 1000
     */
    waitBetweenBatchesMillis?: number;

    /**
     * If set, only this many *actually new* requests (i.e. not already present in the queue) will be added.
     * Once the budget is reached, remaining requests from the iterable will be collected in
     * {@apilink AddRequestsBatchedResult.requestsOverLimit|`requestsOverLimit`} instead.
     *
     * This is useful in combination with `maxRequestsPerCrawl` to avoid duplicate URLs consuming the budget.
     *
     * **Note:** Setting this option implicitly enables {@apilink AddRequestsBatchedOptions.waitForAllRequestsToBeAdded|`waitForAllRequestsToBeAdded`},
     * since all batches must complete before leftover requests can be accurately reported.
     */
    maxNewRequests?: number;
}

export interface AddRequestsBatchedResult {
    addedRequests: ProcessedRequest[];
    /**
     * A promise which will resolve with the rest of the requests that were added to the queue.
     *
     * Alternatively, we can set {@apilink AddRequestsBatchedOptions.waitForAllRequestsToBeAdded|`waitForAllRequestsToBeAdded`} to `true`
     * in the {@apilink BasicCrawler.addRequests|`crawler.addRequests()`} options.
     *
     * **Example:**
     *
     * ```ts
     * // Assuming `requests` is a list of requests.
     * const result = await crawler.addRequests(requests);
     *
     * // If we want to wait for the rest of the requests to be added to the queue:
     * await result.waitForAllRequestsToBeAdded;
     * ```
     */
    waitForAllRequestsToBeAdded: Promise<ProcessedRequest[]>;

    /**
     * Requests from the input that were not added to the queue because the
     * {@apilink AddRequestsBatchedOptions.maxNewRequests|`maxNewRequests`} budget was reached.
     * Empty when `maxNewRequests` is not set.
     */
    requestsOverLimit?: Source[];
}
