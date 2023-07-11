import { cryptoRandomObjectId } from '@apify/utilities';
import type { BatchAddRequestsResult, Dictionary, QueueOperationInfo, RequestQueueClient, StorageClient } from '@crawlee/types';
import { ListDictionary, LruCache } from '@apify/datastructures';
import ow from 'ow';
import type { DownloadListOfUrlsOptions } from '@crawlee/utils';
import { downloadListOfUrls } from '@crawlee/utils';
import crypto from 'node:crypto';
import { log } from '../log';
import type { ProxyConfiguration } from '../proxy_configuration';
import { Configuration } from '../configuration';
import { Request } from '../request';
import type { InternalSource, RequestOptions, Source } from '../request';

const MAX_CACHED_REQUESTS = 1_000_000;

/**
 * When prolonging a lock, we do it for a minute from Date.now()
 */
const PROLONG_LOCK_BY_MILLIS = 60_000;

/**
 * This number must be large enough so that processing of all these requests cannot be done in
 * a time lower than expected maximum latency of DynamoDB, but low enough not to waste too much memory.
 * @internal
 */
const RECENTLY_HANDLED_CACHE_SIZE = 1000;

interface RequestLruItem {
    uniqueKey: string;
    wasAlreadyHandled: boolean;
    isHandled: boolean;
    id: string;
    hydrated: Request | null;
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

    private _listHeadAndLockPromise: Promise<void> | null = null;
    private _hydrateRequestPromise: Promise<void> | null = null;

    protected constructor(options: RequestQueueV2Options, readonly config = Configuration.getGlobalConfig()) {
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
            wasAlreadyHandled: queueOperationInfo.wasAlreadyHandled,
            hydrated: null,
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
