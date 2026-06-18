import { inspect } from 'node:util';

import type {
    BaseHttpClient,
    BatchAddRequestsResult,
    Dictionary,
    ProcessedRequest,
    QueueOperationInfo,
    RequestQueueClient,
    RequestQueueInfo,
} from '@crawlee/types';
import {
    chunkedAsyncIterable,
    downloadListOfUrls,
    getObjectType,
    isAsyncIterable,
    isIterable,
    peekableAsyncIterable,
    sleep,
} from '@crawlee/utils';
import ow from 'ow';
import type { ReadonlyDeep } from 'type-fest';

import { LruCache } from '@apify/datastructures';
import { cryptoRandomObjectId } from '@apify/utilities';

import { Configuration } from '../configuration.js';
import type { Constructor } from '../typedefs.js';
import type { EventManager } from '../events/event_manager.js';
import { EventType } from '../events/event_manager.js';
import type { CrawleeLogger } from '../log.js';
import type { ProxyConfiguration } from '../proxy_configuration.js';
import type { InternalSource, RequestOptions, Source } from '../request.js';
import { Request } from '../request.js';
import { serviceLocator } from '../service_locator.js';
import { checkStorageAccess } from './access_checking.js';
import type { IRequestManager, RequestsLike } from './request_manager.js';
import type { IStorage, StorageIdentifier } from './storage_instance_manager.js';
import type { StorageOpenOptions } from './utils.js';
import { resolveStorageIdentifier } from './storage_instance_manager.js';
import { getRequestId, purgeDefaultStorages } from './utils.js';

/**
 * The maximum number of requests cached locally to avoid redundant calls to the storage client.
 * @internal
 */
