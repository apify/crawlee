import fs from 'fs';
import path from 'path';
import { checkParamOrThrow } from 'apify-client/build/utils';
import Promise from 'bluebird';
import _ from 'underscore';
import Request from './request';

const writeFilePromised = Promise.promisify(fs.writeFile);
const readFilePromised = Promise.promisify(fs.readFile);
const readdirPromised = Promise.promisify(fs.readdir);

// @TODO: it would be great to make this class not only a quick prototype,
// but generally usable thing for users. For that we need to make it more efficient,
// remove sync method calls etc.
// For example, we could store files as follows:
// <APIFY_LOCAL_EMULATION_DIR>/request-queues/<queue-name-or-id>/index.json' - contains uniqueKeyToQueueOrderNo
// <APIFY_LOCAL_EMULATION_DIR>/request-queues/<queue-name-or-id>/handled/1517588019092.json'
// <APIFY_LOCAL_EMULATION_DIR>/request-queues/<queue-name-or-id>/not-handled/1517588019092.json'
// <APIFY_LOCAL_EMULATION_DIR>/request-queues/<queue-name-or-id>/not-handled/0517588065008.json' - starts with '0' for requests pushed to front
// <APIFY_LOCAL_EMULATION_DIR>/request-queues/<queue-name-or-id>/not-handled/1517588065008.json' - starts with '1' for requests pushed to end
// The query to get the first file in directory (sorted by name) should be fast even if there are many files.


export class RequestQueueLocal {
    constructor(queueId, localEmulationDir) {
        checkParamOrThrow(queueId, 'options.queueId', 'String');
        checkParamOrThrow(localEmulationDir, 'localEmulationDir', 'String');

        this.queueId = queueId;
        this.localEmulationPath = path.resolve(path.join(localEmulationDir, queueId));
        this.uniqueKeyToQueueOrderNo = {};
        this.queueOrderNoInProgressOrHandled = {};

        if (!fs.existsSync(this.localEmulationPath)) fs.mkdirSync(this.localEmulationPath);

        this._initializeFromDir();
    }

    _initializeFromDir() {
        const files = fs.readdirSync(this.localEmulationPath);

        files.forEach((file) => {
            const str = fs.readFileSync(path.join(this.localEmulationPath, file));
            const obj = JSON.parse(str);

            this.uniqueKeyToQueueOrderNo[obj.request.uniqueKey] = obj.queueOrderNo;

            if (obj.isHandled) this.queueOrderNoInProgressOrHandled[obj.queueOrderNo] = true;
        });
    }

    _getFilePath(queueOrderNo) {
        const fileName = `${queueOrderNo}.json`;

        return path.join(this.localEmulationPath, fileName);
    }

    addRequest(request, opts = {}) {
        // @TODO check that request is instance of Request here end everywhere else also

        checkParamOrThrow(request, 'request', 'Object');
        checkParamOrThrow(opts, 'opts', 'Object');

        const { putInFront = false } = opts;

        checkParamOrThrow(putInFront, 'opts.putInFront', 'Boolean');

        const queueOrderNo = (putInFront ? -1 : 1) * Date.now();
        const wrappedRequest = JSON.stringify({ queueOrderNo, isHandled: false, request }, null, 2);
        const filePath = this._getFilePath(queueOrderNo);

        this.uniqueKeyToQueueOrderNo[request.uniqueKey] = queueOrderNo;

        return writeFilePromised(filePath, wrappedRequest);
    }

    getRequest(uniqueKey) {
        checkParamOrThrow(uniqueKey, 'uniqueKey', 'String');

        const queueOrderNo = this.uniqueKeyToQueueOrderNo[uniqueKey];

        return this._getRequestByQueueOrderNo(queueOrderNo);
    }

    _getRequestByQueueOrderNo(queueOrderNo) {
        checkParamOrThrow(queueOrderNo, 'queueOrderNo', 'Number');

        const filePath = this._getFilePath(queueOrderNo);

        return readFilePromised(filePath)
            .then(str => JSON.parse(str))
            .then(wrappedRequest => new Request(wrappedRequest.request));
    }

    fetchNextRequest() {
        if (this.isEmpty()) return null;

        return readdirPromised(this.localEmulationPath)
            .then(files => files.map(file => parseInt(file.split('.')[0], 10)))
            .then((queueOrderNos) => {
                const queueOrderNo = _.find(queueOrderNos, no => !this.queueOrderNoInProgressOrHandled[no]);

                this.queueOrderNoInProgressOrHandled[queueOrderNo] = true;

                return this._getRequestByQueueOrderNo(queueOrderNo);
            });
    }

    markRequestHandled(request) {
        checkParamOrThrow(request, 'request', 'Object');

        const queueOrderNo = this.uniqueKeyToQueueOrderNo[request.uniqueKey];
        const filePath = this._getFilePath(queueOrderNo);

        return readFilePromised(filePath)
            .then(str => JSON.parse(str))
            .then(obj => Object.assign(obj, { isHandled: true }))
            .then(obj => JSON.stringify(obj, null, 2))
            .then(wrappedRequest => writeFilePromised(filePath, wrappedRequest));
    }

    reclaimRequest(request) {
        checkParamOrThrow(request, 'request', 'Object');

        const queueOrderNo = this.uniqueKeyToQueueOrderNo[request.uniqueKey];

        delete this.queueOrderNoInProgressOrHandled[queueOrderNo];
    }

    isEmpty() {
        return _.size(this.queueOrderNoInProgressOrHandled) === _.size(this.uniqueKeyToQueueOrderNo);
    }
}

/**
 * @memberof module:Apify
 * @function
 */
export const openRequestQueue = (queueIdOrName) => {
    const localEmulationDir = process.env[ENV_VARS.LOCAL_EMULATION_DIR];

    // TODO:
    // checkParamOrThrow(queueIdOrName, 'queueIdOrName', 'Maybe String');
    //
    // TODO:
    // should reuse instances
    if (!localEmulationDir && queueIdOrName) {
        return Promise.reject(new Error('We currently don\'t support remote queues! This is only temporary'
            + 'implementation that stores the queue in the key-value store.'));
    }

    const queue = localEmulationDir
        ? new RequestQueueLocal(queueIdOrName, localEmulationDir)
        : new RequestQueueRemote('dummy-tmp-queue');

    return Promise.resolve(queue);
};
