import { cryptoRandomObjectId } from '@apify/utilities';
import type { BatchAddRequestsResult, Dictionary, QueueOperationInfo, RequestQueueClient, RequestQueueInfo, StorageClient } from '@crawlee/types';
import { ListDictionary, LruCache } from '@apify/datastructures';
import ow from 'ow';
import type { DownloadListOfUrlsOptions } from '@crawlee/utils';
import { downloadListOfUrls, sleep } from '@crawlee/utils';
import crypto from 'node:crypto';
import { REQUEST_QUEUE_HEAD_MAX_LIMIT } from '@apify/consts';
import { log } from '../log';
import type { ProxyConfiguration } from '../proxy_configuration';
import { Configuration } from '../configuration';
import { Request } from '../request';
import type { InternalSource, RequestOptions, Source } from '../request';
import type { StorageManagerOptions } from './storage_manager';
import { StorageManager } from './storage_manager';
import { purgeDefaultStorages } from './utils';

// Double the limit of RequestQueue v1 (1_000_000) as we also store keyed by request.id, not just from uniqueKey
const MAX_CACHED_REQUESTS = 2_000_000;

/**
 * When prolonging a lock, we do it for a minute from Date.now()
 */
const PROLONG_LOCK_BY_SECS = 60;

/**
 * This number must be large enough so that processing of all these requests cannot be done in
 * a time lower than expected maximum latency of DynamoDB, but low enough not to waste too much memory.
 * @internal
 */
const RECENTLY_HANDLED_CACHE_SIZE = 1000;

interface RequestLruItem {
    uniqueKey: string;
    isHandled: boolean;
    id: string;
    hydrated: Request | null;
    lockExpiresAt: number | null;
}

export interface RequestQueueV2OperationOptions {
    /**
     * If set to `true`:
     *   - while adding the request to the queue: the request will be added to the foremost position in the queue.
     *   - while reclaiming the request: the request will be placed to the beginning of the queue, so that it's returned
     *   in the next call to {@apilink RequestQueueV2.fetchNextRequest}.
     * By default, it's put to the end of the queue.
     * @default false
     */
    forefront?: boolean;
}

/**
 * @internal
 */
export interface RequestQueueV2OperationInfo extends QueueOperationInfo {
    uniqueKey: string;
}

/**
 * Helper function that creates ID from uniqueKey for local emulation of request queue.
 * It's also used for local cache of remote request queue.
 *
 * This function may not exactly match how requestId is created server side.
 * So we never pass requestId created by this to server and use it only for local cache.
 *
 * @internal
 */
export function getRequestId(uniqueKey: string) {
    const str = crypto
        .createHash('sha256')
        .update(uniqueKey)
        .digest('base64')
        .replace(/[+/=]/g, '');

    return str.slice(0, 15);
}

/**
 * When requesting queue head we always fetch requestsInProgressCount * QUERY_HEAD_BUFFER number of requests.
 * @internal
 */
export const QUERY_HEAD_MIN_LENGTH = 100;

/**
 * Indicates how long it usually takes for the underlying storage to propagate all writes
 * to be available to subsequent reads.
 * @internal
 */
export const STORAGE_CONSISTENCY_DELAY_MILLIS = 3000;

/** @internal */
export const QUERY_HEAD_BUFFER = 3;

/**
 * If queue was modified (request added/updated/deleted) before more than API_PROCESSED_REQUESTS_DELAY_MILLIS
 * then we assume the get head operation to be consistent.
 * @internal
 */
export const API_PROCESSED_REQUESTS_DELAY_MILLIS = 10_000;

/**
 * How many times we try to get queue head with queueModifiedAt older than API_PROCESSED_REQUESTS_DELAY_MILLIS.
 * @internal
 */
export const MAX_QUERIES_FOR_CONSISTENCY = 6;

export class RequestQueueV2 {
    log = log.child({ prefix: 'RequestQueueV2' });
    id: string;
    name?: string;
    timeoutSecs = 30;
    clientKey = cryptoRandomObjectId();
    client: RequestQueueClient;
    private proxyConfiguration?: ProxyConfiguration;

