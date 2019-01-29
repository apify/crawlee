import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import { checkParamOrThrow } from 'apify-client/build/utils';
import LruCache from 'apify-shared/lru_cache';
import ListDictionary from 'apify-shared/list_dictionary';
import { ENV_VARS, LOCAL_STORAGE_SUBDIRS } from 'apify-shared/consts';
import { delayPromise, checkParamPrototypeOrThrow } from 'apify-shared/utilities';
import Promise from 'bluebird';
import crypto from 'crypto';
import Request from './request';
import { ensureDirExists, apifyClient, openRemoteStorage, openLocalStorage, ensureTokenOrLocalStorageEnvExists } from './utils';

export const LOCAL_STORAGE_SUBDIR = LOCAL_STORAGE_SUBDIRS.requestQueues;
const MAX_OPENED_QUEUES = 1000;
const MAX_CACHED_REQUESTS = 1000 * 1000;

// When requesting queue head we always fetch requestsInProgressCount * QUERY_HEAD_BUFFER number of requests.
export const QUERY_HEAD_MIN_LENGTH = 100;
export const QUERY_HEAD_BUFFER = 3;

// If queue was modified (request added/updated/deleted) before more than API_PROCESSED_REQUESTS_DELAY_MILLIS
// then we get head query to be consistent.
export const API_PROCESSED_REQUESTS_DELAY_MILLIS = 10 * 1000;

// How many times we try to get queue head with queueModifiedAt older than API_PROCESSED_REQUESTS_DELAY_MILLIS.
export const MAX_QUERIES_FOR_CONSISTENCY = 6;

const writeFilePromised = Promise.promisify(fs.writeFile);
const readdirPromised = Promise.promisify(fs.readdir);
const readFilePromised = Promise.promisify(fs.readFile);
const renamePromised = Promise.promisify(fs.rename);
const emptyDirPromised = Promise.promisify(fsExtra.emptyDir);

const { requestQueues } = apifyClient;
const queuesCache = new LruCache({ maxLength: MAX_OPENED_QUEUES }); // Open queues are stored here.

/**
 * Helper function to validate params of *.addRequest().
 * @ignore
 */
const validateAddRequestParams = (request, opts) => {
    checkParamOrThrow(request, 'request', 'Object');

    if (!(request instanceof Request)) {
        request = new Request(request);
    }

    checkParamOrThrow(opts, 'opts', 'Object');

    const { forefront = false } = opts;

    checkParamOrThrow(forefront, 'opts.forefront', 'Boolean');

    if (request.id) throw new Error('Request has already "id" so it cannot be added to the queue!');

    return { forefront, request };
};

/**
 * Helper function to validate params of *.getRequest().
 * @ignore
 */
const validateGetRequestParams = (requestId) => {
    checkParamOrThrow(requestId, 'requestId', 'String');
};

/**
 * Helper function to validate params of *.markRequestHandled().
 * @ignore
 */
const validateMarkRequestHandledParams = (request) => {
    checkParamPrototypeOrThrow(request, 'request', Request, 'Apify.Request');
    checkParamOrThrow(request.id, 'request.id', 'String');
};

/**
 * Helper function to validate params of *.reclaimRequest().
 * @ignore
 */
const validateReclaimRequestParams = (request, opts) => {
    checkParamPrototypeOrThrow(request, 'request', Request, 'Apify.Request');
    checkParamOrThrow(request.id, 'request.id', 'String');
    checkParamOrThrow(opts, 'opts', 'Object');

    const { forefront = false } = opts;

    checkParamOrThrow(forefront, 'opts.forefront', 'Boolean');

    return { forefront };
};

/**
 * Helper function that creates ID from uniqueKey for local emulation of request queue.
 * It's also used for local cache of remote request queue.
 *
 * This function may not exactly match how requestId is created server side.
 * So we never pass requestId created by this to server and use it only for local cache.
 *
 * @ignore
 */
