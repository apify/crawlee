import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import { checkParamOrThrow } from 'apify-client/build/utils';
import Promise from 'bluebird';
import _ from 'underscore';
import Request from './request';
import { ensureDirExists, checkParamPrototypeOrThrow } from './utils';

export const LOCAL_EMULATION_SUBDIR = 'request-queues';

const writeFilePromised = Promise.promisify(fs.writeFile);
const readdirPromised = Promise.promisify(fs.readdir);
const readFilePromised = Promise.promisify(fs.readFile);
const moveFilePromised = Promise.promisify(fsExtra.move);

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
        this.uniqueKeyToQueueOrderNo = {};
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

                this.uniqueKeyToQueueOrderNo[request.uniqueKey] = queueOrderNo;
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
        checkParamPrototypeOrThrow(request, 'request', Request, 'Apify.Request');
        checkParamOrThrow(opts, 'opts', 'Object');

        const { putInFront = false } = opts;

        checkParamOrThrow(putInFront, 'opts.putInFront', 'Boolean');

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
                this.uniqueKeyToQueueOrderNo[request.uniqueKey] = queueOrderNo;

                return writeFilePromised(filePath, JSON.stringify(request, null, 4));
            });
    }

    getRequest(uniqueKey) {
        checkParamOrThrow(uniqueKey, 'uniqueKey', 'String');

        return this.initializationPromise
            .then(() => {
                const queueOrderNo = this.uniqueKeyToQueueOrderNo[uniqueKey];

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
        checkParamPrototypeOrThrow(request, 'request', Request, 'Apify.Request');

        return this.initializationPromise
            .then(() => {
                const queueOrderNo = this.uniqueKeyToQueueOrderNo[request.uniqueKey];
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
        checkParamPrototypeOrThrow(request, 'request', Request, 'Apify.Request');

        return this.initializationPromise
            .then(() => {
                const queueOrderNo = this.uniqueKeyToQueueOrderNo[request.uniqueKey];

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

    // TODO:
    // should reuse instances
    if (!localEmulationDir) {
        return Promise.reject(new Error('We currently don\'t support remote queues! This is only temporary'
            + 'implementation that stores the queue in the key-value store.'));
    }

    const queue = localEmulationDir
        ? new RequestQueueLocal(queueIdOrName, localEmulationDir)
        : new RequestQueueRemote('default-request-queue');

    return Promise.resolve(queue);
};