const MAX_CACHED_REQUESTS = 2_000_000;

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
    id: string;
    name?: string;
    timeoutSecs = 30;
    clientKey = cryptoRandomObjectId();
    client: RequestQueueClient;
    protected proxyConfiguration?: ProxyConfiguration;

    log: CrawleeLogger;

    private isInitialized = false;

    protected requestCache: LruCache<RequestLruItem>;

    protected queuePausedForMigration = false;

    protected inProgressRequestBatchCount = 0;

    /**
     * The largest expected request-processing time (in seconds) seen so far via
     * {@link setExpectedRequestProcessingTimeSecs}. Used to ensure that value is only ever raised, never
     * lowered, before being forwarded to the storage client.
     */
    protected expectedRequestProcessingSecs = 0;

    protected httpClient?: BaseHttpClient;

    protected readonly events: EventManager;

    /**
     * @internal
     */
    constructor(
        options: RequestQueueOptions,
        protected readonly config: Configuration = Configuration.getGlobalConfig(),
    ) {
        this.id = options.id;
        this.name = options.name;
        this.events = serviceLocator.getEventManager();
        this.client = options.client;

        this.proxyConfiguration = options.proxyConfiguration;

        this.requestCache = new LruCache({ maxLength: MAX_CACHED_REQUESTS });
        this.log = serviceLocator.getLogger().child({ prefix: `RequestQueue(${this.id}, ${this.name ?? 'no-name'})` });

        this.events.on(EventType.MIGRATING, async () => {
            this.queuePausedForMigration = true;
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
        checkStorageAccess();

        ow(requestLike, ow.object);
        ow(
            options,
            ow.object.exactShape({
                forefront: ow.optional.boolean,
            }),
        );

        const { forefront = false } = options;

        if ('requestsFromUrl' in requestLike) {
            const requests = await this._fetchRequestsFromUrl(requestLike as InternalSource);
            const processedRequests = await this._addFetchedRequests(requestLike as InternalSource, requests, options);

            return { ...processedRequests[0], forefront };
        }

        ow(
            requestLike,
            ow.object.partialShape({
                url: ow.string,
                id: ow.undefined,
            }),
        );

        const request = requestLike instanceof Request ? requestLike : new Request(requestLike);

        const cacheKey = getRequestId(request.uniqueKey);
        const cachedInfo = this.requestCache.get(cacheKey);

        if (cachedInfo) {
            request.id = cachedInfo.id;
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

        const { processedRequests } = await this.client.addBatchOfRequests([request], { forefront });
        const queueOperationInfo = {
            ...processedRequests[0],
            uniqueKey: request.uniqueKey,
            forefront,
        } satisfies RequestQueueOperationInfo;

        this._cacheRequest(cacheKey, queueOperationInfo);

        return queueOperationInfo;
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
        checkStorageAccess();

        ow(
            requestsLike,
            ow.object
                .is((value: unknown) => isIterable(value) || isAsyncIterable(value))
                .message((value) => `Expected an iterable or async iterable, got ${getObjectType(value)}`),
        );
        ow(
            options,
            ow.object.exactShape({
                forefront: ow.optional.boolean,
                cache: ow.optional.boolean,
            }),
        );

        const { forefront = false, cache = true } = options;

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
                const fetchedRequests = await this._fetchRequestsFromUrl(requestLike as InternalSource);
                await this._addFetchedRequests(requestLike as InternalSource, fetchedRequests, options);
            } else {
                requests.push(
                    requestLike instanceof Request ? requestLike : new Request(requestLike as RequestOptions),
                );
            }
        }

        const requestsToAdd = new Map<string, Request>();

        for (const request of requests) {
            const cacheKey = getCachedRequestId(request.uniqueKey);
            const cachedInfo = this.requestCache.get(cacheKey);

            if (cachedInfo) {
                request.id = cachedInfo.id;
                results.processedRequests.push({
                    wasAlreadyPresent: true,
                    // We may assume that if request is in local cache then also the information if the
                    // request was already handled is there because just one client should be using one queue.
                    wasAlreadyHandled: cachedInfo.isHandled,
                    requestId: cachedInfo.id,
                    uniqueKey: cachedInfo.uniqueKey,
                });
            } else if (!requestsToAdd.has(request.uniqueKey)) {
                requestsToAdd.set(request.uniqueKey, request);
            }
        }

        // Early exit if all provided requests were already added
        if (!requestsToAdd.size) {
            return results;
        }

        const apiResults = await this.client.addBatchOfRequests([...requestsToAdd.values()], { forefront });

        // Report unprocessed requests
        results.unprocessedRequests = apiResults.unprocessedRequests;

        // Add all new requests to the requestCache
        for (const newRequest of apiResults.processedRequests) {
            // Add the new request to the processed list
            results.processedRequests.push(newRequest);

            const cacheKey = getCachedRequestId(newRequest.uniqueKey);

            if (cache) {
                this._cacheRequest(cacheKey, { ...newRequest, forefront });
            }
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
        checkStorageAccess();

        ow(
            requests,
            ow.object
                .is((value: unknown) => isIterable(value) || isAsyncIterable(value))
                .message((value) => `Expected an iterable or async iterable, got ${getObjectType(value)}`),
        );

        ow(
            options,
            ow.object.exactShape({
                forefront: ow.optional.boolean,
                waitForAllRequestsToBeAdded: ow.optional.boolean,
                batchSize: ow.optional.number,
                waitBetweenBatchesMillis: ow.optional.number,
            }),
        );

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
                    await addRequest(opts, { forefront: options.forefront });
                } else {
                    // Yield valid requests
                    yield typeof opts === 'string' ? { url: opts } : (opts as RequestOptions);
                }
            }
        }

        const { batchSize = 1000, waitBetweenBatchesMillis = 1000 } = options;

        const chunks = peekableAsyncIterable(chunkedAsyncIterable(generateRequests(), batchSize));
        const chunksIterator = chunks[Symbol.asyncIterator]();

        const attemptToAddToQueueAndAddAnyUnprocessed = async (providedRequests: Source[], cache = true) => {
            const resultsToReturn: ProcessedRequest[] = [];
            const apiResult = await this.addRequests(providedRequests, { forefront: options.forefront, cache });
            resultsToReturn.push(...apiResult.processedRequests);

            if (apiResult.unprocessedRequests.length) {
                await sleep(waitBetweenBatchesMillis);

                resultsToReturn.push(
                    ...(await attemptToAddToQueueAndAddAnyUnprocessed(
                        providedRequests.filter(
                            (r) => !apiResult.processedRequests.some((pr) => pr.uniqueKey === r.uniqueKey),
                        ),
                        false,
                    )),
                );
            }

            return resultsToReturn;
        };

        // Add initial batch of `batchSize` to process them right away
        const initialChunk = await chunksIterator.peek();
        if (initialChunk === undefined) {
            return { addedRequests: [], waitForAllRequestsToBeAdded: Promise.resolve([]) };
        }

        const addedRequests = await attemptToAddToQueueAndAddAnyUnprocessed(initialChunk);
        await chunksIterator.next();

        // If we have no more requests to add, return immediately
        if ((await chunksIterator.peek()) === undefined) {
            return {
                addedRequests,
                waitForAllRequestsToBeAdded: Promise.resolve([]),
            };
        }

        // eslint-disable-next-line no-async-promise-executor
        const promise = new Promise<ProcessedRequest[]>(async (resolve) => {
            const finalAddedRequests: ProcessedRequest[] = [];

            for await (const requestChunk of chunks) {
                finalAddedRequests.push(...(await attemptToAddToQueueAndAddAnyUnprocessed(requestChunk, false)));

                await sleep(waitBetweenBatchesMillis);
            }

            resolve(finalAddedRequests);
        });

        this.inProgressRequestBatchCount += 1;
        void promise.finally(() => {
            this.inProgressRequestBatchCount -= 1;
        });

        // If the user wants to wait for all the requests to be added, we wait for the promise to resolve for them
        if (options.waitForAllRequestsToBeAdded) {
            addedRequests.push(...(await promise));
        }

        return {
            addedRequests,
            waitForAllRequestsToBeAdded: promise,
        };
    }

    /**
     * Gets the request from the queue specified by its `uniqueKey`.
     *
     * @param uniqueKey Unique key of the request.
     * @returns Returns the request object, or `null` if it was not found.
     */
    async getRequest<T extends Dictionary = Dictionary>(uniqueKey: string): Promise<Request<T> | null> {
        checkStorageAccess();

        ow(uniqueKey, ow.string);

        const requestOptions = await this.client.getRequest(uniqueKey);
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
     * use {@apilink RequestQueue.isFinished} instead.
     *
     * @returns
     *   Returns the request object or `null` if there are no more pending requests.
     */
    async fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null> {
        checkStorageAccess();

        if (this.queuePausedForMigration) {
            return null;
        }

        const requestOptions = await this.client.fetchNextRequest();
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
        checkStorageAccess();

        ow(
            request,
            ow.object.partialShape({
                id: ow.string,
                uniqueKey: ow.string,
                handledAt: ow.optional.string,
            }),
        );

        const forefront = this.requestCache.get(getRequestId(request.uniqueKey))?.forefront ?? false;

        const handledAt = request.handledAt ?? new Date().toISOString();
        const processedRequest = await this.client.markRequestAsHandled({
            ...request,
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

        this._cacheRequest(getRequestId(request.uniqueKey), queueOperationInfo);

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
        checkStorageAccess();

        ow(
            request,
            ow.object.partialShape({
                id: ow.string,
                uniqueKey: ow.string,
            }),
        );
        ow(
            options,
            ow.object.exactShape({
                forefront: ow.optional.boolean,
            }),
        );

        const { forefront = false } = options;

        const processedRequest = await this.client.reclaimRequest(request, { forefront });

        // The request was not in progress — nothing to reclaim.
        if (!processedRequest) {
            return null;
        }

        const queueOperationInfo = {
            ...processedRequest,
            uniqueKey: request.uniqueKey,
            forefront,
        } satisfies RequestQueueOperationInfo;
        this._cacheRequest(getRequestId(request.uniqueKey), queueOperationInfo);

        return queueOperationInfo;
    }

    /**
     * Resolves to `true` if the next call to {@apilink RequestQueue.fetchNextRequest} would return
     * `null`, i.e. there are no pending requests to fetch right now. Otherwise it resolves to `false`.
     *
     * Note that even if the queue is empty, there might be some requests currently being processed
     * (fetched but not yet handled or reclaimed). An empty queue therefore does not mean crawling is
     * finished — those in-progress requests may still be reclaimed, and background tasks may still be
     * adding more requests. To check whether all activity in the queue has finished, use
     * {@apilink RequestQueue.isFinished}.
     */
    async isEmpty(): Promise<boolean> {
        checkStorageAccess();

        return this.client.isEmpty();
    }

    /**
     * Resolves to `true` if all requests were already handled and there are no more left — including no
     * requests currently in progress (fetched but not yet handled or reclaimed, including requests
     * locked by other clients sharing the same queue) and no background add operations still in flight.
     *
     * Due to the nature of distributed storage used by the queue, the function may occasionally return
     * a false negative, but it shall never return a false positive.
     */
    async isFinished(): Promise<boolean> {
        checkStorageAccess();

        // We are not finished if we're still adding new requests in the background.
        if (this.inProgressRequestBatchCount > 0) {
            return false;
        }

        return this.client.isFinished();
    }

    /**
     * Tells the queue how long a consumer expects to hold a fetched request before marking it handled
     * or reclaiming it (typically the request-handler timeout plus padding), so that a storage client
     * that reserves requests via locking does not hand the same request out again while it is still
     * being processed.
     *
     * Several consumers may share one queue (and therefore one client) in a single process, so we only
     * ever raise the reservation duration, never lower it — otherwise a short-lived consumer could cut
     * short the reservation of a long-lived one and have its in-flight request stolen.
     */
    setExpectedRequestProcessingTimeSecs(secs: number): void {
        if (secs <= this.expectedRequestProcessingSecs) {
            return;
        }

        this.expectedRequestProcessingSecs = secs;
        this.client.setExpectedRequestProcessingTimeSecs?.(secs);
    }

    /**
     * Caches information about request to beware of unneeded addRequest() calls.
     */
    protected _cacheRequest(cacheKey: string, queueOperationInfo: RequestQueueOperationInfo): void {
        // Remove the previous entry, as otherwise our cache will never update 👀
        this.requestCache.remove(cacheKey);

        this.requestCache.add(cacheKey, {
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
        checkStorageAccess();

        await this.client.drop();
        serviceLocator.getStorageInstanceManager().removeFromCache(this);
    }

    /**
     * Remove all requests from the queue but keep the queue itself, resetting it
     * so it can be reused (e.g. across multiple `crawler.run()` calls).
     */
    async purge(): Promise<void> {
        checkStorageAccess();

        await this.client.purge();

        // Reset in-memory bookkeeping so the queue behaves as if freshly opened.
        this.requestCache.clear();
        this.inProgressRequestBatchCount = 0;

        // Reset the expected-processing-time high-water mark too, otherwise the monotonic-raise guard
        // in `setExpectedRequestProcessingTimeSecs` would let a value raised in an earlier run leak into a
        // later one and silently swallow a lower hint (the queue is meant to be reusable across runs).
        this.expectedRequestProcessingSecs = 0;
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
        checkStorageAccess();

        return this.client.getMetadata();
    }

    /**
     * Fetches URLs from requestsFromUrl and returns them in format of list of requests
     */
    protected async _fetchRequestsFromUrl(source: InternalSource): Promise<RequestOptions[]> {
        const { requestsFromUrl, regex, ...sharedOpts } = source;

        // Download remote resource and parse URLs.
        let urlsArr;
        try {
            urlsArr = await this._downloadListOfUrls({
                url: requestsFromUrl,
                urlRegExp: regex,
                proxyUrl: await this.proxyConfiguration?.newUrl(),
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
    protected async _addFetchedRequests(
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
    private async _downloadListOfUrls(options: {
        url: string;
        urlRegExp?: RegExp;
        proxyUrl?: string;
    }): Promise<string[]> {
        return downloadListOfUrls({
            ...options,
            httpClient: this.httpClient,
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
        checkStorageAccess();

        ow(
            options,
            ow.object.exactShape({
                config: ow.optional.object.instanceOf(Configuration),
                storageClient: ow.optional.object,
                proxyConfiguration: ow.optional.object,
                httpClient: ow.optional.object,
            }),
        );

        const client = options.storageClient ?? serviceLocator.getStorageClient();
        const config = options.config ?? serviceLocator.getConfiguration();

        await purgeDefaultStorages({ onlyPurgeOnce: true, client, config });

        const resolved = await resolveStorageIdentifier(identifier, client, 'RequestQueue');

        const queue = await serviceLocator
            .getStorageInstanceManager()
            .openStorage<RequestQueue>(this as unknown as Constructor<RequestQueue>, {
                ...resolved,
                clientOpener: () => client.createRequestQueueClient(resolved),
                clientCacheKey: client.getStorageClientCacheKey?.() ?? client.constructor.name,
            });
        queue.proxyConfiguration = options.proxyConfiguration;
        queue.httpClient = options.httpClient;

        if (!queue.isInitialized) {
            // Re-create the request queue client with clientKey and timeoutSecs so that
            // request locking works correctly for API-backed implementations.
            // TODO: clientKey/timeoutSecs are Apify-platform concerns and should eventually be pushed
            // down into the Apify SDK's client implementation, aligning with crawlee-python's approach
            // where locking is handled internally by the client (see crawlee-python PR #1194).
            queue.client = await client.createRequestQueueClient({
                id: queue.id,
                clientKey: queue.clientKey,
                timeoutSecs: queue.timeoutSecs,
            });

            queue.isInitialized = true;
        }

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
    id: string;
    name?: string;
    client: RequestQueueClient;

    /**
     * Used to pass the proxy configuration for the `requestsFromUrl` objects.
     * Takes advantage of the internal address rotation and authentication process.
     * If undefined, the `requestsFromUrl` requests will be made without proxy.
     */
    proxyConfiguration?: ProxyConfiguration;
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

/**
 * @internal
 */
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
}