const getRequestId = (uniqueKey) => {
    checkParamOrThrow(uniqueKey, 'uniqueKey', 'String');

    const str = crypto
        .createHash('sha256')
        .update(uniqueKey)
        .digest('base64')
        .replace(/(\+|\/|=)/g, '');

    return str.length > 15
        ? str.substr(0, 15)
        : str;
};

/**
 * A helper class that is used to report results from various
 * [`RequestQueue`](../api/requestqueue) functions as well as
 * [`Apify.utils.enqueueLinks()`](../api/utils#utils.enqueueLinks).
 *
 * @typedef {Object} QueueOperationInfo
 * @property {Boolean} wasAlreadyPresent Indicates if request was already present in the queue.
 * @property {Boolean} wasAlreadyHandled Indicates if request was already marked as handled.
 * @property {String} requestId The ID of the added request
 * @property {Request} request The original `Request` object passed to the `RequestQueue` function.
 */

/**
 * Represents a queue of URLs to crawl, which is used for deep crawling of websites
 * where you start with several URLs and then recursively
 * follow links to other pages. The data structure supports both breadth-first and depth-first crawling orders.
 *
 * Each URL is represented using an instance of the {@link Request} class.
 * The queue can only contain unique URLs. More precisely, it can only contain {@link Request} instances
 * with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be overridden.
 * To add a single URL multiple times to the queue,
 * corresponding {@link Request} objects will need to have different `uniqueKey` properties.
 *
 * Do not instantiate this class directly, use the
 * [`Apify.openRequestQueue()`](apify#module_Apify.openRequestQueue) function instead.
 *
 * `RequestQueue` is used by {@link BasicCrawler}, {@link CheerioCrawler}
 * and {@link PuppeteerCrawler} as a source of URLs to crawl.
 * Unlike {@link RequestList}, `RequestQueue` supports dynamic adding and removing of requests.
 * On the other hand, the queue is not optimized for operations that add or remove a large number of URLs in a batch.
 *
 * `RequestQueue` stores its data either on local disk or in the Apify Cloud,
 * depending on whether the `APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN` environment variable is set.
 *
 * If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the queue data is stored in
 * that local directory as follows:
 * ```
 * {APIFY_LOCAL_STORAGE_DIR}/request_queues/{QUEUE_ID}/{STATE}/{NUMBER}.json
 * ```
 * Note that `{QUEUE_ID}` is the name or ID of the request queue. The default queue has ID: `default`,
 * unless you override it by setting the `APIFY_DEFAULT_REQUEST_QUEUE_ID` environment variable.
 * Each request in the queue is stored as a separate JSON file, where `{STATE}` is either `handled` or `pending`,
 * and `{NUMBER}` is an integer indicating the position of the request in the queue.
 *
 * If the `APIFY_TOKEN` environment variable is set but `APIFY_LOCAL_STORAGE_DIR` not, the data is stored in the
 * <a href="https://www.apify.com/docs/storage#queue" target="_blank">Apify Request Queue</a>
 * cloud storage. Note that you can force usage of the cloud storage also by passing the `forceCloud`
 * option to [`Apify.openRequestQueue()`](apify#module_Apify.openRequestQueue) function,
 * even if the `APIFY_LOCAL_STORAGE_DIR` variable is set.
 *
 * **Example usage:**
 *
 * ```javascript
 * // Open the default request queue associated with the actor run
 * const queue = await Apify.openRequestQueue();
 *
 * // Open a named request queue
 * const queueWithName = await Apify.openRequestQueue('some-name');
 *
 * // Enqueue few requests
 * await queue.addRequest({ url: 'http://example.com/aaa' });
 * await queue.addRequest({ url: 'http://example.com/bbb' });
 * await queue.addRequest({ url: 'http://example.com/foo/bar' }, { forefront: true });
 *
 * // Get requests from queue
 * const request1 = await queue.fetchNextRequest();
 * const request2 = await queue.fetchNextRequest();
 * const request3 = await queue.fetchNextRequest();
 *
 * // Mark a request as handled
 * await queue.markRequestHandled(request1);
 *
 * // If processing of a request fails then reclaim it back to the queue, so that it's crawled again
 * await queue.reclaimRequest(request2);
 * ```
 * @hideconstructor
 */
