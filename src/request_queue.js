import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import { checkParamOrThrow } from 'apify-client/build/utils';
import LruCache from 'apify-shared/lru_cache';
import ListDictionary from 'apify-shared/list_dictionary';
import Promise from 'bluebird';
import crypto from 'crypto';
import _ from 'underscore';
import Request from './request';
import { ENV_VARS } from '../build/constants';
import { ensureDirExists, checkParamPrototypeOrThrow, apifyClient } from './utils';

export const LOCAL_EMULATION_SUBDIR = 'request-queues';
const MAX_OPENED_QUEUES = 1000;
export const QUERY_HEAD_BUFFER = 50;

const writeFilePromised = Promise.promisify(fs.writeFile);
const readdirPromised = Promise.promisify(fs.readdir);
const readFilePromised = Promise.promisify(fs.readFile);
const moveFilePromised = Promise.promisify(fsExtra.move);

const { requestQueues } = apifyClient;
const queuesCache = new LruCache({ maxLength: MAX_OPENED_QUEUES }); // Open queues are stored here.


/**
 * @ignore.
 */

/**
 * Helper function to validate params of *.addRequest().
 * @ignore
 */
const validateAddRequestParams = (request, opts) => {
    checkParamPrototypeOrThrow(request, 'request', Request, 'Apify.Request');
    checkParamOrThrow(opts, 'opts', 'Object');

    const { forefront = false } = opts;

    checkParamOrThrow(forefront, 'opts.forefront', 'Boolean');

    if (request.id) throw new Error('Request has already "id" so it cannot be added to the queue!');

    return { forefront };
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
const validateReclaimRequestParams = (request) => {
    checkParamPrototypeOrThrow(request, 'request', Request, 'Apify.Request');
    checkParamOrThrow(request.id, 'request.id', 'String');
};

/**
 * @typedef {Object} RequestOperationInfo
 * @property {Boolean} wasAlreadyPresent Indicates if request was already present in the queue.
 * @property {Boolean} wasAlreadyHandled Indicates if request was already marked as handled.
 * @property {String} requestId The ID of the added request
 */

/**
 * @ignore.
 *
 * TODO: fix docs
 * Dataset class provides easy interface to Apify Dataset storage type. Dataset should be opened using
 * `Apify.openDataset()` function.
 *
 * Basic usage of Dataset:
 *
 * ```javascript
 * const dataset = await Apify.openDataset('my-dataset-id');
 * await dataset.pushData({ foo: 'bar' });
 * ```
 *
 * @param {String} queueId - ID of the request queue.
 */
export class RequestQueue {
    constructor(queueId) {
        checkParamOrThrow(queueId, 'options.queueId', 'String');

        this.queueId = queueId;
        this.queueHeadDict = new ListDictionary();
        this.requestIdsInProgress = {};
        this.inProgressCount = 0;
        this.queryQueueHeadPromise = null;
    }

    /**
     * Adds a request to the queue.
     *
     * @param {Request} request Request object
     * @param {Object} [opts]
     * @param {Boolean} [opts.forefront] If `true`, the request will be added to the foremost position in the queue.
     * @return {RequestOperationInfo}
     */
    addRequest(request, opts = {}) {
        const { forefront } = validateAddRequestParams(request, opts);

        return requestQueues
            .addRequest({
                request,
                queueId: this.queueId,
                forefront,
            })
            .then((requestOperationInfo) => {
                const { requestId } = requestOperationInfo;

                if (forefront && !this.requestIdsInProgress[requestId]) {
                    this.queueHeadDict.add(requestId, requestId, true);
                }

                return requestOperationInfo;
            });
    }

    /**
     * Gets a request from the queue.
     *
     * @param  {String} requestId Request ID
     * @return {Request}
     */
    getRequest(requestId) {
        validateGetRequestParams(requestId);

        return requestQueues
            .getRequest({
                requestId,
                queueId: this.queueId,
            })
            .then(obj => (obj ? new Request(obj) : obj));
    }

    /**
     * Returns next upcoming request.
     *
     * @returns {Request}
     */
    fetchNextRequest() {
        return this
            ._ensureHeadIsNonEmpty()
            .then(() => {
                const nextId = this.queueHeadDict.removeFirst();

                // We are likely done at this point.
                if (!nextId) return null;

                this._addToInProgress(nextId);

                return this.getRequest(nextId);
            });
    }

    /**
     * Marks request handled after successfull processing.
     *
     * @param {Request} request
     * @return {RequestOperationInfo}
     */
    markRequestHandled(request) {
        validateMarkRequestHandledParams(request);

        if (!this.requestIdsInProgress[request.id]) {
            throw new Error('Cannot mark handled request that is not in progress!');
        }

        if (!request.handledAt) request.handledAt = new Date();

        return requestQueues
            .updateRequest({
                request,
                queueId: this.queueId,
            })
            .then((response) => {
                this._removeFromInProgress(request.id);

                return response;
            });
    }

    /**
     * Reclaims request after unsuccessfull operation. Requests gets returned into the queue.
     *
     * @param {Request} request
     * @param {Object} [opts]
     * @param {Boolean} [opts.forefront=false] If true then requests gets returned to the begining of the queue
     *                                    and to the back of the queue otherwise.
     * @return {RequestOperationInfo}
     */
    reclaimRequest(request, { forefront = false }) {
        validateReclaimRequestParams(request);

        return requestQueues
            .updateRequest({
                request,
                queueId: this.queueId,
                forefront,
            })
            .then((response) => {
                this._removeFromInProgress(request.id);

                if (forefront) this.queueHeadDict.add(request.id, request.id, true);

                return response;
            });
    }

    /**
     * Returns `true` if the next call to fetchNextRequest() will return null, otherwise it returns `false`.
     * Note that even if the queue is empty, there might be some pending requests currently being processed.
     *
     * @returns {boolean}
     */
    isEmpty() {
        return this
            ._queryQueueHead()
            .then(() => this.queueHeadDict.length() === 0);
    }

    /**
     * Returns `true` if all requests were already handled and there are no more left.
     *
     * @returns {boolean}
     */
    isFinished() {
        return this
            ._queryQueueHead()
            .then(() => this.inProgressCount === 0 && this.queueHeadDict.length() === 0);
    }


    /**
     * @ignore.
     */
    _addToInProgress(requestId) {
        // Is already there.
        if (this.requestIdsInProgress[requestId]) return;

        this.requestIdsInProgress[requestId] = requestId;
        this.inProgressCount++;
    }

    /**
     * @ignore.
     */
    _removeFromInProgress(requestId) {
        // Is already removed.
        if (!this.requestIdsInProgress[requestId]) return;

        delete this.requestIdsInProgress[requestId];
        this.inProgressCount--;
    }

    /**
     * We always request more items than is in proggress to ensure that something
     * falls into head.
     *
     * @ignore.
     */
    _ensureHeadIsNonEmpty(limit = this.inProgressCount + QUERY_HEAD_BUFFER) {
        checkParamOrThrow(limit, 'limit', 'Number');

        // If is nonempty resolve immediately.
        if (this.queueHeadDict.length()) return Promise.resolve();

        if (!this.queryQueueHeadPromise) {
            this.queryQueueHeadPromise = requestQueues
                .getHead({
                    limit,
                    queueId: this.queueId,
                })
                .then(({ items }) => {
                    items.forEach(({ id }) => {
                        if (!this.requestIdsInProgress[id]) this.queueHeadDict.add(id, id, false);
                    });

                    // This is needed so that the next call can request queue head again.
                    this.queryQueueHeadPromise = null;

                    return {
                        prevLimit: limit,
                        limitReached: items.length === limit,
                    };
                });
        }

        return this.queryQueueHeadPromise
            .then(({ prevLimit, limitReached }) => {
                // If queue is still empty then it's likely because some of the other calls waiting
                // for this promise already consumed all the returned requests or the limit was too
                // low and contained only requests in progress.
                //
                // If limit was not reached in the call then there are no more requests to be returned.
                if (!this.queueHeadDict.length() && limitReached) {
                    return this._ensureHeadIsNonEmpty(prevLimit + QUERY_HEAD_BUFFER);
                }
            });
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
 * Helper function that creates ID from uniqueKey for local usage.
 *
 * @ignore
 */
const uniqueKeyToId = (uniqueKey) => {
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
 * Local implementation of RequestQueue.
 *
 * @ignore
 */
export class RequestQueueLocal {
    constructor(queueId, localEmulationDir) {
        checkParamOrThrow(queueId, 'options.queueId', 'String');
        checkParamOrThrow(localEmulationDir, 'localEmulationDir', 'String');

        this.queueId = queueId;
        this.localEmulationPath = path.resolve(path.join(localEmulationDir, LOCAL_EMULATION_SUBDIR, queueId));
        this.localHandledEmulationPath = path.join(this.localEmulationPath, 'handled');
        this.localPendingEmulationPath = path.join(this.localEmulationPath, 'pending');

        this.pendingCount = 0;
        this.inProgressCount = 0;
        this.requestIdToQueueOrderNo = {};
        this.queueOrderNoInProgress = {};

        this.initializationPromise = this._initialize();
    }

    _initialize() {
        return ensureDirExists(this.localEmulationPath)
            .then(() => ensureDirExists(this.localHandledEmulationPath))
            .then(() => ensureDirExists(this.localPendingEmulationPath))
            .then(() => Promise.all([
                readdirPromised(this.localHandledEmulationPath),
                readdirPromised(this.localPendingEmulationPath),
            ]))
            .then(([handled, pending]) => {
                this.pendingCount = pending.length;

                const handledPaths = handled.map(filename => path.join(this.localHandledEmulationPath, filename));
                const pendingPaths = pending.map(filename => path.join(this.localPendingEmulationPath, filename));
                const filePaths = handledPaths.concat(pendingPaths);

                return Promise.mapSeries(filePaths, filepath => this._readFile(filepath));
            });
    }

    _readFile(filepath) {
        return readFilePromised(filepath)
            .then((str) => {
                const request = JSON.parse(str);
                const queueOrderNo = filePathToQueueOrderNo(filepath);

                this.requestIdToQueueOrderNo[request.id] = queueOrderNo;
            });
    }

    _getFilePath(queueOrderNo, isHandled = false) {
        const fileName = `${queueOrderNo}.json`;
        const dir = isHandled
            ? this.localHandledEmulationPath
            : this.localPendingEmulationPath;

        return path.join(dir, fileName);
    }

    addRequest(request, opts = {}) {
        const { forefront } = validateAddRequestParams(request, opts);

        return this.initializationPromise
            .then(() => {
                const sgn = (forefront ? 1 : 2) * (10 ** 15);
                const base = (10 ** (13)); // Date.now() returns int with 13 numbers.
                // We always add pending count for a case that two pages are insterted at the same millisecond.
                const now = Date.now() + this.pendingCount;
                const queueOrderNo = forefront
                    ? sgn + (base - now)
                    : sgn + (base + now);

                // Add ID as server does.
                const requestCopy = JSON.parse(JSON.stringify(request));
                requestCopy.id = uniqueKeyToId(request.uniqueKey);

                // If request already exists then don't override it!
                if (this.requestIdToQueueOrderNo[requestCopy.id]) {
                    return this
                        .getRequest(requestCopy.id)
                        .then(existingRequest => ({
                            requestId: existingRequest.id,
                            wasAlreadyHandled: existingRequest && existingRequest.handledAt,
                            wasAlreadyPresent: true,
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

    fetchNextRequest() {
        return this.initializationPromise
            .then(() => readdirPromised(this.localPendingEmulationPath))
            .then((files) => {
                let queueOrderNo;

                _.find(files, (filename) => {
                    const no = filePathToQueueOrderNo(filename);

                    if (!this.queueOrderNoInProgress[no]) {
                        queueOrderNo = no;
                        return true;
                    }
                });

                if (!queueOrderNo) return null;

                this.queueOrderNoInProgress[queueOrderNo] = true;
                this.inProgressCount++;

                return this._getRequestByQueueOrderNo(queueOrderNo);
            });
    }

    markRequestHandled(request) {
        validateMarkRequestHandledParams(request);

        return this.initializationPromise
            .then(() => {
                const queueOrderNo = this.requestIdToQueueOrderNo[request.id];
                const source = this._getFilePath(queueOrderNo, false);
                const dest = this._getFilePath(queueOrderNo, true);

                if (!this.queueOrderNoInProgress[queueOrderNo]) {
                    throw new Error('Cannot mark handled request that is not in progress!');
                }

                if (!request.handledAt) request.handledAt = new Date();

                return moveFilePromised(source, dest)
                    .then(() => {
                        this.pendingCount--;
                        this.inProgressCount--;
                        delete this.queueOrderNoInProgress[queueOrderNo];
                    })
                    .then(() => ({
                        requestId: request.id,
                        wasAlreadyHandled: false,
                        wasAlreadyPresent: true,
                    }));
            });
    }

    reclaimRequest(request) {
        validateReclaimRequestParams(request);

        return this.initializationPromise
            .then(() => {
                const queueOrderNo = this.requestIdToQueueOrderNo[request.id];

                if (!this.queueOrderNoInProgress[queueOrderNo]) {
                    throw new Error('Cannot reclaim request that is not in progress!');
                }

                this.inProgressCount--;

                delete this.queueOrderNoInProgress[queueOrderNo];
            })
            .then(() => ({
                requestId: request.id,
                wasAlreadyHandled: false,
                wasAlreadyPresent: true,
            }));
    }

    isEmpty() {
        return this.initializationPromise
            .then(() => this.pendingCount === this.inProgressCount);
    }

    isFinished() {
        return this.initializationPromise
            .then(() => this.pendingCount === 0);
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
 * Opens request queue and returns its object.</p>
 *
 * ```javascript
 * const queue = await Apify.openRequestQueue('my-queue-id');
 *
 * await queue.addRequest(new Apify.Request({ url: 'http://example.com/aaa'});
 * await queue.addRequest(new Apify.Request({ url: 'http://example.com/bbb'});
 * await queue.addRequest(new Apify.Request({ url: 'http://example.com/foo/bar'}, { puyInFront: true });
 *
 * // Get requests from queue
 * const request1 = queue.fetchNextRequest();
 * const request2 = queue.fetchNextRequest();
 * const request3 = queue.fetchNextRequest();
 *
 * // Mark some of them as handled
 * queue.markRequestHandled(request1);
 *
 * // If processing fails then reclaim it back to the queue
 * queue.reclaimRequest(request2);
 * ```
 *
 * If the `APIFY_LOCAL_EMULATION_DIR` environment variable is defined, the value this function
 * returns an instance `RequestQueueLocal` which is an local emulation of request queue.
 * This is useful for local development and debugging of your acts.
 *
 * @param {string} queueIdOrName ID or name of the request queue to be opened.
 * @returns {Promise<RequestQueue>} Returns a promise that resolves to a RequestQueue object.
 *
 * @memberof module:Apify
 * @name openRequestQueue
 * @instance
 *
 * @ignore
 */
export const openRequestQueue = (queueIdOrName) => {
    const localEmulationDir = process.env[ENV_VARS.LOCAL_EMULATION_DIR];

    checkParamOrThrow(queueIdOrName, 'queueIdOrName', 'Maybe String');

    let isDefault = false;
    let queuePromise;

    if (!queueIdOrName) {
        const envVar = ENV_VARS.DEFAULT_REQUEST_QUEUE_ID;

        // Env var doesn't exist.
        if (!process.env[envVar]) return Promise.reject(new Error(`The '${envVar}' environment variable is not defined.`));

        isDefault = true;
        queueIdOrName = process.env[envVar];
    }

    queuePromise = queuesCache.get(queueIdOrName);

    // Found in cache.
    if (queuePromise) return queuePromise;

    // Use local emulation?
    if (localEmulationDir) {
        queuePromise = Promise.resolve(new RequestQueueLocal(queueIdOrName, localEmulationDir));
    } else {
        queuePromise = isDefault // If true then we know that this is an ID of existing queue.
            ? Promise.resolve(new RequestQueue(queueIdOrName))
            : getOrCreateQueue(queueIdOrName).then(queue => (new RequestQueue(queue.id)));
    }

    queuesCache.add(queueIdOrName, queuePromise);

    return queuePromise;
};
