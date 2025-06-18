import { inspect } from 'node:util';

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

import { ListDictionary, LruCache } from '@apify/datastructures';
import type { Log } from '@apify/log';
import { cryptoRandomObjectId } from '@apify/utilities';

import { Configuration } from '../configuration';
import { EventType } from '../events';
import { log } from '../log';
import type { ProxyConfiguration } from '../proxy_configuration';
import type { InternalSource, RequestOptions, Source } from '../request';
import { Request } from '../request';
import type { Constructor } from '../typedefs';
import { checkStorageAccess } from './access_checking';
import type { IStorage, StorageManagerOptions } from './storage_manager';
import { StorageManager } from './storage_manager';
import { getRequestId, purgeDefaultStorages, QUERY_HEAD_MIN_LENGTH } from './utils';

export abstract class RequestProvider implements IStorage {
    id: string;
    name?: string;
    timeoutSecs = 30;
    clientKey = cryptoRandomObjectId();
    client: RequestQueueClient;
    protected proxyConfiguration?: ProxyConfiguration;

    log: Log;
    internalTimeoutMillis = 5 * 60_000; // defaults to 5 minutes, will be overridden by BasicCrawler
    requestLockSecs = 3 * 60; // defaults to 3 minutes, will be overridden by BasicCrawler

    // We can trust these numbers only in a case that queue is used by a single client.
    // This information is returned by getHead() under the hadMultipleClients property.
    assumedTotalCount = 0;
    assumedHandledCount = 0;

    private initialCount = 0;
    private initialHandledCount = 0; // We track this separately from `assumedHandledCount` which is used non-trivially by RequestQueueV1

    protected queueHeadIds = new ListDictionary<string>();
    protected requestCache: LruCache<RequestLruItem>;

    protected recentlyHandledRequestsCache: LruCache<boolean>;

    protected queuePausedForMigration = false;

    protected lastActivity = new Date();

    protected isFinishedCalledWhileHeadWasNotEmpty = 0;

    protected inProgressRequestBatchCount = 0;

    constructor(
        options: InternalRequestProviderOptions,
        readonly config = Configuration.getGlobalConfig(),
    ) {
        this.id = options.id;
        this.name = options.name;
        this.client = options.client.requestQueue(this.id, {
            clientKey: this.clientKey,
            timeoutSecs: this.timeoutSecs,
        });

        this.proxyConfiguration = options.proxyConfiguration;

        this.requestCache = new LruCache({ maxLength: options.requestCacheMaxSize });
        this.recentlyHandledRequestsCache = new LruCache({ maxLength: options.recentlyHandledRequestsMaxSize });
        this.log = log.child({ prefix: `${options.logPrefix}(${this.id}, ${this.name ?? 'no-name'})` });

        const eventManager = config.getEventManager();

        eventManager.on(EventType.MIGRATING, async () => {
            this.queuePausedForMigration = true;
        });
    }

    /**
     * Returns an offline approximation of the total number of requests in the queue (i.e. pending + handled).
     *
     * Survives restarts and actor migrations.
     */
    getTotalCount() {
        return this.assumedTotalCount + this.initialCount;
    }