export class RequestQueue {
    constructor(queueId, queueName) {
        checkParamOrThrow(queueId, 'queueId', 'String');
        checkParamOrThrow(queueName, 'queueName', 'Maybe String');

        this.queueId = queueId;
        this.queueName = queueName;
        this.queueHeadDict = new ListDictionary();
        this.requestIdsInProgress = {};
        this.inProgressCount = 0;
        this.queryQueueHeadPromise = null;

        // Caching requests to avoid duplicite addRequest() calls.
        // Key is computed using getRequestId() and value is { id, isHandled }.
        this.requestsCache = new LruCache({ maxLength: MAX_CACHED_REQUESTS });

        // This contains false if we were not able to get queue head with queueModifiedAt older than
        // at least API_PROCESSED_REQUESTS_DELAY_MILLIS.
        this.isHeadConsistent = true;
    }

    /**
     * Adds a request to the queue.
     *
     * If a request with the same `uniqueKey` property is already present in the queue,
     * it will not be updated. You can find out whether this happened from the resulting
     * {@link QueueOperationInfo} object.
     *
     * @param {Request|Object} request {@link Request} object, or an object to construct a `Request` instance from.
     * @param {Object} [options]
     * @param {Boolean} [options.forefront=false] If `true`, the request will be added to the foremost position in the queue.
     * @return {QueueOperationInfo}
     */
    addRequest(request, options = {}) {
        const { forefront, request: newRequest } = validateAddRequestParams(request, options);

        if (newRequest) {
            request = newRequest;
        }

        const cacheKey = getRequestId(request.uniqueKey);
        const cachedInfo = this.requestsCache.get(cacheKey);

        if (cachedInfo) {
            return Promise.resolve({
                wasAlreadyPresent: true,
                // We may assume that if request is in local cache then also the information if the
                // request was already handled is there because just one client should be using one queue.
                wasAlreadyHandled: cachedInfo.isHandled,
                requestId: cachedInfo.id,
                // TODO: Why not set request.id to cachedInfo.id???
                request,
            });
        }

        return requestQueues
            .addRequest({
                request,
                queueId: this.queueId,
                forefront,
            })
            .then((queueOperationInfo) => {
                const { requestId, wasAlreadyHandled } = queueOperationInfo;

                this._cacheRequest(cacheKey, queueOperationInfo);

                if (forefront && !this.requestIdsInProgress[requestId] && !wasAlreadyHandled) {
                    this.queueHeadDict.add(requestId, requestId, true);
                }

                // TODO: Why not set request.id to cachedInfo.id???
                queueOperationInfo.request = request;

                return queueOperationInfo;
            });
    }

    /**
     * Gets the request from the queue specified by ID.
     *
     * @param {String} requestId Request ID
     * @return {Promise<Request>}
     */
    getRequest(requestId) {
        validateGetRequestParams(requestId);

        // TODO: Could we also use requestsCache here? It would be consistent with addRequest()

        return requestQueues
            .getRequest({
                requestId,
                queueId: this.queueId,
            })
            .then(obj => (obj ? new Request(obj) : obj));
    }

    /**
     * Returns next request in the queue to be processed.
     *
     * @returns {Promise<Request>}
     */
    fetchNextRequest() {
        return this
            ._ensureHeadIsNonEmpty()
            .then(() => {
                const nextId = this.queueHeadDict.removeFirst();

                // We are likely done at this point.
                if (!nextId) return null;

                this._addToInProgress(nextId);

                return this
                    .getRequest(nextId)
                    .then((request) => {
                        // We need to handle this situation because request may not be available
                        // immediately after adding to the queue.
                        if (!request) {
                            this._removeFromInProgress(nextId);
                            this.queueHeadDict.add(nextId, nextId, false);
                        }

                        return request;
                    });
            });
    }

