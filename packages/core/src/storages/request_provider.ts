import { ListDictionary, LruCache } from '@apify/datastructures';
import type { Log } from '@apify/log';
import { cryptoRandomObjectId } from '@apify/utilities';
import type {
    BatchAddRequestsResult,
    Dictionary,
    ProcessedRequest,
    QueueOperationInfo,
    RequestQueueClient,
    RequestQueueInfo,
    StorageClient,
} from '@crawlee/types';
import { chunk, downloadListOfUrls, sleep } from '@crawlee/utils';
import ow from 'ow';

import type { IStorage, StorageManagerOptions } from './storage_manager';
import { StorageManager } from './storage_manager';
import { QUERY_HEAD_MIN_LENGTH, STORAGE_CONSISTENCY_DELAY_MILLIS, getRequestId, purgeDefaultStorages } from './utils';
import { Configuration } from '../configuration';
import { log } from '../log';
import type { ProxyConfiguration } from '../proxy_configuration';
import { Request } from '../request';
import type { RequestOptions, InternalSource, Source } from '../request';
import type { Constructor } from '../typedefs';

export abstract class RequestProvider implements IStorage {
    id: string;
    name?: string;
    timeoutSecs = 30;
    clientKey = cryptoRandomObjectId();
    client: RequestQueueClient;
    protected proxyConfiguration?: ProxyConfiguration;

    log: Log;
    internalTimeoutMillis = 5 * 60_000; // defaults to 5 minutes, will be overridden by BasicCrawler

    // We can trust these numbers only in a case that queue is used by a single client.
    // This information is returned by getHead() under the hadMultipleClients property.
    assumedTotalCount = 0;
    assumedHandledCount = 0;

    protected queueHeadIds = new ListDictionary<string>();
    protected requestCache: LruCache<RequestLruItem>;
    protected requestIdsInProgress = new Set<string>();
    protected recentlyHandledRequestsCache: LruCache<boolean>;

    // TODO: RQv1 logic for stuck queues, this might not be needed anymore
    protected lastActivity = new Date();

    constructor(options: InternalRequestProviderOptions, readonly config = Configuration.getGlobalConfig()) {
        this.id = options.id;
        this.name = options.name;
        this.client = options.client.requestQueue(this.id, {
            clientKey: this.clientKey,
            timeoutSecs: this.timeoutSecs,
        });

        this.proxyConfiguration = options.proxyConfiguration;

        this.requestCache = new LruCache({ maxLength: options.requestCacheMaxSize });
        this.recentlyHandledRequestsCache = new LruCache({ maxLength: options.recentlyHandledRequestsMaxSize });
        this.log = log.child({ prefix: options.logPrefix });
    }

    /**
     * @ignore
     */
    inProgressCount() {
        return this.requestIdsInProgress.size;
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
    async addRequest(requestLike: Source, options: RequestQueueOperationOptions = {}): Promise<RequestQueueOperationInfo> {
        ow(requestLike, ow.object);
        ow(options, ow.object.exactShape({
            forefront: ow.optional.boolean,
        }));

        this.lastActivity = new Date();
        const { forefront = false } = options;

        if ('requestsFromUrl' in requestLike) {
            const requests = await this._fetchRequestsFromUrl(requestLike as InternalSource);
            const processedRequests = await this._addFetchedRequests(requestLike as InternalSource, requests, options);

            return processedRequests[0];
        }

        ow(requestLike, ow.object.partialShape({
            url: ow.string,
            id: ow.undefined,
        }));

        const request = requestLike instanceof Request
            ? requestLike
            : new Request(requestLike);

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
            };
        }

        const queueOperationInfo = await this.client.addRequest(request, { forefront }) as RequestQueueOperationInfo;
        queueOperationInfo.uniqueKey = request.uniqueKey;

        const { requestId, wasAlreadyPresent } = queueOperationInfo;
        this._cacheRequest(cacheKey, queueOperationInfo);

        if (!wasAlreadyPresent && !this.requestIdsInProgress.has(requestId) && !this.recentlyHandledRequestsCache.get(requestId)) {
            this.assumedTotalCount++;

            // Performance optimization: add request straight to head if possible
            this._maybeAddRequestToQueueHead(requestId, forefront);
        }

