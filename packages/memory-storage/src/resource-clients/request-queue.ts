import type * as storage from '@crawlee/types';
import { s } from '@sapphire/shapeshift';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import { move } from 'fs-extra';
import type { MemoryStorage } from '../index';
import { StorageTypes } from '../consts';
import { purgeNullsFromObject, uniqueKeyToRequestId } from '../utils';
import { BaseClient } from './common/base-client';
import { sendWorkerMessage } from '../workers/instance';
import { findRequestQueueByPossibleId } from '../cache-helpers';

const requestShape = s.object({
    id: s.string,
    url: s.string.url({ allowedProtocols: ['http:', 'https:'] }),
    uniqueKey: s.string,
    method: s.string.optional,
    retryCount: s.number.int.optional,
    handledAt: s.union(s.string, s.date.valid).optional,
}).passthrough;

const requestShapeWithoutId = requestShape.omit(['id']);

const batchRequestShapeWithoutId = requestShapeWithoutId.array;

const requestOptionsShape = s.object({
    forefront: s.boolean.optional,
});

export interface RequestQueueClientOptions {
    name?: string;
    id?: string;
    baseStorageDirectory: string;
    client: MemoryStorage;
}

export interface InternalRequest {
    id: string;
    orderNo: number | null;
    url: string;
    uniqueKey: string;
    method: Exclude<storage.RequestOptions['method'], undefined>;
    retryCount: number;
    json: string;
}

export class RequestQueueClient extends BaseClient implements storage.RequestQueueClient {
    name?: string;
    createdAt = new Date();
    accessedAt = new Date();
    modifiedAt = new Date();
    handledRequestCount = 0;
    pendingRequestCount = 0;
    requestQueueDirectory: string;

    private readonly requests = new Map<string, InternalRequest>();
    private readonly client: MemoryStorage;

    constructor(options: RequestQueueClientOptions) {
        super(options.id ?? randomUUID());
        this.name = options.name;
        this.requestQueueDirectory = resolve(options.baseStorageDirectory, this.name ?? this.id);
        this.client = options.client;
    }

    async get(): Promise<storage.RequestQueueInfo | undefined> {
        const found = await findRequestQueueByPossibleId(this.client, this.name ?? this.id);

        if (found) {
            found.updateTimestamps(false);
            return found.toRequestQueueInfo();
        }

        return undefined;
    }

    async update(newFields: { name?: string | undefined }): Promise<storage.RequestQueueInfo | undefined> {
        // The validation is intentionally loose to prevent issues
        // when swapping to a remote queue in production.
        const parsed = s.object({
            name: s.string.lengthGreaterThan(0).optional,
        }).passthrough.parse(newFields);

        const existingQueueById = await findRequestQueueByPossibleId(this.client, this.name ?? this.id);

        if (!existingQueueById) {
            this.throwOnNonExisting(StorageTypes.RequestQueue);
        }

        // Skip if no changes
        if (!parsed.name) {
            return existingQueueById.toRequestQueueInfo();
        }

        // Check that name is not in use already
        const existingQueueByName = this.client.requestQueuesHandled.find((queue) => queue.name?.toLowerCase() === parsed.name!.toLowerCase());

        if (existingQueueByName) {
            this.throwOnDuplicateEntry(StorageTypes.RequestQueue, 'name', parsed.name);
        }

        existingQueueById.name = parsed.name;

        const previousDir = existingQueueById.requestQueueDirectory;

        existingQueueById.requestQueueDirectory = resolve(this.client.requestQueuesDirectory, parsed.name ?? existingQueueById.name ?? existingQueueById.id);

        await move(previousDir, existingQueueById.requestQueueDirectory, { overwrite: true });

        // Update timestamps
        existingQueueById.updateTimestamps(true);

        return existingQueueById.toRequestQueueInfo();
    }

    async delete(): Promise<void> {
        const storeIndex = this.client.requestQueuesHandled.findIndex((queue) => queue.id === this.id);

        if (storeIndex !== -1) {
            const [oldClient] = this.client.requestQueuesHandled.splice(storeIndex, 1);
            oldClient.pendingRequestCount = 0;
            oldClient.requests.clear();

            await rm(oldClient.requestQueueDirectory, { recursive: true, force: true });
        }
    }