    /**
     * Marks request handled after successful processing.
     *
     * @param {Request} request
     * @return {Promise<QueueOperationInfo>}
     */
    markRequestHandled(request) {
        validateMarkRequestHandledParams(request);

        if (!this.requestIdsInProgress[request.id]) {
            throw new Error(`Cannot mark request ${request.id} as handled as it is not in progress!`);
        }

        if (!request.handledAt) request.handledAt = new Date();

        return requestQueues
            .updateRequest({
                request,
                queueId: this.queueId,
            })
            .then((queueOperationInfo) => {
                this._removeFromInProgress(request.id);
                this._cacheRequest(getRequestId(request.uniqueKey), queueOperationInfo);

                queueOperationInfo.request = request;

                return queueOperationInfo;
            });
    }

    /**
     * Reclaims failed request back to the queue,
     * so that it can be processed later again.
     *
     * @param {Request} request
     * @param {Object} [options]
     * @param {Boolean} [options.forefront=false]
     *   If `true` then requests get returned to the start of the queue
     *   and to the back of the queue otherwise.
     * @return {Promise<QueueOperationInfo>}
     */
    reclaimRequest(request, options = {}) {
        const { forefront } = validateReclaimRequestParams(request, options);

        return requestQueues
            .updateRequest({
                request,
                queueId: this.queueId,
                forefront,
            })
            .then((queueOperationInfo) => {
                this._removeFromInProgress(request.id);
                this._cacheRequest(getRequestId(request.uniqueKey), queueOperationInfo);

                if (forefront) this.queueHeadDict.add(request.id, request.id, true);

                queueOperationInfo.request = request;

                return queueOperationInfo;
            });
    }

    /**
     * Resolves to `true` if the next call to {@link RequestQueue#fetchNextRequest} would return `null`, otherwise it resolves to `false`.
     * Note that even if the queue is empty, there might be some pending requests currently being processed.
     *
     * Due to the nature of distributed storage systems,
     * the function might occasionally return a false negative, but it should never return a false positive!
     *
     * @returns {Promise<Boolean>}
     */
    isEmpty() {
        return this
            ._ensureHeadIsNonEmpty()
            .then(() => this.isHeadConsistent && this.queueHeadDict.length() === 0);
    }

    /**
     * Resolves to `true` if all requests were already handled and there are no more left.
     * Due to the nature of distributed storage systems,
     * the function might occasionally return a false negative, but it will never return a false positive.
     *
     * @returns {Promise<Boolean>}
     */
    isFinished() {
        return this
            ._ensureHeadIsNonEmpty()
            .then(() => this.isHeadConsistent && this.inProgressCount === 0 && this.queueHeadDict.length() === 0);
    }

    /**
     * Caches information about request to beware of unneeded addRequest() calls.
     *
     * @ignore
     */
    _cacheRequest(cacheKey, queueOperationInfo) {
        checkParamOrThrow(cacheKey, 'cacheKey', 'String');
        checkParamOrThrow(queueOperationInfo, 'queueOperationInfo', 'Object');
        checkParamOrThrow(queueOperationInfo.requestId, 'queueOperationInfo.requestId', 'String');
        checkParamOrThrow(queueOperationInfo.wasAlreadyHandled, 'queueOperationInfo.wasAlreadyHandled', 'Boolean');

        this.requestsCache.add(cacheKey, {
            id: queueOperationInfo.requestId,
            isHandled: queueOperationInfo.wasAlreadyHandled,
        });
    }

    /**
     * @ignore
     */
    _addToInProgress(requestId) {
        checkParamOrThrow(requestId, 'requestId', 'String');

        // Is already there.
        if (this.requestIdsInProgress[requestId]) return;

        this.requestIdsInProgress[requestId] = requestId;
        this.inProgressCount++;
    }