    /*
    We need:

    - queue for all requests, using ListDictionary
        - When we get a request from the head, we:
            - hydrate it if for some reason it's not hydrated
            - enqueue the next request to be hydrated, storing it in _hydratingRequestPromise
            - prolong the lock on said request by another minute
        - When we add an/many requests, we add them to the queue, and immediately trigger a hydrate for the first one

    - set of all requests in progress, using ids (should be enough)
    - lru of recently handled requests
    - lru of all requests that have been added to the queue

    Steps:
        - list head and lock it all for PROLONG_LOCK_BY_MILLIS (stored in _listHeadAndLockPromise, so subsequent calls will NOT trigger multiples)
        - add the requests to the queue and requestsCache
        - hydrate the first one

    Decisions:
        - do we want to trigger another queue head fetch when we approach the end of the queue?
        - is this whole consistency thing still needed?
    */

    private queueHeadIds = new ListDictionary<string>();
    private requestCache = new LruCache<RequestLruItem>({ maxLength: MAX_CACHED_REQUESTS });
    private requestIdsInProgress = new Set<string>();
    private recentlyHandledRequestsCache = new LruCache<boolean>({ maxLength: RECENTLY_HANDLED_CACHE_SIZE });

    lastActivity = new Date();
    internalTimeoutMillis = 5 * 60_000; // defaults to 5 minutes, will be overridden by BasicCrawler

    // We can trust these numbers only in a case that queue is used by a single client.
    // This information is returned by getHead() under the hadMultipleClients property.
    assumedTotalCount = 0;
    assumedHandledCount = 0;

    private _listHeadAndLockPromise: Promise<boolean> | null = null;
    private _hydratingRequestPromise: Promise<any> | null = null;

    constructor(options: RequestQueueV2Options, readonly config = Configuration.getGlobalConfig()) {
        this.id = options.id;
        this.name = options.name;
        this.client = options.client.requestQueue(this.id, {
            clientKey: this.clientKey,
            timeoutSecs: this.timeoutSecs,
        });
        this.proxyConfiguration = options.proxyConfiguration;
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
    async addRequest(requestLike: Source, options: RequestQueueV2OperationOptions = {}): Promise<RequestQueueV2OperationInfo> {
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
                wasAlreadyPresent: true, // We may assume that if request is in local cache then also the information if the
                // request was already handled is there because just one client should be using one queue.
                wasAlreadyHandled: cachedInfo.isHandled,
                requestId: cachedInfo.id,
                uniqueKey: cachedInfo.uniqueKey,
            };
        }

        const queueOperationInfo = await this.client.addRequest(request, { forefront }) as RequestQueueV2OperationInfo;
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
     * @internal wraps public utility for mocking purposes
     */
    private async _downloadListOfUrls(options: DownloadListOfUrlsOptions): Promise<string[]> {
        return downloadListOfUrls(options);
    }

    /**
     * Adds all fetched requests from a URL from a remote resource.
     */
    protected async _addFetchedRequests(source: InternalSource, fetchedRequests: RequestOptions[], options: RequestQueueV2OperationOptions) {
        const { requestsFromUrl, regex } = source;
        const { processedRequests } = await this.addRequests(fetchedRequests, options);

        this.log.info('Fetched and loaded Requests from a remote resource.', {
            requestsFromUrl,
            regex,
            fetchedCount: fetchedRequests.length,
            importedCount: processedRequests.length,
            duplicateCount: fetchedRequests.length - processedRequests.length,
            sample: JSON.stringify(fetchedRequests.slice(0, 5)),
        });

        return processedRequests;
    }