    async listHead(options: storage.ListOptions = {}): Promise<storage.QueueHead> {
        const { limit } = s.object({
            limit: s.number.optional.default(100),
        }).parse(options);

        const existingQueueById = await findRequestQueueByPossibleId(this.client, this.name ?? this.id);

        if (!existingQueueById) {
            this.throwOnNonExisting(StorageTypes.RequestQueue);
        }

        existingQueueById.updateTimestamps(false);

        const items = [];

        for (const request of existingQueueById.requests.values()) {
            if (items.length === limit) {
                break;
            }

            if (request.orderNo) {
                items.push(request);
            }
        }

        return {
            limit,
            hadMultipleClients: false,
            queueModifiedAt: existingQueueById.modifiedAt,
            items: items.map(({ json }) => this._jsonToRequest(json)!),
        };
    }

    async addRequest(request: storage.RequestSchema, options: storage.RequestOptions = {}): Promise<storage.QueueOperationInfo> {
        requestShapeWithoutId.parse(request);
        requestOptionsShape.parse(options);

        const existingQueueById = await findRequestQueueByPossibleId(this.client, this.name ?? this.id);

        if (!existingQueueById) {
            this.throwOnNonExisting(StorageTypes.RequestQueue);
        }

        const requestModel = this._createInternalRequest(request, options.forefront);

        const existingRequestWithId = existingQueueById.requests.get(requestModel.id);

        // We already have the request present, so we return information about it
        if (existingRequestWithId) {
            existingQueueById.updateTimestamps(false);

            return {
                requestId: existingRequestWithId.id,
                wasAlreadyHandled: existingRequestWithId.orderNo === null,
                wasAlreadyPresent: true,
            };
        }

        existingQueueById.requests.set(requestModel.id, requestModel);
        existingQueueById.pendingRequestCount += requestModel.orderNo === null ? 1 : 0;
        existingQueueById.updateTimestamps(true);
        existingQueueById.updateItem(requestModel);

        return {
            requestId: requestModel.id,
            // We return wasAlreadyHandled: false even though the request may
            // have been added as handled, because that's how API behaves.
            wasAlreadyHandled: false,
            wasAlreadyPresent: false,
        };
    }

    async batchAddRequests(requests: storage.RequestSchema[], options: storage.RequestOptions = {}): Promise<storage.BatchAddRequestsResult> {
        batchRequestShapeWithoutId.parse(requests);
        requestOptionsShape.parse(options);

        const existingQueueById = await findRequestQueueByPossibleId(this.client, this.name ?? this.id);

        if (!existingQueueById) {
            this.throwOnNonExisting(StorageTypes.RequestQueue);
        }

        const result: storage.BatchAddRequestsResult = {
            processedRequests: [],
            unprocessedRequests: [],
        };

        for (const model of requests) {
            const requestModel = this._createInternalRequest(model, options.forefront);

            const existingRequestWithId = existingQueueById.requests.get(requestModel.id);

            if (existingRequestWithId) {
                result.processedRequests.push({
                    requestId: existingRequestWithId.id,
                    uniqueKey: existingRequestWithId.uniqueKey,
                    wasAlreadyHandled: existingRequestWithId.orderNo === null,
                    wasAlreadyPresent: true,
                });

                continue;
            }

            existingQueueById.requests.set(requestModel.id, requestModel);
            existingQueueById.pendingRequestCount += requestModel.orderNo === null ? 1 : 0;
            result.processedRequests.push({
                requestId: requestModel.id,
                uniqueKey: requestModel.uniqueKey,
                // We return wasAlreadyHandled: false even though the request may
                // have been added as handled, because that's how API behaves.
                wasAlreadyHandled: false,
                wasAlreadyPresent: false,
            });
            existingQueueById.updateItem(requestModel);
        }

        existingQueueById.updateTimestamps(true);

        return result;
    }

    async getRequest(id: string): Promise<storage.RequestOptions | undefined> {
        s.string.parse(id);
        const existingQueueById = await findRequestQueueByPossibleId(this.client, this.name ?? this.id);

        if (!existingQueueById) {
            this.throwOnNonExisting(StorageTypes.RequestQueue);
        }

        existingQueueById.updateTimestamps(false);

        const json = existingQueueById.requests.get(id)?.json;
        return this._jsonToRequest(json);
    }