    /**
     * @ignore
     */
    _removeFromInProgress(requestId) {
        checkParamOrThrow(requestId, 'requestId', 'String');

        // Is already removed.
        if (!this.requestIdsInProgress[requestId]) return;

        delete this.requestIdsInProgress[requestId];
        this.inProgressCount--;
    }

    /**
     * We always request more items than is in progress to ensure that something
     * falls into head.
     *
     * @ignore
     */
    _ensureHeadIsNonEmpty(checkModifiedAt = false, limit = Math.max(this.inProgressCount * QUERY_HEAD_BUFFER, QUERY_HEAD_MIN_LENGTH), iteration = 0) {
        checkParamOrThrow(checkModifiedAt, 'checkModifiedAt', 'Boolean');
        checkParamOrThrow(limit, 'limit', 'Number');
        checkParamOrThrow(iteration, 'iteration', 'Number');

        // If is nonempty resolve immediately.
        if (this.queueHeadDict.length()) return Promise.resolve();

        if (!this.queryQueueHeadPromise) {
            const queryStartedAt = new Date();

            this.queryQueueHeadPromise = requestQueues
                .getHead({
                    limit,
                    queueId: this.queueId,
                })
                .then(({ items, queueModifiedAt }) => {
                    items.forEach(({ id, uniqueKey }) => {
                        if (!this.requestIdsInProgress[id]) {
                            this.queueHeadDict.add(id, id, false);
                            this._cacheRequest(getRequestId(uniqueKey), { requestId: id, wasAlreadyHandled: false });
                        }
                    });

                    // This is needed so that the next call can request queue head again.
                    this.queryQueueHeadPromise = null;

                    return {
                        limitReached: items.length === limit,
                        prevLimit: limit,
                        queueModifiedAt: new Date(queueModifiedAt),
                        queryStartedAt,
                    };
                });
        }

        return this.queryQueueHeadPromise
            .then(({ queueModifiedAt, limitReached, prevLimit, queryStartedAt }) => {
                this.isHeadConsistent = true;

                // If queue is still empty then it's likely because some of the other calls waiting
                // for this promise already consumed all the returned requests or the limit was too
                // low and contained only requests in progress.
                //
                // If limit was not reached in the call then there are no more requests to be returned.
                const shouldRepeatWithHigherLimit = !this.queueHeadDict.length() && limitReached && prevLimit < REQUEST_QUEUE_HEAD_MAX_LIMIT;

                // If checkModifiedAt=true then we must ensure that queueModifiedAt is older than
                // queryStartedAt for at least API_PROCESSED_REQUESTS_DELAY_MILLIS.
                const shouldRepeatForConsistency = (
                    checkModifiedAt
                    && (queryStartedAt - queueModifiedAt > API_PROCESSED_REQUESTS_DELAY_MILLIS)
                    && iteration
                );

                if (shouldRepeatWithHigherLimit || shouldRepeatForConsistency) {
                    // If we are queriing for consistency then we limit the number of queries to MAX_QUERIES_FOR_CONSISTENCY.
                    // If this is reached then we set this.isHeadConsistent=true so that empty() and finished() returns
                    // maybe false negative.
                    if (!shouldRepeatWithHigherLimit && iteration > MAX_QUERIES_FOR_CONSISTENCY) {
                        this.isHeadConsistent = false;
                        return;
                    }

                    const nextLimit = shouldRepeatWithHigherLimit
                        ? prevLimit * 1.5
                        : prevLimit;

                    const delayMillis = shouldRepeatForConsistency
                        ? API_PROCESSED_REQUESTS_DELAY_MILLIS
                        : 0;

                    return delayPromise(delayMillis)
                        .then(() => this._ensureHeadIsNonEmpty(checkModifiedAt, nextLimit, iteration + 1));
                }
            });
    }

    /**
     * Removes the queue either from the Apify Cloud storage or from the local directory,
     * depending on the mode of operation.
     *
     * @return {Promise}
     */
    delete() {
        return requestQueues
            .deleteQueue({
                queueId: this.queueId,
            })
            .then(() => {
                queuesCache.remove(this.queueId);
                if (this.queueName) queuesCache.remove(this.queueName);
            });
    }