    /**
     * Returns an offline approximation of the total number of pending requests in the queue.
     *
     * Survives restarts and Actor migrations.
     */
    getPendingCount() {
        return this.getTotalCount() - this.initialHandledCount - this.assumedHandledCount;
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
     * @param requestsLike An iterable of {@apilink Request} objects or plain request data.
     * Note that the function sets the `uniqueKey` and `id` fields to the passed Request.
     * @param [options] Request queue operation options.
     */
    async addRequest(
        requestLike: Source,
        options: RequestQueueOperationOptions = {},
    ): Promise<RequestQueueOperationInfo> {
        checkStorageAccess();

        this.lastActivity = new Date();

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

        const queueOperationInfo = {
            ...(await this.client.addRequest(request, { forefront })),
            uniqueKey: request.uniqueKey,
            forefront,
        } satisfies RequestQueueOperationInfo;

        const { requestId, wasAlreadyPresent } = queueOperationInfo;
        this._cacheRequest(cacheKey, queueOperationInfo);

        if (!wasAlreadyPresent && !this.recentlyHandledRequestsCache.get(requestId)) {
            this.assumedTotalCount++;

            // Performance optimization: add request straight to head if possible
            this._maybeAddRequestToQueueHead(requestId, forefront);
        }

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
    public async addRequests(
        requestsLike: Iterable<Source>,
        options: RequestQueueOperationOptions = {},
    ): Promise<BatchAddRequestsResult> {
        // Materialize the iterable once
        const requestsArray = Array.from(requestsLike);
    
        checkStorageAccess();
        this.lastActivity = new Date();
    
        // Validate options
        ow(requestsArray, ow.array);
        ow(options, ow.object.exactShape({
            forefront: ow.optional.boolean,
            cache: ow.optional.boolean,
        }));
        const { forefront = false, cache = true } = options;
    
        // First handle any "requestsFromUrl"
        for (const src of requestsArray) {
            if ('requestsFromUrl' in src) {
                const fetched = await this._fetchRequestsFromUrl(src as InternalSource);
                await this._addFetchedRequests(src as InternalSource, fetched, options);
            }
        }
    
        // Prepare Request instances for the rest
        const requests: Request[] = requestsArray
            .filter(src => !('requestsFromUrl' in src))
            .map(src => src instanceof Request ? src : new Request(src as RequestOptions));
    
        // Helper for caching
        const uniqueKeyToCacheKey = new Map<string, string>();
        const getCacheKey = (uniqueKey: string) => {
            if (!uniqueKeyToCacheKey.has(uniqueKey)) {
                uniqueKeyToCacheKey.set(uniqueKey, getRequestId(uniqueKey));
            }
            return uniqueKeyToCacheKey.get(uniqueKey)!;
        };
    
        const result: BatchAddRequestsResult = {
            processedRequests: [],
            unprocessedRequests: [],
        };
    
        // Skip already‐cached requests
        for (const req of requests) {
            const cacheKey = getCacheKey(req.uniqueKey);
            const cached = this.requestCache.get(cacheKey);
            if (cached) {
                req.id = cached.id;
                result.processedRequests.push({
                    wasAlreadyPresent: true,
                    wasAlreadyHandled: cached.isHandled,
                    requestId: cached.id,
                    uniqueKey: cached.uniqueKey,
                });
            }
        }
    
        // Determine which to actually add
        const toAdd = requests.filter(req => {
            const cacheKey = getCacheKey(req.uniqueKey);
            return this.requestCache.get(cacheKey) == null;
        });
        if (toAdd.length === 0) return result;
    
        // Call the underlying client
        const api = await this.client.batchAddRequests(
            toAdd.map(r => r),
            { forefront },
        );
        result.unprocessedRequests = api.unprocessedRequests;
    
        // Cache and update counts
        for (const pr of api.processedRequests) {
            const cacheKey = getCacheKey(pr.uniqueKey);
            result.processedRequests.push(pr);
            if (cache) {
                this._cacheRequest(cacheKey, { ...pr, forefront });
            }
            if (!pr.wasAlreadyPresent && !this.recentlyHandledRequestsCache.get(pr.requestId)) {
                this.assumedTotalCount++;
                this._maybeAddRequestToQueueHead(pr.requestId, forefront);
            }
        }
    
        return result;
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
    // In packages/core/src/storages/request_provider.ts, replace your existing addRequestsBatched with:

    
    public async addRequestsBatched(
        sourcesLike: Iterable<string | Source>,
        options: AddRequestsBatchedOptions = {},
    ): Promise<AddRequestsBatchedResult> {
        checkStorageAccess();
        this.lastActivity = new Date();
    
        ow(options, ow.object.exactShape({
            forefront: ow.optional.boolean,
            waitForAllRequestsToBeAdded: ow.optional.boolean,
            batchSize: ow.optional.number,
            waitBetweenBatchesMillis: ow.optional.number,
        }));
        const {
            forefront = false,
            waitForAllRequestsToBeAdded = false,
            batchSize = 1000,
            waitBetweenBatchesMillis = 1000,
        } = options;
    
        // Materialize iterable
        const items = Array.from(sourcesLike);
    
        // Validate each item
        for (const item of items) {
            if (typeof item === 'string') continue;
            if (typeof item === 'object' && item !== null) {
                if ('requestsFromUrl' in item) continue;
                if (typeof (item as Source).url === 'string' && (item as any).id === undefined) continue;
            }
            throw new Error(`Invalid request item: ${inspect(item)}`);
        }
    
        // Expand sources and handle any remote lists
        const sources: Source[] = [];
        for (const item of items) {
            if (typeof item === 'string') {
                sources.push({ url: item });
            } else if ('requestsFromUrl' in item) {
                await this.addRequest(item as InternalSource, { forefront });
            } else {
                sources.push(item as Source);
            }
        }
    
        // Recursive batch‐adder
        const addBatch = async (batch: Source[], useCache = true): Promise<ProcessedRequest[]> => {
            const { processedRequests, unprocessedRequests } = await this.addRequests(batch, {
                forefront,
                cache: useCache,
            });
            let all = processedRequests;
            if (unprocessedRequests.length) {
                await sleep(waitBetweenBatchesMillis);
                const retry = batch.filter(src =>
                    !processedRequests.some(pr => pr.uniqueKey === src.uniqueKey),
                );
                all = all.concat(await addBatch(retry, false));
            }
            return all;
        };
    
        // First batch
        const first = sources.splice(0, batchSize);
        const addedRequests = await addBatch(first);
    
        // If nothing remains, return
        if (sources.length === 0) {
            return {
                addedRequests,
                waitForAllRequestsToBeAdded: Promise.resolve([]),
            };
        }
    
        // Background continuation
        const background = (async () => {
            const rest: ProcessedRequest[] = [];
            for (let i = 0; i < sources.length; i += batchSize) {
                const chunk = sources.slice(i, i + batchSize);
                rest.push(...await addBatch(chunk, false));
                await sleep(waitBetweenBatchesMillis);
            }
            return rest;
        })();
    
        if (waitForAllRequestsToBeAdded) {
            addedRequests.push(...await background);
        }
    
        return {
            addedRequests,
            waitForAllRequestsToBeAdded: background,
        };
    }


    /**
     * Gets the request from the queue specified by ID.
     *
     * @param id ID of the request.
     * @returns Returns the request object, or `null` if it was not found.
     */
    async getRequest<T extends Dictionary = Dictionary>(id: string): Promise<Request<T> | null> {
        checkStorageAccess();

        ow(id, ow.string);

        const requestOptions = await this.client.getRequest(id);
        if (!requestOptions) return null;

        return new Request(requestOptions as unknown as RequestOptions);
    }

    /**
     * Returns a next request in the queue to be processed, or `null` if there are no more pending requests.
     *
     * Once you successfully finish processing of the request, you need to call
     * {@apilink RequestQueue.markRequestHandled}
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
    abstract fetchNextRequest<T extends Dictionary = Dictionary>(options?: RequestOptions): Promise<Request<T> | null>;

    /**
     * Marks a request that was previously returned by the
     * {@apilink RequestQueue.fetchNextRequest}
     * function as handled after successful processing.
     * Handled requests will never again be returned by the `fetchNextRequest` function.
     */
    async markRequestHandled(request: Request): Promise<RequestQueueOperationInfo | null> {
        checkStorageAccess();

        this.lastActivity = new Date();

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
        const queueOperationInfo = {
            ...(await this.client.updateRequest({
                ...request,
                handledAt,
            })),
            uniqueKey: request.uniqueKey,
            forefront,
        } satisfies RequestQueueOperationInfo;
        request.handledAt = handledAt;

        this.recentlyHandledRequestsCache.add(request.id, true);

        if (!queueOperationInfo.wasAlreadyHandled) {
            this.assumedHandledCount++;
        }

        this.queueHeadIds.remove(request.id);

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

        this.lastActivity = new Date();

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

        // TODO: If request hasn't been changed since the last getRequest(),
        //   we don't need to call updateRequest() and thus improve performance.
        const queueOperationInfo = {
            ...(await this.client.updateRequest(request, {
                forefront,
            })),
            uniqueKey: request.uniqueKey,
            forefront,
        } satisfies RequestQueueOperationInfo;
        this._cacheRequest(getRequestId(request.uniqueKey), queueOperationInfo);

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
     * the function may occasionally return a false negative,
     * but it shall never return a false positive.
     */
    abstract isFinished(): Promise<boolean>;

    protected _reset() {
        this.lastActivity = new Date();
        this.queueHeadIds.clear();
        this.recentlyHandledRequestsCache.clear();
        this.assumedTotalCount = 0;
        this.assumedHandledCount = 0;
        this.requestCache.clear();
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
     * Adds a request straight to the queueHeadDict, to improve performance.
     */
    protected _maybeAddRequestToQueueHead(requestId: string, forefront: boolean): void {
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
        checkStorageAccess();

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
        const { handledRequestCount } = (await this.getInfo()) ?? {};
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
        checkStorageAccess();

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
    private async _downloadListOfUrls(options: { url: string; urlRegExp?: RegExp; proxyUrl?: string }): Promise<
        string[]
    > {
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
    static async open(queueIdOrName?: string | null, options: StorageManagerOptions = {}): Promise<RequestProvider> {
        checkStorageAccess();

        ow(queueIdOrName, ow.optional.any(ow.string, ow.null));
        ow(
            options,
            ow.object.exactShape({
                config: ow.optional.object.instanceOf(Configuration),
                storageClient: ow.optional.object,
                proxyConfiguration: ow.optional.object,
            }),
        );

        options.config ??= Configuration.getGlobalConfig();
        options.storageClient ??= options.config.getStorageClient();

        await purgeDefaultStorages({ onlyPurgeOnce: true, client: options.storageClient, config: options.config });

        const manager = StorageManager.getManager(this as typeof BuiltRequestProvider, options.config);
        const queue = await manager.openStorage(queueIdOrName, options.storageClient);
        queue.proxyConfiguration = options.proxyConfiguration;

        const queueInfo = await queue.client.get();

        queue.initialCount = queueInfo?.totalRequestCount ?? 0;
        queue.initialHandledCount = queueInfo?.handledRequestCount ?? 0;

        return queue;
    }
}

declare class BuiltRequestProvider extends RequestProvider {
    override fetchNextRequest<T extends Dictionary = Dictionary>(
        options?: RequestOptions<Dictionary> | undefined,
    ): Promise<Request<T> | null>;

    protected override ensureHeadIsNonEmpty(): Promise<void>;

    override isFinished(): Promise<boolean>;
}

interface RequestLruItem {
    uniqueKey: string;
    isHandled: boolean;
    id: string;
    hydrated: Request | null;
    lockExpiresAt: number | null;
    forefront: boolean;
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

/**
 * @deprecated Use {@apilink RequestProviderOptions} instead.
 */
export interface RequestQueueOptions extends RequestProviderOptions {}

/**
 * @internal
 */
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

export interface RequestQueueOperationOptions {
    forefront?: boolean;
    cache?: boolean;
}