        return queueOperationInfo;
    }

    /**
     * Adds requests to the queue in batches of 25.
     *
     * If a request that is passed in is already present due to its `uniqueKey` property being the same,
     * it will not be updated. You can find out whether this happened by finding the request in the resulting
     * {@apilink BatchAddRequestsResult} object.
     *
     * @param requestsLike {@apilink Request} objects or vanilla objects with request data.
     * Note that the function sets the `uniqueKey` and `id` fields to the passed requests if missing.
     * @param [options] Request queue operation options.
     */
    async addRequests(
        requestsLike: Source[],
        options: RequestQueueOperationOptions = {},
    ): Promise<BatchAddRequestsResult> {
        ow(requestsLike, ow.array);
        ow(options, ow.object.exactShape({
            forefront: ow.optional.boolean,
        }));

        const { forefront = false } = options;

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

        for (const requestLike of requestsLike) {
            if ('requestsFromUrl' in requestLike) {
                const requests = await this._fetchRequestsFromUrl(requestLike as InternalSource);
                await this._addFetchedRequests(requestLike as InternalSource, requests, options);
            }
        }

        const requests = requestsLike
            .filter((requestLike) => !('requestsFromUrl' in requestLike))
            .map((requestLike) => {
                return requestLike instanceof Request ? requestLike : new Request(requestLike as RequestOptions);
            });

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

        const apiResults = await this.client.batchAddRequests([...requestsToAdd.values()], { forefront });

        // Report unprocessed requests
        results.unprocessedRequests = apiResults.unprocessedRequests;

        // Add all new requests to the queue head
        for (const newRequest of apiResults.processedRequests) {
            // Add the new request to the processed list
            results.processedRequests.push(newRequest);

            const cacheKey = getCachedRequestId(newRequest.uniqueKey);

            const { requestId, wasAlreadyPresent } = newRequest;
            this._cacheRequest(cacheKey, newRequest);

            if (!wasAlreadyPresent && !this.requestIdsInProgress.has(requestId) && !this.recentlyHandledRequestsCache.get(requestId)) {
                this.assumedTotalCount++;

                // Performance optimization: add request straight to head if possible
                this._maybeAddRequestToQueueHead(requestId, forefront);
            }
        }

        return results;
    }

    /**
     * Adds requests to the queue in batches. By default, it will resolve after the initial batch is added, and continue
     * adding the rest in background. You can configure the batch size via `batchSize` option and the sleep time in between
     * the batches via `waitBetweenBatchesMillis`. If you want to wait for all batches to be added to the queue, you can use
     * the `waitForAllRequestsToBeAdded` promise you get in the response object.
     *
     * @param requests The requests to add
     * @param options Options for the request queue
     */
    async addRequestsBatched(requests: (string | Source)[], options: AddRequestsBatchedOptions = {}): Promise<AddRequestsBatchedResult> {
        ow(requests, ow.array.ofType(ow.any(
            ow.string,
            ow.object.partialShape({ url: ow.string, id: ow.undefined }),
            ow.object.partialShape({ requestsFromUrl: ow.string, regex: ow.optional.regExp }),
        )));
        ow(options, ow.object.exactShape({
            forefront: ow.optional.boolean,
            waitForAllRequestsToBeAdded: ow.optional.boolean,
            batchSize: ow.optional.number,
            waitBetweenBatchesMillis: ow.optional.number,
        }));

        const {
            batchSize = 1000,
            waitBetweenBatchesMillis = 1000,
        } = options;
        const builtRequests: Request[] = [];

        for (const opts of requests) {
            if (opts && typeof opts === 'object' && 'requestsFromUrl' in opts) {
                await this.addRequest(opts, { forefront: options.forefront });
            } else {
                builtRequests.push(new Request(typeof opts === 'string' ? { url: opts } : opts as RequestOptions));
            }
        }

        const attemptToAddToQueueAndAddAnyUnprocessed = async (providedRequests: Request[]) => {
            const resultsToReturn: ProcessedRequest[] = [];
            const apiResult = await this.addRequests(providedRequests, { forefront: options.forefront });
            resultsToReturn.push(...apiResult.processedRequests);

            if (apiResult.unprocessedRequests.length) {
                await sleep(waitBetweenBatchesMillis);

                resultsToReturn.push(...await attemptToAddToQueueAndAddAnyUnprocessed(
                    providedRequests.filter((r) => !apiResult.processedRequests.some((pr) => pr.uniqueKey === r.uniqueKey)),
                ));
            }

            return resultsToReturn;
        };

        const initialChunk = builtRequests.splice(0, batchSize);

        // Add initial batch of `batchSize` to process them right away
        const addedRequests = await attemptToAddToQueueAndAddAnyUnprocessed(initialChunk);

        // If we have no more requests to add, return early
        if (!builtRequests.length) {
            return {
                addedRequests,
                waitForAllRequestsToBeAdded: Promise.resolve([]),
            };
        }

        // eslint-disable-next-line no-async-promise-executor
        const promise = new Promise<ProcessedRequest[]>(async (resolve) => {
            const chunks = chunk(builtRequests, batchSize);
            const finalAddedRequests: ProcessedRequest[] = [];

            for (const requestChunk of chunks) {
                finalAddedRequests.push(...await attemptToAddToQueueAndAddAnyUnprocessed(requestChunk));

                await sleep(waitBetweenBatchesMillis);
            }

            resolve(finalAddedRequests);
        });

        // If the user wants to wait for all the requests to be added, we wait for the promise to resolve for them
        if (options.waitForAllRequestsToBeAdded) {
            addedRequests.push(...await promise);
        }

        return {
            addedRequests,
            waitForAllRequestsToBeAdded: promise,
        };
    }

    /**
     * Gets the request from the queue specified by ID.
     *
     * @param id ID of the request.
     * @returns Returns the request object, or `null` if it was not found.
     */
    async getRequest<T extends Dictionary = Dictionary>(id: string): Promise<Request<T> | null> {
        ow(id, ow.string);

        const requestOptions = await this.client.getRequest(id);
        if (!requestOptions) return null;

        return new Request(requestOptions as unknown as RequestOptions);
    }

    abstract fetchNextRequest<T extends Dictionary = Dictionary>(options?: RequestOptions): Promise<Request<T> | null>;

    /**
     * Marks a request that was previously returned by the
     * {@apilink RequestQueue.fetchNextRequest}
     * function as handled after successful processing.
     * Handled requests will never again be returned by the `fetchNextRequest` function.
     */
    async markRequestHandled(request: Request): Promise<RequestQueueOperationInfo | null> {
        this.lastActivity = new Date();
        ow(request, ow.object.partialShape({
            id: ow.string,
            uniqueKey: ow.string,
            handledAt: ow.optional.string,
        }));

        if (!this.requestIdsInProgress.has(request.id)) {
            this.log.debug(`Cannot mark request ${request.id} as handled, because it is not in progress!`, { requestId: request.id });
            return null;
        }

        const handledAt = request.handledAt ?? new Date().toISOString();
        const queueOperationInfo = await this.client.updateRequest({ ...request, handledAt }) as RequestQueueOperationInfo;
        request.handledAt = handledAt;
        queueOperationInfo.uniqueKey = request.uniqueKey;

        this.requestIdsInProgress.delete(request.id);
        this.recentlyHandledRequestsCache.add(request.id, true);

        if (!queueOperationInfo.wasAlreadyHandled) {
            this.assumedHandledCount++;
        }

        this._cacheRequest(getRequestId(request.uniqueKey), queueOperationInfo);

        return queueOperationInfo;
    }

    /**
     * Reclaims a failed request back to the queue, so that it can be returned for processing later again
     * by another call to {@apilink RequestQueue.fetchNextRequest}.
     * The request record in the queue is updated using the provided `request` parameter.
     * For example, this lets you store the number of retries or error messages for the request.
     */
    async reclaimRequest(request: Request, options: RequestQueueOperationOptions = {}): Promise<RequestQueueOperationInfo | null> {
        this.lastActivity = new Date();
        ow(request, ow.object.partialShape({
            id: ow.string,
            uniqueKey: ow.string,
        }));
        ow(options, ow.object.exactShape({
            forefront: ow.optional.boolean,
        }));

        const { forefront = false } = options;

        if (!this.requestIdsInProgress.has(request.id)) {
            this.log.debug(`Cannot reclaim request ${request.id}, because it is not in progress!`, { requestId: request.id });
            return null;
        }

        // TODO: If request hasn't been changed since the last getRequest(),
        //   we don't need to call updateRequest() and thus improve performance.
        const queueOperationInfo = await this.client.updateRequest(request, { forefront }) as RequestQueueOperationInfo;
        queueOperationInfo.uniqueKey = request.uniqueKey;
        this._cacheRequest(getRequestId(request.uniqueKey), queueOperationInfo);

        // Wait a little to increase a chance that the next call to fetchNextRequest() will return the request with updated data.
        // This is to compensate for the limitation of DynamoDB, where writes might not be immediately visible to subsequent reads.
        setTimeout(() => {
            if (!this.requestIdsInProgress.has(request.id)) {
                this.log.debug('The request is no longer marked as in progress in the queue?!', { requestId: request.id });
                return;
            }

            this.requestIdsInProgress.delete(request.id);

            // Performance optimization: add request straight to head if possible
            this._maybeAddRequestToQueueHead(request.id, forefront);
        }, STORAGE_CONSISTENCY_DELAY_MILLIS);

        return queueOperationInfo;
    }

    protected abstract ensureHeadIsNonEmpty(): Promise<void>;

    /**
     * Resolves to `true` if the next call to {@apilink RequestQueue.fetchNextRequest}
     * would return `null`, otherwise it resolves to `false`.
     * Note that even if the queue is empty, there might be some pending requests currently being processed.
     * If you need to ensure that there is no activity in the queue, use {@apilink RequestQueue.isFinished}.
     */
    async isEmpty(): Promise<boolean> {
        await this.ensureHeadIsNonEmpty();
        return this.queueHeadIds.length() === 0;
    }

    /**
     * Resolves to `true` if all requests were already handled and there are no more left.
     * Due to the nature of distributed storage used by the queue,
     * the function might occasionally return a false negative,
     * but it will never return a false positive.
     */
    async isFinished(): Promise<boolean> {
        if ((Date.now() - +this.lastActivity) > this.internalTimeoutMillis) {
            const message = `The request queue seems to be stuck for ${this.internalTimeoutMillis / 1e3}s, resetting internal state.`;
            this.log.warning(message, { inProgress: [...this.requestIdsInProgress] });
            this._reset();
        }

        if (this.queueHeadIds.length() > 0 || this.inProgressCount() > 0) return false;

        const currentHead = await this.client.listHead({ limit: 2 });
        return currentHead.items.length === 0 && this.inProgressCount() === 0;
    }

    protected _reset() {
        this.queueHeadIds.clear();
        this.requestIdsInProgress.clear();
        this.recentlyHandledRequestsCache.clear();
        this.assumedTotalCount = 0;
        this.assumedHandledCount = 0;
        this.requestCache.clear();
        this.lastActivity = new Date();
    }

    /**
     * Caches information about request to beware of unneeded addRequest() calls.
     */
    protected _cacheRequest(cacheKey: string, queueOperationInfo: RequestQueueOperationInfo): void {
        this.requestCache.add(cacheKey, {
            id: queueOperationInfo.requestId,
            isHandled: queueOperationInfo.wasAlreadyHandled,
            uniqueKey: queueOperationInfo.uniqueKey,
            hydrated: null,
            lockExpiresAt: null,
        });
    }

    /**
     * Adds a request straight to the queueHeadDict, to improve performance.
     */
    private _maybeAddRequestToQueueHead(requestId: string, forefront: boolean): void {
        if (forefront) {
            this.queueHeadIds.add(requestId, requestId, true);
        } else if (this.assumedTotalCount < QUERY_HEAD_MIN_LENGTH) {
            this.queueHeadIds.add(requestId, requestId, false);
        }
    }

    /**
     * Removes the queue either from the Apify Cloud storage or from the local database,
     * depending on the mode of operation.
     */
    async drop(): Promise<void> {
        await this.client.delete();
        const manager = StorageManager.getManager(this.constructor as Constructor<IStorage>, this.config);
        manager.closeStorage(this);
    }

    /**
     * Returns the number of handled requests.
     *
     * This function is just a convenient shortcut for:
     *
     * ```javascript
     * const { handledRequestCount } = await queue.getInfo();
     * ```
     */
    async handledCount(): Promise<number> {
        // NOTE: We keep this function for compatibility with RequestList.handledCount()
        const { handledRequestCount } = await this.getInfo() ?? {};
        return handledRequestCount ?? 0;
    }

    /**
     * Returns an object containing general information about the request queue.
     *
     * The function returns the same object as the Apify API Client's
     * [getQueue](https://docs.apify.com/api/apify-client-js/latest#ApifyClient-requestQueues)
     * function, which in turn calls the
     * [Get request queue](https://apify.com/docs/api/v2#/reference/request-queues/queue/get-request-queue)
     * API endpoint.
     *
     * **Example:**
     * ```
     * {
     *   id: "WkzbQMuFYuamGv3YF",
     *   name: "my-queue",
     *   userId: "wRsJZtadYvn4mBZmm",
     *   createdAt: new Date("2015-12-12T07:34:14.202Z"),
     *   modifiedAt: new Date("2015-12-13T08:36:13.202Z"),
     *   accessedAt: new Date("2015-12-14T08:36:13.202Z"),
     *   totalRequestCount: 25,
     *   handledRequestCount: 5,
     *   pendingRequestCount: 20,
     * }
     * ```
     */
    async getInfo(): Promise<RequestQueueInfo | undefined> {
        return this.client.get();
    }

    /**
     * Fetches URLs from requestsFromUrl and returns them in format of list of requests
     */
    protected async _fetchRequestsFromUrl(source: InternalSource): Promise<RequestOptions[]> {
        const { requestsFromUrl, regex, ...sharedOpts } = source;

        // Download remote resource and parse URLs.
        let urlsArr;
        try {
            urlsArr = await this._downloadListOfUrls({ url: requestsFromUrl, urlRegExp: regex, proxyUrl: await this.proxyConfiguration?.newUrl() });
        } catch (err) {
            throw new Error(`Cannot fetch a request list from ${requestsFromUrl}: ${err}`);
        }

        // Skip if resource contained no URLs.
        if (!urlsArr.length) {
            this.log.warning('list fetched, but it is empty.', { requestsFromUrl, regex });
            return [];
        }

        return urlsArr.map((url) => ({ url, ...sharedOpts }));
    }

    /**
     * Adds all fetched requests from a URL from a remote resource.
     */
    protected async _addFetchedRequests(source: InternalSource, fetchedRequests: RequestOptions[], options: RequestQueueOperationOptions) {
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
    private async _downloadListOfUrls(options: { url: string; urlRegExp?: RegExp; proxyUrl?: string }): Promise<string[]> {
        return downloadListOfUrls(options);
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
     * @param [queueIdOrName]
     *   ID or name of the request queue to be opened. If `null` or `undefined`,
     *   the function returns the default request queue associated with the crawler run.
     * @param [options] Open Request Queue options.
     */
    static async open(queueIdOrName?: string | null, options: StorageManagerOptions = {}): Promise<BuiltRequestProvider> {
        ow(queueIdOrName, ow.optional.any(ow.string, ow.null));
        ow(options, ow.object.exactShape({
            config: ow.optional.object.instanceOf(Configuration),
            storageClient: ow.optional.object,
            proxyConfiguration: ow.optional.object,
        }));

        options.config ??= Configuration.getGlobalConfig();
        options.storageClient ??= options.config.getStorageClient();

        await purgeDefaultStorages(options.config, options.storageClient);

        const manager = StorageManager.getManager(this as typeof BuiltRequestProvider, options.config);
        const queue = await manager.openStorage(queueIdOrName, options.storageClient);
        queue.proxyConfiguration = options.proxyConfiguration;

        return queue;
    }
}

declare class BuiltRequestProvider extends RequestProvider {
    override fetchNextRequest<T extends Dictionary = Dictionary>(options?: RequestOptions<Dictionary> | undefined): Promise<Request<T> | null>;
    protected override ensureHeadIsNonEmpty(): Promise<void>;
}

interface RequestLruItem {
    uniqueKey: string;
    isHandled: boolean;
    id: string;
    hydrated: Request | null;
    lockExpiresAt: number | null;
}

export interface RequestProviderOptions {
    id: string;
    name?: string;
    client: StorageClient;

    /**
     * Used to pass the proxy configuration for the `requestsFromUrl` objects.
     * Takes advantage of the internal address rotation and authentication process.
     * If undefined, the `requestsFromUrl` requests will be made without proxy.
     */
    proxyConfiguration?: ProxyConfiguration;
}

export interface InternalRequestProviderOptions extends RequestProviderOptions {
    logPrefix: string;
    requestCacheMaxSize: number;
    recentlyHandledRequestsMaxSize: number;
}

export interface RequestQueueOperationOptions {
    /**
     * If set to `true`:
     *   - while adding the request to the queue: the request will be added to the foremost position in the queue.
     *   - while reclaiming the request: the request will be placed to the beginning of the queue, so that it's returned
     *   in the next call to {@apilink RequestQueue.fetchNextRequest}.
     * By default, it's put to the end of the queue.
     * @default false
     */
    forefront?: boolean;
}

/**
 * @internal
 */
export interface RequestQueueOperationInfo extends QueueOperationInfo {
    uniqueKey: string;
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