    /**
     * Returns the number of handled requests.
     *
     * @return {Promise<number>}
     */
    async handledCount() {
        const queueInfo = await requestQueues.getQueue({ queueId: this.queueId });
        return queueInfo.handledRequestCount;
    }
}

/**
 * Helper function that extracts queue order number from filename.
 *
 * @ignore
 */
const filePathToQueueOrderNo = (filepath) => {
    const int = filepath
        .split(path.sep).pop() // Get filename from path
        .split('.')[0]; // Remove extension

    return parseInt(int, 10);
};

/**
 * Local directory-based implementation of the `RequestQueue` class.
 *
 * @ignore
 */
export class RequestQueueLocal {
    constructor(queueId, localStorageDir) {
        checkParamOrThrow(queueId, 'queueId', 'String');
        checkParamOrThrow(localStorageDir, 'localStorageDir', 'String');

        this.queueId = queueId;
        this.localStoragePath = path.resolve(path.join(localStorageDir, LOCAL_STORAGE_SUBDIR, queueId));
        this.localHandledEmulationPath = path.join(this.localStoragePath, 'handled');
        this.localPendingEmulationPath = path.join(this.localStoragePath, 'pending');

        this.queueOrderNoCounter = 0; // Counter used in _getQueueOrderNo to ensure there won't be a collision.
        this.pendingCount = 0;
        this._handledCount = 0;
        this.inProgressCount = 0;
        this.requestIdToQueueOrderNo = {};
        this.queueOrderNoInProgress = {};

        this.initializationPromise = this._initialize();
    }

    async _initialize() {
        // NOTE: This created all root dirs as necessary
        await ensureDirExists(this.localHandledEmulationPath);
        await ensureDirExists(this.localPendingEmulationPath);

        const [handled, pending] = await Promise.all([
            readdirPromised(this.localHandledEmulationPath),
            readdirPromised(this.localPendingEmulationPath),
        ]);

        this.pendingCount = pending.length;
        this._handledCount = handled.length;

        const handledPaths = handled.map(filename => path.join(this.localHandledEmulationPath, filename));
        const pendingPaths = pending.map(filename => path.join(this.localPendingEmulationPath, filename));
        const filePaths = handledPaths.concat(pendingPaths);

        return Promise.mapSeries(filePaths, filepath => this._readFile(filepath));
    }

    async _readFile(filepath) {
        const str = await readFilePromised(filepath);
        const request = JSON.parse(str);
        const queueOrderNo = filePathToQueueOrderNo(filepath);

        this.requestIdToQueueOrderNo[request.id] = queueOrderNo;
    }

    _getFilePath(queueOrderNo, isHandled = false) {
        const fileName = `${queueOrderNo}.json`;
        const dir = isHandled
            ? this.localHandledEmulationPath
            : this.localPendingEmulationPath;

        return path.join(dir, fileName);
    }

    _getQueueOrderNo(forefront = false) {
        const sgn = (forefront ? 1 : 2) * (10 ** 15);
        const base = (10 ** (13)); // Date.now() returns int with 13 numbers.
        // We always add pending count for a case that two pages are insterted at the same millisecond.
        const now = Date.now() + this.queueOrderNoCounter++;
        const queueOrderNo = forefront
            ? sgn + (base - now)
            : sgn + (base + now);

        return queueOrderNo;
    }

    _getRequestByQueueOrderNo(queueOrderNo) {
        checkParamOrThrow(queueOrderNo, 'queueOrderNo', 'Number');

        return readFilePromised(this._getFilePath(queueOrderNo, false))
            .catch((err) => {
                if (err.code !== 'ENOENT') throw err;

                return readFilePromised(this._getFilePath(queueOrderNo, true));
            })
            .then((str) => {
                if (!str) throw new Error('Request was not found in none of handled and pending directories!');

                const obj = JSON.parse(str);

                return new Request(obj);
            });
    }

