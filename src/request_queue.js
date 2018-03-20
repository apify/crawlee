import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import { checkParamOrThrow } from 'apify-client/build/utils';
import LruCache from 'apify-shared/lru_cache';
import Promise from 'bluebird';
import crypto from 'crypto';
import _ from 'underscore';
import Request from './request';
import { ensureDirExists, checkParamPrototypeOrThrow, apifyClient } from './utils';

export const LOCAL_EMULATION_SUBDIR = 'request-queues';
const MAX_OPENED_QUEUES = 1000;

const writeFilePromised = Promise.promisify(fs.writeFile);
const readdirPromised = Promise.promisify(fs.readdir);
const readFilePromised = Promise.promisify(fs.readFile);
const moveFilePromised = Promise.promisify(fsExtra.move);

const { requestQueues } = apifyClient;
const queuesCache = new LruCache({ maxLength: MAX_OPENED_QUEUES }); // Open queues are stored here.

/**
 * Helper function to validate params of *.addRequest().
 * @ignore
 */
const validateAddRequestParams = (request, opts) => {
    checkParamPrototypeOrThrow(request, 'request', Request, 'Apify.Request');
    checkParamOrThrow(opts, 'opts', 'Object');

    const { putInFront = false } = opts;

    checkParamOrThrow(putInFront, 'opts.putInFront', 'Boolean');

    if (request.id) throw new Error('Request has already "id" so it cannot be added to the queue!');

    return { putInFront };
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
 * @param {String} datasetId - ID of the dataset.
 */
export class RequestQueue {
    constructor(queueId) {
        checkParamOrThrow(queueId, 'options.queueId', 'String');

        this.queueId = queueId;
        this.queueHead = {};
        this.inProggress = {};
    }

    addRequest(request, opts) {
        const { putInFront } = validateAddRequestParams(request, opts);

        return requestQueues.addRequest({
            request,
            queueId: this.queueId,
        });
    }

    getRequest(requestId) {
        validateGetRequestParams(requestId);

        return requestQueues.getRequest({
            requestId,
            queueId: this.queueId,
        });
    }

    fetchNextRequest() {
    }

    markRequestHandled(request) {
        validateMarkRequestHandledParams(request);

        if (!request.handledAt) request.handledAt = new Date();

        return requestQueues.updateRequest({
            request,
            queueId: this.queueId,
        });
    }

    reclaimRequest(request) {
        validateReclaimRequestParams(request);

        return requestQueues
            .updateRequest({
                request,
                queueId: this.queueId,
            })
            .then((response) => {
                delete this.inProggress[request.id];

                return response;
            });
    }

    isEmpty() {
    }

    isfinished() {
    }
}

/**
 * Helper function that extracts queue order number from filename.
 *
 * @ignore
 */
const filepathToQueueOrderNo = (filepath) => {
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
                const queueOrderNo = filepathToQueueOrderNo(filepath);

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
        const { putInFront } = validateAddRequestParams(request, opts);

        return this.initializationPromise
            .then(() => {
                const sgn = (putInFront ? 1 : 2) * (10 ** 15);
                const base = (10 ** (13)); // Date.now() returns int with 13 numbers.
                // We always add pending count for a case that two pages are insterted at the same millisecond.
                const now = Date.now() + this.pendingCount;
                const queueOrderNo = putInFront
                    ? sgn + (base - now)
                    : sgn + (base + now);
                const filePath = this._getFilePath(queueOrderNo);

                this.pendingCount++;
                this.requestIdToQueueOrderNo[request.id] = queueOrderNo;

                // Add ID as server does.
                const requestCopy = JSON.parse(JSON.stringify(request));
                requestCopy.id = uniqueKeyToId(request.uniqueKey);

                return writeFilePromised(filePath, JSON.stringify(requestCopy, null, 4));
            });
    }

    getRequest(requestId) {
        validateAddRequestParams(requestId);

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
                    const no = filepathToQueueOrderNo(filename);

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

                return moveFilePromised(source, dest)
                    .then(() => {
                        this.pendingCount--;
                        this.inProgressCount--;
                        delete this.queueOrderNoInProgress[queueOrderNo];
                    });
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

            return requestQueues.getOrCreateQueue({ qeueueName: queueIdOrName });
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