    /**
     * Caches information about request to beware of unneeded addRequest() calls.
     */
    protected _cacheRequest(cacheKey: string, queueOperationInfo: RequestQueueV2OperationInfo): void {
        this.requestCache.add(cacheKey, {
            id: queueOperationInfo.requestId,
            isHandled: queueOperationInfo.wasAlreadyHandled,
            uniqueKey: queueOperationInfo.uniqueKey,
            hydrated: null,
            lockExpiresAt: null,
        });

        this.requestCache.add(queueOperationInfo.requestId, {
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
        options: RequestQueueV2OperationOptions = {},
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
    async fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null> {
        await this.ensureHeadIsNonEmpty();
        // Wait for the currently hydrating request to finish, as it might be the one we return
        await this._hydratingRequestPromise;

        const nextRequestId = this.queueHeadIds.removeFirst();

        // We are likely done at this point.
        if (!nextRequestId) {
            return null;
        }

        // Schedule the next hydration in the background (if there is any request left in the queue)
        // This should hopefully make the next request available faster.
        const nextNextId = this.queueHeadIds.getFirst();

        if (nextNextId) {
            this._hydratingRequestPromise = this.getOrHydrateRequest(nextNextId).finally(() => {
                this._hydratingRequestPromise = null;
            });
        }

        // This should never happen, but...
        if (this.requestIdsInProgress.has(nextRequestId) || this.recentlyHandledRequestsCache.get(nextRequestId)) {
            this.log.warning('Queue head returned a request that is already in progress?!', {
                nextRequestId,
                inProgress: this.requestIdsInProgress.has(nextRequestId),
                recentlyHandled: !!this.recentlyHandledRequestsCache.get(nextRequestId),
            });
            return null;
        }

        this.requestIdsInProgress.add(nextRequestId);
        this.lastActivity = new Date();

        const request = await this.getOrHydrateRequest(nextRequestId);

        // NOTE: It can happen that the queue head index is inconsistent with the main queue table. This can occur in two situations:

        // 1) Queue head index is ahead of the main table and the request is not present in the main table yet (i.e. getRequest() returned null).
        //    In this case, keep the request marked as in progress for a short while,
        //    so that isFinished() doesn't return true and _ensureHeadIsNonEmpty() doesn't not load the request
        //    into the queueHeadDict straight again. After the interval expires, fetchNextRequest()
        //    will try to fetch this request again, until it eventually appears in the main table.
        if (!request) {
            this.log.debug('Cannot find a request from the beginning of queue, will be retried later', { nextRequestId });

            setTimeout(() => {
                this.requestIdsInProgress.delete(nextRequestId);
            }, STORAGE_CONSISTENCY_DELAY_MILLIS);

            return null;
        }

        // 2) Queue head index is behind the main table and the underlying request was already handled
        //    (by some other client, since we keep the track of handled requests in recentlyHandled dictionary).
        //    We just add the request to the recentlyHandled dictionary so that next call to _ensureHeadIsNonEmpty()
        //    will not put the request again to queueHeadDict.
        if (request.handledAt) {
            this.log.debug('Request fetched from the beginning of queue was already handled', { nextRequestId });
            this.recentlyHandledRequestsCache.add(nextRequestId, true);
            return null;
        }

        return request;
    }

    private async ensureHeadIsNonEmpty() {
        if (this.queueHeadIds.length() > 0) {
            return;
        }

        this._listHeadAndLockPromise ??= this._listHeadAndLock().finally(() => {
            this._listHeadAndLockPromise = null;
        });

        await this._listHeadAndLockPromise;
    }

    private async _listHeadAndLock(
        ensureConsistency = false,
        limit = Math.max(this.inProgressCount() * QUERY_HEAD_BUFFER, QUERY_HEAD_MIN_LENGTH),
        iteration = 0,
    ): Promise<boolean> {
        const queryStartedAt = Date.now();

        const headData = await this.client.listAndLockHead({ limit, lockSecs: PROLONG_LOCK_BY_SECS });

        const queueModifiedAt = headData.queueModifiedAt.getTime();

        // Cache the first request, if it exists, and trigger a hydration for it
        const firstRequest = headData.items.shift();

        if (firstRequest) {
            this.queueHeadIds.add(firstRequest.id, firstRequest.id, false);
            this._cacheRequest(getRequestId(firstRequest.uniqueKey), {
                requestId: firstRequest.id,
                uniqueKey: firstRequest.uniqueKey,
                wasAlreadyPresent: true,
                wasAlreadyHandled: false,
            });

            // Await current hydration, if any, to not lose it
            if (this._hydratingRequestPromise) {
                await this._hydratingRequestPromise;
            }

            this._hydratingRequestPromise = this.getOrHydrateRequest(firstRequest.id).finally(() => {
                this._hydratingRequestPromise = null;
            });
        }

        // 1. Cache the queue head
        for (const { id, uniqueKey } of headData.items) {
            // Queue head index might be behind the main table, so ensure we don't recycle requests
            if (!id || !uniqueKey || this.requestIdsInProgress.has(id) || this.recentlyHandledRequestsCache.get(id)) {
                continue;
            }

            this.queueHeadIds.add(id, id, false);
            this._cacheRequest(getRequestId(uniqueKey), {
                requestId: id,
                uniqueKey,
                wasAlreadyPresent: true,
                wasAlreadyHandled: false,
            });
        }

        // TODO: RQV1 had this logic. This is reimplemented here, but I am not sure if it is needed anymore, since we also lock requests

        const wasLimitReached = headData.items.length >= limit;

        if (limit >= REQUEST_QUEUE_HEAD_MAX_LIMIT) {
            this.log.warning(`Reached the maximum number of requests in progress: ${REQUEST_QUEUE_HEAD_MAX_LIMIT}.`);
        }

        const shouldRepeatWithHigherLimit = this.queueHeadIds.length() === 0
            && wasLimitReached
            && limit < REQUEST_QUEUE_HEAD_MAX_LIMIT;

        // - queueModifiedAt is older than queryStartedAt by at least API_PROCESSED_REQUESTS_DELAY_MILLIS
        // - hadMultipleClients=false and this.assumedTotalCount<=this.assumedHandledCount
        const isDatabaseConsistent = queryStartedAt - queueModifiedAt >= API_PROCESSED_REQUESTS_DELAY_MILLIS;
        const isLocallyConsistent = !headData.hadMultipleClients && this.assumedTotalCount <= this.assumedHandledCount;
        // Consistent information from one source is enough to consider request queue finished.
        const shouldRepeatForConsistency = ensureConsistency && !isDatabaseConsistent && !isLocallyConsistent;

        // If both are false then head is consistent and we may exit.
        if (!shouldRepeatWithHigherLimit && !shouldRepeatForConsistency) {
            return true;
        }

        // If we are querying for consistency then we limit the number of queries to MAX_QUERIES_FOR_CONSISTENCY.
        // If this is reached then we return false so that empty() and finished() returns possibly false negative.
        if (!shouldRepeatWithHigherLimit && iteration > MAX_QUERIES_FOR_CONSISTENCY) {
            return false;
        }

        const nextLimit = shouldRepeatWithHigherLimit ? Math.round(limit * 1.5) : limit;

        if (shouldRepeatForConsistency) {
            const delayMillis = API_PROCESSED_REQUESTS_DELAY_MILLIS - (Date.now() - queueModifiedAt);
            this.log.info(`Waiting for ${delayMillis}ms before considering the queue as finished to ensure that the data is consistent.`);
            await sleep(delayMillis);
        }

        return this._listHeadAndLock(ensureConsistency, nextLimit, iteration + 1);
    }

    private async getOrHydrateRequest<T extends Dictionary = Dictionary>(requestId: string): Promise<Request<T> | null> {
        const cachedEntry = this.requestCache.get(requestId);

        if (!cachedEntry) {
            // 2.1. Attempt to prolong the request lock to see if we still own the request
            const prolongResult = await this._prolongRequestLock(requestId);

            if (!prolongResult) {
                return null;
            }

            // 2.1.1. If successful, hydrate the request and return it
            const hydratedRequest = await this.getRequest(requestId);

            // Queue head index is ahead of the main table and the request is not present in the main table yet (i.e. getRequest() returned null).
            if (!hydratedRequest) {
                // Remove the lock from the request for now, so that it can be picked up later
                // This may/may not succeed, but that's fine
                try {
                    await this.client.deleteRequestLock(requestId);
                } catch {
                // Ignore
                }

                return null;
            }

            this.requestCache.add(requestId, {
                id: requestId,
                uniqueKey: hydratedRequest.uniqueKey,
                hydrated: hydratedRequest,
                isHandled: hydratedRequest.handledAt !== null,
                lockExpiresAt: prolongResult.getTime(),
            });

            return hydratedRequest;
        }

        // 1.1. If hydrated, prolong the lock more and return it
        if (cachedEntry.hydrated) {
            // 1.1.1. If the lock expired on the hydrated requests, try to prolong. If we fail, we lost the request
            if (cachedEntry.lockExpiresAt && cachedEntry.lockExpiresAt < Date.now()) {
                const prolonged = await this._prolongRequestLock(cachedEntry.id);

                if (!prolonged) {
                    return null;
                }

                cachedEntry.lockExpiresAt = prolonged.getTime();
            }

            return cachedEntry.hydrated;
        }

        // 1.2. If not hydrated, try to prolong the lock first (to ensure we keep it in our queue), hydrate and return it
        const prolonged = await this._prolongRequestLock(cachedEntry.id);

        if (!prolonged) {
            return null;
        }

        // This might still return null if the queue head is inconsistent with the main queue table.
        const hydratedRequest = await this.getRequest(cachedEntry.id);

        cachedEntry.hydrated = hydratedRequest;

        // Queue head index is ahead of the main table and the request is not present in the main table yet (i.e. getRequest() returned null).
        if (!hydratedRequest) {
            // Remove the lock from the request for now, so that it can be picked up later
            // This may/may not succeed, but that's fine
            try {
                await this.client.deleteRequestLock(cachedEntry.id);
            } catch {
                // Ignore
            }

            return null;
        }

        return hydratedRequest;
    }

    private async _prolongRequestLock(requestId: string): Promise<Date | null> {
        try {
            const res = await this.client.prolongRequestLock(requestId, { lockSecs: PROLONG_LOCK_BY_SECS });
            return res.lockExpiresAt;
        } catch (err) {
            // Most likely we do not own the lock anymore
            this.log.debug(`Failed to prolong lock for cached request ${requestId}, possibly lost the lock`, {
                error: err,
                requestId,
            });

            return null;
        }
    }

    /**
     * Marks a request that was previously returned by the
     * {@apilink RequestQueue.fetchNextRequest}
     * function as handled after successful processing.
     * Handled requests will never again be returned by the `fetchNextRequest` function.
     */
    async markRequestHandled(request: Request): Promise<RequestQueueV2OperationInfo | null> {
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
        const queueOperationInfo = await this.client.updateRequest({ ...request, handledAt }) as RequestQueueV2OperationInfo;
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
    async reclaimRequest(request: Request, options: RequestQueueV2OperationOptions = {}): Promise<RequestQueueV2OperationInfo | null> {
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
        const queueOperationInfo = await this.client.updateRequest(request, { forefront }) as RequestQueueV2OperationInfo;
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
            const message = `The request queue seems to be stuck for ${this.internalTimeoutMillis / 1000}s, resetting internal state.`;
            this.log.warning(message, { inProgress: [...this.requestIdsInProgress] });
            this._reset();
        }

        if (this.queueHeadIds.length() > 0 || this.inProgressCount() > 0) return false;

        const isHeadConsistent = await this._listHeadAndLock(true);
        return isHeadConsistent && this.queueHeadIds.length() === 0 && this.inProgressCount() === 0;
    }

    private _reset() {
        this.queueHeadIds.clear();
        this._listHeadAndLockPromise = null;
        this.requestIdsInProgress.clear();
        this.recentlyHandledRequestsCache.clear();
        this.assumedTotalCount = 0;
        this.assumedHandledCount = 0;
        this.requestCache.clear();
        this.lastActivity = new Date();
    }

    /**
     * Removes the queue either from the Apify Cloud storage or from the local database,
     * depending on the mode of operation.
     */
    async drop(): Promise<void> {
        await this.client.delete();
        const manager = StorageManager.getManager(RequestQueueV2, this.config);
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
    static async open(queueIdOrName?: string | null, options: StorageManagerOptions = {}): Promise<RequestQueueV2> {
        ow(queueIdOrName, ow.optional.any(ow.string, ow.null));
        ow(options, ow.object.exactShape({
            config: ow.optional.object.instanceOf(Configuration),
            storageClient: ow.optional.object,
            proxyConfiguration: ow.optional.object,
        }));

        options.config ??= Configuration.getGlobalConfig();
        options.storageClient ??= options.config.getStorageClient();

        await purgeDefaultStorages(options.config, options.storageClient);

        const manager = StorageManager.getManager(this, options.config);
        const queue = await manager.openStorage(queueIdOrName, options.storageClient);
        queue.proxyConfiguration = options.proxyConfiguration;

        return queue;
    }
}

export interface RequestQueueV2Options {
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