    addRequest(request, opts = {}) {
        const { forefront, request: newRequest } = validateAddRequestParams(request, opts);

        if (newRequest) {
            request = newRequest;
        }

        return this.initializationPromise
            .then(() => {
                const queueOrderNo = this._getQueueOrderNo(forefront);

                // Add ID as server does.
                // TODO: This way of cloning doesn't preserve Dates!
                const requestCopy = JSON.parse(JSON.stringify(request));
                requestCopy.id = getRequestId(request.uniqueKey);

                // If request already exists then don't override it!
                if (this.requestIdToQueueOrderNo[requestCopy.id]) {
                    return this
                        .getRequest(requestCopy.id)
                        .then(existingRequest => ({
                            requestId: existingRequest.id,
                            wasAlreadyHandled: existingRequest && existingRequest.handledAt,
                            wasAlreadyPresent: true,
                            request,
                        }));
                }

                this.requestIdToQueueOrderNo[requestCopy.id] = queueOrderNo;
                if (!requestCopy.handledAt) this.pendingCount++;

                const filePath = this._getFilePath(queueOrderNo, !!requestCopy.handledAt);

                return writeFilePromised(filePath, JSON.stringify(requestCopy, null, 4))
                    .then(() => ({
                        requestId: requestCopy.id,
                        wasAlreadyHandled: false,
                        wasAlreadyPresent: false,
                        request,
                    }));
            });
    }

    getRequest(requestId) {
        validateGetRequestParams(requestId);

        return this.initializationPromise
            .then(() => {
                const queueOrderNo = this.requestIdToQueueOrderNo[requestId];

                return this._getRequestByQueueOrderNo(queueOrderNo);
            });
    }

    async fetchNextRequest() {
        await this.initializationPromise;

        const files = await readdirPromised(this.localPendingEmulationPath);

        let request = null;
        while (!request && files.length) {
            const filename = files.shift();
            const queueOrderNo = filePathToQueueOrderNo(filename);

            if (this.queueOrderNoInProgress[queueOrderNo]) continue; // eslint-disable-line

            this.queueOrderNoInProgress[queueOrderNo] = true;
            this.inProgressCount++;

            // TODO: There must be a better way. This try/catch is here because there is a race condition between
            //       between this and call to reclaimRequest() or markRequestHandled() that may move/rename/deleted
            //       the file between readdirPromised() and this function.
            //       Ie. the file gets listed in readdirPromised() but removed from this.queueOrderNoInProgres
            //       meanwhile causing this to fail.
            try {
                request = await this._getRequestByQueueOrderNo(queueOrderNo);
            } catch (err) {
                delete this.queueOrderNoInProgress[queueOrderNo];
                this.inProgressCount--;
                if (err.code !== 'ENOENT') throw err;
            }
        }

        return request;
    }

    markRequestHandled(request) {
        validateMarkRequestHandledParams(request);

        return this.initializationPromise
            .then(() => {
                const queueOrderNo = this.requestIdToQueueOrderNo[request.id];
                const source = this._getFilePath(queueOrderNo, false);
                const dest = this._getFilePath(queueOrderNo, true);

                if (!this.queueOrderNoInProgress[queueOrderNo]) {
                    throw new Error(`Cannot mark request ${request.id} handled request that is not in progress!`);
                }

                if (!request.handledAt) request.handledAt = new Date();

                // NOTE: First write to old file and then rename to new one to do the operation atomically.
                //       Situation where two files exists at the same time may cause race condition bugs.
                return writeFilePromised(source, JSON.stringify(request, null, 4))
                    .then(() => renamePromised(source, dest))
                    .then(() => {
                        this.pendingCount--;
                        this._handledCount++;
                        this.inProgressCount--;
                        delete this.queueOrderNoInProgress[queueOrderNo];

                        return {
                            requestId: request.id,
                            wasAlreadyHandled: false,
                            wasAlreadyPresent: true,
                            request,
                        };
                    });
            });
    }

