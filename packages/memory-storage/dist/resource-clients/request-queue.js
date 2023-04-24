"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestQueueClient = void 0;
const shapeshift_1 = require("@sapphire/shapeshift");
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const promises_1 = require("node:fs/promises");
const fs_extra_1 = require("fs-extra");
const consts_1 = require("../consts");
const utils_1 = require("../utils");
const base_client_1 = require("./common/base-client");
const instance_1 = require("../workers/instance");
const cache_helpers_1 = require("../cache-helpers");
const request_queue_1 = require("../fs/request-queue");
const requestShape = shapeshift_1.s.object({
    id: shapeshift_1.s.string,
    url: shapeshift_1.s.string.url({ allowedProtocols: ['http:', 'https:'] }),
    uniqueKey: shapeshift_1.s.string,
    method: shapeshift_1.s.string.optional,
    retryCount: shapeshift_1.s.number.int.optional,
    handledAt: shapeshift_1.s.union(shapeshift_1.s.string, shapeshift_1.s.date.valid).optional,
}).passthrough;
const requestShapeWithoutId = requestShape.omit(['id']);
const batchRequestShapeWithoutId = requestShapeWithoutId.array;
const requestOptionsShape = shapeshift_1.s.object({
    forefront: shapeshift_1.s.boolean.optional,
});
class RequestQueueClient extends base_client_1.BaseClient {
    constructor(options) {
        super(options.id ?? (0, node_crypto_1.randomUUID)());
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "createdAt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Date()
        });
        Object.defineProperty(this, "accessedAt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Date()
        });
        Object.defineProperty(this, "modifiedAt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Date()
        });
        Object.defineProperty(this, "handledRequestCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "pendingRequestCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "requestQueueDirectory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "requests", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "client", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.name = options.name;
        this.requestQueueDirectory = (0, node_path_1.resolve)(options.baseStorageDirectory, this.name ?? this.id);
        this.client = options.client;
    }
    async get() {
        const found = await (0, cache_helpers_1.findRequestQueueByPossibleId)(this.client, this.name ?? this.id);
        if (found) {
            found.updateTimestamps(false);
            return found.toRequestQueueInfo();
        }
        return undefined;
    }
    async update(newFields) {
        // The validation is intentionally loose to prevent issues
        // when swapping to a remote queue in production.
        const parsed = shapeshift_1.s.object({
            name: shapeshift_1.s.string.lengthGreaterThan(0).optional,
        }).passthrough.parse(newFields);
        const existingQueueById = await (0, cache_helpers_1.findRequestQueueByPossibleId)(this.client, this.name ?? this.id);
        if (!existingQueueById) {
            this.throwOnNonExisting(consts_1.StorageTypes.RequestQueue);
        }
        // Skip if no changes
        if (!parsed.name) {
            return existingQueueById.toRequestQueueInfo();
        }
        // Check that name is not in use already
        const existingQueueByName = this.client.requestQueuesHandled.find((queue) => queue.name?.toLowerCase() === parsed.name.toLowerCase());
        if (existingQueueByName) {
            this.throwOnDuplicateEntry(consts_1.StorageTypes.RequestQueue, 'name', parsed.name);
        }
        existingQueueById.name = parsed.name;
        const previousDir = existingQueueById.requestQueueDirectory;
        existingQueueById.requestQueueDirectory = (0, node_path_1.resolve)(this.client.requestQueuesDirectory, parsed.name ?? existingQueueById.name ?? existingQueueById.id);
        await (0, fs_extra_1.move)(previousDir, existingQueueById.requestQueueDirectory, { overwrite: true });
        // Update timestamps
        existingQueueById.updateTimestamps(true);
        return existingQueueById.toRequestQueueInfo();
    }
    async delete() {
        const storeIndex = this.client.requestQueuesHandled.findIndex((queue) => queue.id === this.id);
        if (storeIndex !== -1) {
            const [oldClient] = this.client.requestQueuesHandled.splice(storeIndex, 1);
            oldClient.pendingRequestCount = 0;
            oldClient.requests.clear();
            await (0, promises_1.rm)(oldClient.requestQueueDirectory, { recursive: true, force: true });
        }
    }
    async listHead(options = {}) {
        const { limit } = shapeshift_1.s.object({
            limit: shapeshift_1.s.number.optional.default(100),
        }).parse(options);
        const existingQueueById = await (0, cache_helpers_1.findRequestQueueByPossibleId)(this.client, this.name ?? this.id);
        if (!existingQueueById) {
            this.throwOnNonExisting(consts_1.StorageTypes.RequestQueue);
        }
        existingQueueById.updateTimestamps(false);
        const items = [];
        for (const storageEntry of existingQueueById.requests.values()) {
            if (items.length === limit) {
                break;
            }
            const request = await storageEntry.get();
            if (request.orderNo) {
                items.push(request);
            }
        }
        return {
            limit,
            hadMultipleClients: false,
            queueModifiedAt: existingQueueById.modifiedAt,
            items: items.sort((a, b) => a.orderNo - b.orderNo).map(({ json }) => this._jsonToRequest(json)),
        };
    }
    async addRequest(request, options = {}) {
        requestShapeWithoutId.parse(request);
        requestOptionsShape.parse(options);
        const existingQueueById = await (0, cache_helpers_1.findRequestQueueByPossibleId)(this.client, this.name ?? this.id);
        if (!existingQueueById) {
            this.throwOnNonExisting(consts_1.StorageTypes.RequestQueue);
        }
        const requestModel = this._createInternalRequest(request, options.forefront);
        const existingRequestWithIdEntry = existingQueueById.requests.get(requestModel.id);
        // We already have the request present, so we return information about it
        if (existingRequestWithIdEntry) {
            const existingRequestWithId = await existingRequestWithIdEntry.get();
            existingQueueById.updateTimestamps(false);
            return {
                requestId: existingRequestWithId.id,
                wasAlreadyHandled: existingRequestWithId.orderNo === null,
                wasAlreadyPresent: true,
            };
        }
        const newEntry = (0, request_queue_1.createRequestQueueStorageImplementation)({
            persistStorage: existingQueueById.client.persistStorage,
            requestId: requestModel.id,
            storeDirectory: existingQueueById.requestQueueDirectory,
        });
        await newEntry.update(requestModel);
        existingQueueById.requests.set(requestModel.id, newEntry);
        existingQueueById.updateTimestamps(true);
        if (requestModel.orderNo) {
            existingQueueById.pendingRequestCount += 1;
        }
        else {
            existingQueueById.handledRequestCount += 1;
        }
        return {
            requestId: requestModel.id,
            // We return wasAlreadyHandled: false even though the request may
            // have been added as handled, because that's how API behaves.
            wasAlreadyHandled: false,
            wasAlreadyPresent: false,
        };
    }
    async batchAddRequests(requests, options = {}) {
        batchRequestShapeWithoutId.parse(requests);
        requestOptionsShape.parse(options);
        const existingQueueById = await (0, cache_helpers_1.findRequestQueueByPossibleId)(this.client, this.name ?? this.id);
        if (!existingQueueById) {
            this.throwOnNonExisting(consts_1.StorageTypes.RequestQueue);
        }
        const result = {
            processedRequests: [],
            unprocessedRequests: [],
        };
        for (const model of requests) {
            const requestModel = this._createInternalRequest(model, options.forefront);
            const existingRequestWithIdEntry = existingQueueById.requests.get(requestModel.id);
            if (existingRequestWithIdEntry) {
                const existingRequestWithId = await existingRequestWithIdEntry.get();
                result.processedRequests.push({
                    requestId: existingRequestWithId.id,
                    uniqueKey: existingRequestWithId.uniqueKey,
                    wasAlreadyHandled: existingRequestWithId.orderNo === null,
                    wasAlreadyPresent: true,
                });
                continue;
            }
            const newEntry = (0, request_queue_1.createRequestQueueStorageImplementation)({
                persistStorage: existingQueueById.client.persistStorage,
                requestId: requestModel.id,
                storeDirectory: existingQueueById.requestQueueDirectory,
            });
            await newEntry.update(requestModel);
            existingQueueById.requests.set(requestModel.id, newEntry);
            if (requestModel.orderNo) {
                existingQueueById.pendingRequestCount += 1;
            }
            else {
                existingQueueById.handledRequestCount += 1;
            }
            result.processedRequests.push({
                requestId: requestModel.id,
                uniqueKey: requestModel.uniqueKey,
                // We return wasAlreadyHandled: false even though the request may
                // have been added as handled, because that's how API behaves.
                wasAlreadyHandled: false,
                wasAlreadyPresent: false,
            });
        }
        existingQueueById.updateTimestamps(true);
        return result;
    }
    async getRequest(id) {
        shapeshift_1.s.string.parse(id);
        const existingQueueById = await (0, cache_helpers_1.findRequestQueueByPossibleId)(this.client, this.name ?? this.id);
        if (!existingQueueById) {
            this.throwOnNonExisting(consts_1.StorageTypes.RequestQueue);
        }
        existingQueueById.updateTimestamps(false);
        const json = (await existingQueueById.requests.get(id)?.get())?.json;
        return this._jsonToRequest(json);
    }
    async updateRequest(request, options = {}) {
        requestShape.parse(request);
        requestOptionsShape.parse(options);
        const existingQueueById = await (0, cache_helpers_1.findRequestQueueByPossibleId)(this.client, this.name ?? this.id);
        if (!existingQueueById) {
            this.throwOnNonExisting(consts_1.StorageTypes.RequestQueue);
        }
        const requestModel = this._createInternalRequest(request, options.forefront);
        // First we need to check the existing request to be
        // able to return information about its handled state.
        const existingRequestEntry = existingQueueById.requests.get(requestModel.id);
        // Undefined means that the request is not present in the queue.
        // We need to insert it, to behave the same as API.
        if (!existingRequestEntry) {
            return this.addRequest(request, options);
        }
        const existingRequest = await existingRequestEntry.get();
        const newEntry = (0, request_queue_1.createRequestQueueStorageImplementation)({
            persistStorage: existingQueueById.client.persistStorage,
            requestId: requestModel.id,
            storeDirectory: existingQueueById.requestQueueDirectory,
        });
        await newEntry.update(requestModel);
        // When updating the request, we need to make sure that
        // the handled counts are updated correctly in all cases.
        existingQueueById.requests.set(requestModel.id, newEntry);
        const isRequestHandledStateChanging = typeof existingRequest.orderNo !== typeof requestModel.orderNo;
        const requestWasHandledBeforeUpdate = existingRequest.orderNo === null;
        const requestIsHandledAfterUpdate = requestModel.orderNo === null;
        if (isRequestHandledStateChanging) {
            existingQueueById.pendingRequestCount += requestWasHandledBeforeUpdate ? 1 : -1;
        }
        if (requestIsHandledAfterUpdate) {
            existingQueueById.handledRequestCount += 1;
        }
        existingQueueById.updateTimestamps(true);
        return {
            requestId: requestModel.id,
            wasAlreadyHandled: requestWasHandledBeforeUpdate,
            wasAlreadyPresent: true,
        };
    }
    async deleteRequest(id) {
        const existingQueueById = await (0, cache_helpers_1.findRequestQueueByPossibleId)(this.client, this.name ?? this.id);
        if (!existingQueueById) {
            this.throwOnNonExisting(consts_1.StorageTypes.RequestQueue);
        }
        const entry = existingQueueById.requests.get(id);
        if (entry) {
            const request = await entry.get();
            existingQueueById.requests.delete(id);
            existingQueueById.updateTimestamps(true);
            if (request.orderNo) {
                existingQueueById.pendingRequestCount -= 1;
            }
            else {
                existingQueueById.handledRequestCount -= 1;
            }
            await entry.delete();
        }
    }
    toRequestQueueInfo() {
        return {
            accessedAt: this.accessedAt,
            createdAt: this.createdAt,
            hadMultipleClients: false,
            handledRequestCount: this.handledRequestCount,
            id: this.id,
            modifiedAt: this.modifiedAt,
            name: this.name,
            pendingRequestCount: this.pendingRequestCount,
            stats: {},
            totalRequestCount: this.requests.size,
            userId: '1',
        };
    }
    updateTimestamps(hasBeenModified) {
        this.accessedAt = new Date();
        if (hasBeenModified) {
            this.modifiedAt = new Date();
        }
        const data = this.toRequestQueueInfo();
        (0, instance_1.sendWorkerMessage)({
            action: 'update-metadata',
            data,
            entityType: 'requestQueues',
            entityDirectory: this.requestQueueDirectory,
            id: this.name ?? this.id,
            writeMetadata: this.client.writeMetadata,
            persistStorage: this.client.persistStorage,
        });
    }
    _jsonToRequest(requestJson) {
        if (!requestJson)
            return undefined;
        const request = JSON.parse(requestJson);
        return (0, utils_1.purgeNullsFromObject)(request);
    }
    _createInternalRequest(request, forefront) {
        const orderNo = this._calculateOrderNo(request, forefront);
        const id = (0, utils_1.uniqueKeyToRequestId)(request.uniqueKey);
        if (request.id && request.id !== id) {
            throw new Error('Request ID does not match its uniqueKey.');
        }
        const json = JSON.stringify({ ...request, id });
        return {
            id,
            json,
            method: request.method,
            orderNo,
            retryCount: request.retryCount ?? 0,
            uniqueKey: request.uniqueKey,
            url: request.url,
        };
    }
    _calculateOrderNo(request, forefront) {
        if (request.handledAt)
            return null;
        const timestamp = Date.now();
        return forefront ? -timestamp : timestamp;
    }
}
exports.RequestQueueClient = RequestQueueClient;
//# sourceMappingURL=request-queue.js.map