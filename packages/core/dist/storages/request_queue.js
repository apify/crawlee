"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestQueue = exports.getRequestId = exports.STORAGE_CONSISTENCY_DELAY_MILLIS = exports.MAX_QUERIES_FOR_CONSISTENCY = exports.API_PROCESSED_REQUESTS_DELAY_MILLIS = exports.QUERY_HEAD_BUFFER = exports.QUERY_HEAD_MIN_LENGTH = void 0;
const tslib_1 = require("tslib");
const consts_1 = require("@apify/consts");
const datastructures_1 = require("@apify/datastructures");
const utilities_1 = require("@apify/utilities");
const node_crypto_1 = tslib_1.__importDefault(require("node:crypto"));
const promises_1 = require("node:timers/promises");
const ow_1 = tslib_1.__importDefault(require("ow"));
const storage_manager_1 = require("./storage_manager");
const log_1 = require("../log");
const request_1 = require("../request");
const configuration_1 = require("../configuration");
const utils_1 = require("./utils");
const MAX_CACHED_REQUESTS = 1000000;
/**
 * When requesting queue head we always fetch requestsInProgressCount * QUERY_HEAD_BUFFER number of requests.
 * @internal
 */
exports.QUERY_HEAD_MIN_LENGTH = 100;
/** @internal */
exports.QUERY_HEAD_BUFFER = 3;
/**
 * If queue was modified (request added/updated/deleted) before more than API_PROCESSED_REQUESTS_DELAY_MILLIS
 * then we assume the get head operation to be consistent.
 * @internal
 */
exports.API_PROCESSED_REQUESTS_DELAY_MILLIS = 10000;
/**
 * How many times we try to get queue head with queueModifiedAt older than API_PROCESSED_REQUESTS_DELAY_MILLIS.
 * @internal
 */
exports.MAX_QUERIES_FOR_CONSISTENCY = 6;
/**
 * This number must be large enough so that processing of all these requests cannot be done in
 * a time lower than expected maximum latency of DynamoDB, but low enough not to waste too much memory.
 * @internal
 */
const RECENTLY_HANDLED_CACHE_SIZE = 1000;
/**
 * Indicates how long it usually takes for the underlying storage to propagate all writes
 * to be available to subsequent reads.
 * @internal
 */
exports.STORAGE_CONSISTENCY_DELAY_MILLIS = 3000;
/**
 * Helper function that creates ID from uniqueKey for local emulation of request queue.
 * It's also used for local cache of remote request queue.
 *
 * This function may not exactly match how requestId is created server side.
 * So we never pass requestId created by this to server and use it only for local cache.
 *
 * @internal
 */