    async updateRequest(request: storage.UpdateRequestSchema, options: storage.RequestOptions = {}): Promise<storage.QueueOperationInfo> {
        requestShape.parse(request);
        requestOptionsShape.parse(options);

        const existingQueueById = await findRequestQueueByPossibleId(this.client, this.name ?? this.id);

        if (!existingQueueById) {
            this.throwOnNonExisting(StorageTypes.RequestQueue);
        }

        const requestModel = this._createInternalRequest(request, options.forefront);

        // First we need to check the existing request to be
        // able to return information about its handled state.

        const existingRequest = existingQueueById.requests.get(requestModel.id);

        // Undefined means that the request is not present in the queue.
        // We need to insert it, to behave the same as API.
        if (!existingRequest) {
            return this.addRequest(request, options);
        }

        // When updating the request, we need to make sure that
        // the handled counts are updated correctly in all cases.
        existingQueueById.requests.set(requestModel.id, requestModel);

        let handledCountAdjustment = 0;
        const isRequestHandledStateChanging = typeof existingRequest.orderNo !== typeof requestModel.orderNo;
        const requestWasHandledBeforeUpdate = existingRequest.orderNo === null;

        if (isRequestHandledStateChanging) handledCountAdjustment += 1;
        if (requestWasHandledBeforeUpdate) handledCountAdjustment = -handledCountAdjustment;

        existingQueueById.pendingRequestCount += handledCountAdjustment;
        existingQueueById.updateTimestamps(true);
        existingQueueById.updateItem(requestModel);

        return {
            requestId: requestModel.id,
            wasAlreadyHandled: requestWasHandledBeforeUpdate,
            wasAlreadyPresent: true,
        };
    }

    async deleteRequest(id: string): Promise<void> {
        const existingQueueById = await findRequestQueueByPossibleId(this.client, this.name ?? this.id);

        if (!existingQueueById) {
            this.throwOnNonExisting(StorageTypes.RequestQueue);
        }

        const request = existingQueueById.requests.get(id);

        if (request) {
            existingQueueById.requests.delete(id);
            existingQueueById.pendingRequestCount -= request.orderNo ? 1 : 0;
            existingQueueById.updateTimestamps(true);
            sendWorkerMessage({
                action: 'delete-entry',
                data: { id },
                entityType: 'requestQueues',
                entityDirectory: existingQueueById.requestQueueDirectory,
                id: existingQueueById.name ?? existingQueueById.id,
                writeMetadata: existingQueueById.client.writeMetadata,
                persistStorage: existingQueueById.client.persistStorage,
            });
        }
    }

    toRequestQueueInfo(): storage.RequestQueueInfo {
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

    private updateTimestamps(hasBeenModified: boolean) {
        this.accessedAt = new Date();

        if (hasBeenModified) {
            this.modifiedAt = new Date();
        }

        const data = this.toRequestQueueInfo();
        sendWorkerMessage({
            action: 'update-metadata',
            data,
            entityType: 'requestQueues',
            entityDirectory: this.requestQueueDirectory,
            id: this.name ?? this.id,
            writeMetadata: this.client.writeMetadata,
            persistStorage: this.client.persistStorage,
        });
    }

    private updateItem(item: InternalRequest) {
        sendWorkerMessage({
            action: 'update-entries',
            data: item,
            entityType: 'requestQueues',
            entityDirectory: this.requestQueueDirectory,
            id: this.name ?? this.id,
            writeMetadata: this.client.writeMetadata,
            persistStorage: this.client.persistStorage,
        });
    }

    private _jsonToRequest<T>(requestJson?: string): T | undefined {
        if (!requestJson) return undefined;
        const request = JSON.parse(requestJson);
        return purgeNullsFromObject(request);
    }

    private _createInternalRequest(request: storage.RequestSchema, forefront?: boolean): InternalRequest {
        const orderNo = this._calculateOrderNo(request, forefront);
        const id = uniqueKeyToRequestId(request.uniqueKey);

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

    private _calculateOrderNo(request: storage.RequestSchema, forefront?: boolean) {
        if (request.handledAt) return null;

        const timestamp = Date.now();

        return forefront ? -timestamp : timestamp;
    }
}