    reclaimRequest(request, opts = {}) {
        const { forefront } = validateReclaimRequestParams(request, opts);

        return this.initializationPromise
            .then(() => {
                const oldQueueOrderNo = this.requestIdToQueueOrderNo[request.id];
                const newQueueOrderNo = this._getQueueOrderNo(forefront);
                const source = this._getFilePath(oldQueueOrderNo);
                const dest = this._getFilePath(newQueueOrderNo);

                if (!this.queueOrderNoInProgress[oldQueueOrderNo]) {
                    throw new Error(`Cannot reclaim request ${request.id} that is not in progress!`);
                }

                this.requestIdToQueueOrderNo[request.id] = newQueueOrderNo;

                // NOTE: First write to old file and then rename to new one to do the operation atomically.
                //       Situation where two files exists at the same time may cause race condition bugs.
                return writeFilePromised(source, JSON.stringify(request, null, 4))
                    .then(() => renamePromised(source, dest))
                    .then(() => {
                        this.inProgressCount--;
                        delete this.queueOrderNoInProgress[oldQueueOrderNo];

                        return {
                            requestId: request.id,
                            wasAlreadyHandled: false,
                            wasAlreadyPresent: true,
                            request,
                        };
                    });
            });
    }

    isEmpty() {
        return this.initializationPromise
            .then(() => this.pendingCount === this.inProgressCount);
    }

    isFinished() {
        return this.initializationPromise
            .then(() => this.pendingCount === 0);
    }

    delete() {
        return emptyDirPromised(this.localStoragePath)
            .then(() => {
                queuesCache.remove(this.queueId);
            });
    }

    async handledCount() {
        await this.initializationPromise;
        return this._handledCount;
    }
}

/**
 * Helper function that first requests queue by ID and if queue doesn't exist then gets it by name.
 *
 * @ignore
 */
const getOrCreateQueue = (queueIdOrName) => {
    return requestQueues.getQueue({ queueId: queueIdOrName })
        .then((existingQueue) => {
            if (existingQueue) return existingQueue;

            return requestQueues.getOrCreateQueue({ queueName: queueIdOrName });
        });
};

/**
 * Opens a request queue and returns a promise resolving to an instance
 * of the {@link RequestQueue} class.
 *
 * {@link RequestQueue} represents a queue of URLs to crawl, which is stored either on local filesystem or in the cloud.
 * The queue is used for deep crawling of websites, where you start with several URLs and then
 * recursively follow links to other pages. The data structure supports both breadth-first
 * and depth-first crawling orders.
 *
 * For more details and code examples, see the {@link RequestQueue} class.
 *
 * @param {string} [queueIdOrName]
 *   ID or name of the request queue to be opened. If `null` or `undefined`,
 *   the function returns the default request queue associated with the actor run.
 * @param {object} [options]
 * @param {boolean} [options.forceCloud=false]
 *   If set to `true` then the function uses cloud storage usage even if the `APIFY_LOCAL_STORAGE_DIR`
 *   environment variable is set. This way it is possible to combine local and cloud storage.
 * @returns {Promise<RequestQueue>}
 * @memberof module:Apify
 * @name openRequestQueue
 */
export const openRequestQueue = (queueIdOrName, options = {}) => {
    checkParamOrThrow(queueIdOrName, 'queueIdOrName', 'Maybe String');
    checkParamOrThrow(options, 'options', 'Object');
    ensureTokenOrLocalStorageEnvExists('request queue');

    const { forceCloud = false } = options;
    checkParamOrThrow(forceCloud, 'options.forceCloud', 'Boolean');

    return process.env[ENV_VARS.LOCAL_STORAGE_DIR] && !forceCloud
        ? openLocalStorage(queueIdOrName, ENV_VARS.DEFAULT_REQUEST_QUEUE_ID, RequestQueueLocal, queuesCache)
        : openRemoteStorage(queueIdOrName, ENV_VARS.DEFAULT_REQUEST_QUEUE_ID, RequestQueue, queuesCache, getOrCreateQueue);
};