function getRequestId(uniqueKey) {
    const str = node_crypto_1.default
        .createHash('sha256')
        .update(uniqueKey)
        .digest('base64')
        .replace(/[+/=]/g, '');
    return str.substr(0, 15);
}
exports.getRequestId = getRequestId;
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
 * `RequestQueue` stores its data either on local disk or in the Apify Cloud,
 * depending on whether the `APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN` environment variable is set.
 *
 * If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the queue data is stored in
 * that directory in an SQLite database file.
 *
 * If the `APIFY_TOKEN` environment variable is set but `APIFY_LOCAL_STORAGE_DIR` is not, the data is stored in the
 * [Apify Request Queue](https://docs.apify.com/storage/request-queue)
 * cloud storage. Note that you can force usage of the cloud storage also by passing the `forceCloud`
 * option to {@apilink RequestQueue.open} function,
 * even if the `APIFY_LOCAL_STORAGE_DIR` variable is set.
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
class RequestQueue {
    /**
     * @internal
     */
    constructor(options, config = configuration_1.Configuration.getGlobalConfig()) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        Object.defineProperty(this, "log", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: log_1.log.child({ prefix: 'RequestQueue' })
        });
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "timeoutSecs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 30
        });
        Object.defineProperty(this, "clientKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, utilities_1.cryptoRandomObjectId)()
        });
        Object.defineProperty(this, "client", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * Contains a cached list of request IDs from the head of the queue,
         * as obtained in the last query. Both key and value is the request ID.
         * Need to apply a type here to the generated TS types don't try to use types-apify
         */
        Object.defineProperty(this, "queueHeadDict", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new datastructures_1.ListDictionary()
        });
        Object.defineProperty(this, "queryQueueHeadPromise", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        // A set of all request IDs that are currently being handled,
        // i.e. which were returned by fetchNextRequest() but not markRequestHandled()
        Object.defineProperty(this, "inProgress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        // To track whether the queue gets stuck, and we need to reset it
        // `lastActivity` tracks the time when we either added, processed or reclaimed a request,
        // or when we add new request to in-progress cache
        Object.defineProperty(this, "lastActivity", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Date()
        });
        Object.defineProperty(this, "internalTimeoutMillis", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 5 * 60e3
        }); // defaults to 5 minutes, will be overridden by BasicCrawler
        // Contains a list of recently handled requests. It is used to avoid inconsistencies
        // caused by delays in the underlying DynamoDB storage.
        // Keys are request IDs, values are true.
        Object.defineProperty(this, "recentlyHandled", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new datastructures_1.LruCache({ maxLength: RECENTLY_HANDLED_CACHE_SIZE })
        });
        // We can trust these numbers only in a case that queue is used by a single client.
        // This information is returned by getHead() under the hadMultipleClients property.
        Object.defineProperty(this, "assumedTotalCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "assumedHandledCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        // Caching requests to avoid redundant addRequest() calls.
        // Key is computed using getRequestId() and value is { id, isHandled }.
        Object.defineProperty(this, "requestsCache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new datastructures_1.LruCache({ maxLength: MAX_CACHED_REQUESTS })
        });
        this.id = options.id;
        this.name = options.name;
        this.client = options.client.requestQueue(this.id, {
            clientKey: this.clientKey,
            timeoutSecs: this.timeoutSecs,
        });
    }
    /**
     * @ignore
     */
    inProgressCount() {
        return this.inProgress.size;
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
    async addRequest(requestLike, options = {}) {
        (0, ow_1.default)(requestLike, ow_1.default.object.partialShape({
            url: ow_1.default.string,
            id: ow_1.default.undefined,
        }));
        (0, ow_1.default)(options, ow_1.default.object.exactShape({
            forefront: ow_1.default.optional.boolean,
        }));
        this.lastActivity = new Date();
        const { forefront = false } = options;
        const request = requestLike instanceof request_1.Request
            ? requestLike
            : new request_1.Request(requestLike);
        const cacheKey = getRequestId(request.uniqueKey);
        const cachedInfo = this.requestsCache.get(cacheKey);
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
        const queueOperationInfo = await this.client.addRequest(request, { forefront });
        queueOperationInfo.uniqueKey = request.uniqueKey;
        const { requestId, wasAlreadyPresent } = queueOperationInfo;
        this._cacheRequest(cacheKey, queueOperationInfo);
        if (!wasAlreadyPresent && !this.inProgress.has(requestId) && !this.recentlyHandled.get(requestId)) {
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
    async addRequests(requestsLike, options = {}) {
        (0, ow_1.default)(requestsLike, ow_1.default.array.ofType(ow_1.default.object.partialShape({
            url: ow_1.default.string,
            id: ow_1.default.undefined,
        })));
        (0, ow_1.default)(options, ow_1.default.object.exactShape({
            forefront: ow_1.default.optional.boolean,
        }));
        const { forefront = false } = options;
        const uniqueKeyToCacheKey = new Map();
        const getCachedRequestId = (uniqueKey) => {
            const cached = uniqueKeyToCacheKey.get(uniqueKey);
            if (cached)
                return cached;
            const newCacheKey = getRequestId(uniqueKey);
            uniqueKeyToCacheKey.set(uniqueKey, newCacheKey);
            return newCacheKey;
        };
        const results = {
            processedRequests: [],
            unprocessedRequests: [],
        };
        const requests = requestsLike.map((requestLike) => {
            return requestLike instanceof request_1.Request
                ? requestLike
                : new request_1.Request(requestLike);
        });
        const requestsToAdd = new Map();
        for (const request of requests) {
            const cacheKey = getCachedRequestId(request.uniqueKey);
            const cachedInfo = this.requestsCache.get(cacheKey);
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
            }
            else if (!requestsToAdd.has(request.uniqueKey)) {
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
            if (!wasAlreadyPresent && !this.inProgress.has(requestId) && !this.recentlyHandled.get(requestId)) {
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
    async getRequest(id) {
        (0, ow_1.default)(id, ow_1.default.string);
        const requestOptions = await this.client.getRequest(id);
        if (!requestOptions)
            return null;
        return new request_1.Request(requestOptions);
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
    async fetchNextRequest() {
        await this._ensureHeadIsNonEmpty();
        const nextRequestId = this.queueHeadDict.removeFirst();
        // We are likely done at this point.
        if (!nextRequestId)
            return null;
        // This should never happen, but...
        if (this.inProgress.has(nextRequestId) || this.recentlyHandled.get(nextRequestId)) {
            this.log.warning('Queue head returned a request that is already in progress?!', {
                nextRequestId,
                inProgress: this.inProgress.has(nextRequestId),
                recentlyHandled: !!this.recentlyHandled.get(nextRequestId),
            });
            return null;
        }
        this.inProgress.add(nextRequestId);
        this.lastActivity = new Date();
        let request;
        try {
            request = await this.getRequest(nextRequestId);
        }
        catch (e) {
            // On error, remove the request from in progress, otherwise it would be there forever
            this.inProgress.delete(nextRequestId);
            throw e;
        }
        // NOTE: It can happen that the queue head index is inconsistent with the main queue table. This can occur in two situations:
        // 1) Queue head index is ahead of the main table and the request is not present in the main table yet (i.e. getRequest() returned null).
        //    In this case, keep the request marked as in progress for a short while,
        //    so that isFinished() doesn't return true and _ensureHeadIsNonEmpty() doesn't not load the request
        //    into the queueHeadDict straight again. After the interval expires, fetchNextRequest()
        //    will try to fetch this request again, until it eventually appears in the main table.
        if (!request) {
            this.log.debug('Cannot find a request from the beginning of queue, will be retried later', { nextRequestId });
            setTimeout(() => {
                this.inProgress.delete(nextRequestId);
            }, exports.STORAGE_CONSISTENCY_DELAY_MILLIS);
            return null;
        }
        // 2) Queue head index is behind the main table and the underlying request was already handled
        //    (by some other client, since we keep the track of handled requests in recentlyHandled dictionary).
        //    We just add the request to the recentlyHandled dictionary so that next call to _ensureHeadIsNonEmpty()
        //    will not put the request again to queueHeadDict.
        if (request.handledAt) {
            this.log.debug('Request fetched from the beginning of queue was already handled', { nextRequestId });
            this.recentlyHandled.add(nextRequestId, true);
            return null;
        }
        return request;
    }
    /**
     * Marks a request that was previously returned by the
     * {@apilink RequestQueue.fetchNextRequest}
     * function as handled after successful processing.
     * Handled requests will never again be returned by the `fetchNextRequest` function.
     */
    async markRequestHandled(request) {
        this.lastActivity = new Date();
        (0, ow_1.default)(request, ow_1.default.object.partialShape({
            id: ow_1.default.string,
            uniqueKey: ow_1.default.string,
            handledAt: ow_1.default.optional.string,
        }));
        if (!this.inProgress.has(request.id)) {
            this.log.debug(`Cannot mark request ${request.id} as handled, because it is not in progress!`, { requestId: request.id });
            return null;
        }
        const handledAt = request.handledAt ?? new Date().toISOString();
        const queueOperationInfo = await this.client.updateRequest({ ...request, handledAt });
        request.handledAt = handledAt;
        queueOperationInfo.uniqueKey = request.uniqueKey;
        this.inProgress.delete(request.id);
        this.recentlyHandled.add(request.id, true);
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
    async reclaimRequest(request, options = {}) {
        this.lastActivity = new Date();
        (0, ow_1.default)(request, ow_1.default.object.partialShape({
            id: ow_1.default.string,
            uniqueKey: ow_1.default.string,
        }));
        (0, ow_1.default)(options, ow_1.default.object.exactShape({
            forefront: ow_1.default.optional.boolean,
        }));
        const { forefront = false } = options;
        if (!this.inProgress.has(request.id)) {
            this.log.debug(`Cannot reclaim request ${request.id}, because it is not in progress!`, { requestId: request.id });
            return null;
        }
        // TODO: If request hasn't been changed since the last getRequest(),
        //   we don't need to call updateRequest() and thus improve performance.
        const queueOperationInfo = await this.client.updateRequest(request, { forefront });
        queueOperationInfo.uniqueKey = request.uniqueKey;
        this._cacheRequest(getRequestId(request.uniqueKey), queueOperationInfo);
        // Wait a little to increase a chance that the next call to fetchNextRequest() will return the request with updated data.
        // This is to compensate for the limitation of DynamoDB, where writes might not be immediately visible to subsequent reads.
        setTimeout(() => {
            if (!this.inProgress.has(request.id)) {
                this.log.debug('The request is no longer marked as in progress in the queue?!', { requestId: request.id });
                return;
            }
            this.inProgress.delete(request.id);
            // Performance optimization: add request straight to head if possible
            this._maybeAddRequestToQueueHead(request.id, forefront);
        }, exports.STORAGE_CONSISTENCY_DELAY_MILLIS);
        return queueOperationInfo;
    }
    /**
     * Resolves to `true` if the next call to {@apilink RequestQueue.fetchNextRequest}
     * would return `null`, otherwise it resolves to `false`.
     * Note that even if the queue is empty, there might be some pending requests currently being processed.
     * If you need to ensure that there is no activity in the queue, use {@apilink RequestQueue.isFinished}.
     */
    async isEmpty() {
        await this._ensureHeadIsNonEmpty();
        return this.queueHeadDict.length() === 0;
    }
    /**
     * Resolves to `true` if all requests were already handled and there are no more left.
     * Due to the nature of distributed storage used by the queue,
     * the function might occasionally return a false negative,
     * but it will never return a false positive.
     */
    async isFinished() {
        if ((Date.now() - +this.lastActivity) > this.internalTimeoutMillis) {
            const message = `The request queue seems to be stuck for ${this.internalTimeoutMillis / 1e3}s, resetting internal state.`;
            this.log.warning(message, { inProgress: [...this.inProgress] });
            this._reset();
        }
        if (this.queueHeadDict.length() > 0 || this.inProgressCount() > 0)
            return false;
        const isHeadConsistent = await this._ensureHeadIsNonEmpty(true);
        return isHeadConsistent && this.queueHeadDict.length() === 0 && this.inProgressCount() === 0;
    }
    _reset() {
        this.queueHeadDict.clear();
        this.queryQueueHeadPromise = null;
        this.inProgress.clear();
        this.recentlyHandled.clear();
        this.assumedTotalCount = 0;
        this.assumedHandledCount = 0;
        this.requestsCache.clear();
        this.lastActivity = new Date();
    }
    /**
     * Caches information about request to beware of unneeded addRequest() calls.
     */
    _cacheRequest(cacheKey, queueOperationInfo) {
        this.requestsCache.add(cacheKey, {
            id: queueOperationInfo.requestId,
            isHandled: queueOperationInfo.wasAlreadyHandled,
            uniqueKey: queueOperationInfo.uniqueKey,
            wasAlreadyHandled: queueOperationInfo.wasAlreadyHandled,
        });
    }
    /**
     * We always request more items than is in progress to ensure that something falls into head.
     *
     * @param [ensureConsistency] If true then query for queue head is retried until queueModifiedAt
     *   is older than queryStartedAt by at least API_PROCESSED_REQUESTS_DELAY_MILLIS to ensure that queue
     *   head is consistent.
     * @default false
     * @param [limit] How many queue head items will be fetched.
     * @param [iteration] Used when this function is called recursively to limit the recursion.
     * @returns Indicates if queue head is consistent (true) or inconsistent (false).
     */
    async _ensureHeadIsNonEmpty(ensureConsistency = false, limit = Math.max(this.inProgressCount() * exports.QUERY_HEAD_BUFFER, exports.QUERY_HEAD_MIN_LENGTH), iteration = 0) {
        // If is nonempty resolve immediately.
        if (this.queueHeadDict.length() > 0)
            return true;
        if (!this.queryQueueHeadPromise) {
            const queryStartedAt = new Date();
            this.queryQueueHeadPromise = this.client
                .listHead({ limit })
                .then(({ items, queueModifiedAt, hadMultipleClients }) => {
                items.forEach(({ id: requestId, uniqueKey }) => {
                    // Queue head index might be behind the main table, so ensure we don't recycle requests
                    if (!requestId || !uniqueKey || this.inProgress.has(requestId) || this.recentlyHandled.get(requestId))
                        return;
                    this.queueHeadDict.add(requestId, requestId, false);
                    this._cacheRequest(getRequestId(uniqueKey), {
                        requestId,
                        wasAlreadyHandled: false,
                        wasAlreadyPresent: true,
                        uniqueKey,
                    });
                });
                // This is needed so that the next call to _ensureHeadIsNonEmpty() will fetch the queue head again.
                this.queryQueueHeadPromise = null;
                return {
                    wasLimitReached: items.length >= limit,
                    prevLimit: limit,
                    queueModifiedAt: new Date(queueModifiedAt),
                    queryStartedAt,
                    hadMultipleClients,
                };
            });
        }
        const { queueModifiedAt, wasLimitReached, prevLimit, queryStartedAt, hadMultipleClients } = await this.queryQueueHeadPromise;
        // TODO: I feel this code below can be greatly simplified...
        // If queue is still empty then one of the following holds:
        // - the other calls waiting for this promise already consumed all the returned requests
        // - the limit was too low and contained only requests in progress
        // - the writes from other clients were not propagated yet
        // - the whole queue was processed and we are done
        // If limit was not reached in the call then there are no more requests to be returned.
        if (prevLimit >= consts_1.REQUEST_QUEUE_HEAD_MAX_LIMIT) {
            this.log.warning(`Reached the maximum number of requests in progress: ${consts_1.REQUEST_QUEUE_HEAD_MAX_LIMIT}.`);
        }
        const shouldRepeatWithHigherLimit = this.queueHeadDict.length() === 0
            && wasLimitReached
            && prevLimit < consts_1.REQUEST_QUEUE_HEAD_MAX_LIMIT;
        // If ensureConsistency=true then we must ensure that either:
        // - queueModifiedAt is older than queryStartedAt by at least API_PROCESSED_REQUESTS_DELAY_MILLIS
        // - hadMultipleClients=false and this.assumedTotalCount<=this.assumedHandledCount
        const isDatabaseConsistent = +queryStartedAt - +queueModifiedAt >= exports.API_PROCESSED_REQUESTS_DELAY_MILLIS;
        const isLocallyConsistent = !hadMultipleClients && this.assumedTotalCount <= this.assumedHandledCount;
        // Consistent information from one source is enough to consider request queue finished.
        const shouldRepeatForConsistency = ensureConsistency && !isDatabaseConsistent && !isLocallyConsistent;
        // If both are false then head is consistent and we may exit.
        if (!shouldRepeatWithHigherLimit && !shouldRepeatForConsistency)
            return true;
        // If we are querying for consistency then we limit the number of queries to MAX_QUERIES_FOR_CONSISTENCY.
        // If this is reached then we return false so that empty() and finished() returns possibly false negative.
        if (!shouldRepeatWithHigherLimit && iteration > exports.MAX_QUERIES_FOR_CONSISTENCY)
            return false;
        const nextLimit = shouldRepeatWithHigherLimit
            ? Math.round(prevLimit * 1.5)
            : prevLimit;
        // If we are repeating for consistency then wait required time.
        if (shouldRepeatForConsistency) {
            const delayMillis = exports.API_PROCESSED_REQUESTS_DELAY_MILLIS - (Date.now() - +queueModifiedAt);
            this.log.info(`Waiting for ${delayMillis}ms before considering the queue as finished to ensure that the data is consistent.`);
            await (0, promises_1.setTimeout)(delayMillis);
        }
        return this._ensureHeadIsNonEmpty(ensureConsistency, nextLimit, iteration + 1);
    }
    /**
     * Adds a request straight to the queueHeadDict, to improve performance.
     */
    _maybeAddRequestToQueueHead(requestId, forefront) {
        if (forefront) {
            this.queueHeadDict.add(requestId, requestId, true);
        }
        else if (this.assumedTotalCount < exports.QUERY_HEAD_MIN_LENGTH) {
            this.queueHeadDict.add(requestId, requestId, false);
        }
    }
    /**
     * Removes the queue either from the Apify Cloud storage or from the local database,
     * depending on the mode of operation.
     */
    async drop() {
        await this.client.delete();
        const manager = storage_manager_1.StorageManager.getManager(RequestQueue, this.config);
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
    async handledCount() {
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
    async getInfo() {
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
    static async open(queueIdOrName, options = {}) {
        (0, ow_1.default)(queueIdOrName, ow_1.default.optional.string);
        (0, ow_1.default)(options, ow_1.default.object.exactShape({
            config: ow_1.default.optional.object.instanceOf(configuration_1.Configuration),
        }));
        await (0, utils_1.purgeDefaultStorages)();
        const manager = storage_manager_1.StorageManager.getManager(this, options.config);
        return manager.openStorage(queueIdOrName);
    }
}
exports.RequestQueue = RequestQueue;
//# sourceMappingURL=request_queue.js.map