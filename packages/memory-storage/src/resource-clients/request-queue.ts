import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import type * as storage from '@crawlee/types';
import { AsyncQueue } from '@sapphire/async-queue';
import { s } from '@sapphire/shapeshift';
import { move } from 'fs-extra';
import type { RequestQueueFileSystemEntry } from 'packages/memory-storage/src/fs/request-queue/fs';
import type { RequestQueueMemoryEntry } from 'packages/memory-storage/src/fs/request-queue/memory';

import { scheduleBackgroundTask } from '../background-handler';
import { findRequestQueueByPossibleId } from '../cache-helpers';
import { StorageTypes } from '../consts';
import { createRequestQueueStorageImplementation } from '../fs/request-queue';
import type { MemoryStorage } from '../index';
import { purgeNullsFromObject, uniqueKeyToRequestId } from '../utils';
import { BaseClient } from './common/base-client';

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
    private readonly mutex = new AsyncQueue();
    private forefrontRequestIds: string[] = [];

    private readonly requests = new Map<string, RequestQueueFileSystemEntry | RequestQueueMemoryEntry>();
    private readonly client: MemoryStorage;

    constructor(options: RequestQueueClientOptions) {
        super(options.id ?? randomUUID());
        this.name = options.name;
        this.requestQueueDirectory = resolve(options.baseStorageDirectory, this.name ?? this.id);
        this.client = options.client;
    }

    private async getQueue(): Promise<RequestQueueClient> {
        const existingQueueById = await findRequestQueueByPossibleId(this.client, this.name ?? this.id);

        if (!existingQueueById) {
            this.throwOnNonExisting(StorageTypes.RequestQueue);
        }

        existingQueueById.updateTimestamps(false);

        return existingQueueById;
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
        const parsed = s
            .object({
                name: s.string.lengthGreaterThan(0).optional,
            })
            .passthrough.parse(newFields);

        const existingQueueById = await findRequestQueueByPossibleId(this.client, this.name ?? this.id);

        if (!existingQueueById) {
            this.throwOnNonExisting(StorageTypes.RequestQueue);
        }

        // Skip if no changes
        if (!parsed.name) {
            return existingQueueById.toRequestQueueInfo();
        }

        // Check that name is not in use already
        const existingQueueByName = this.client.requestQueuesHandled.find(
            (queue) => queue.name?.toLowerCase() === parsed.name!.toLowerCase(),
        );

        if (existingQueueByName) {
            this.throwOnDuplicateEntry(StorageTypes.RequestQueue, 'name', parsed.name);
        }

        existingQueueById.name = parsed.name;

        const previousDir = existingQueueById.requestQueueDirectory;

        existingQueueById.requestQueueDirectory = resolve(
            this.client.requestQueuesDirectory,
            parsed.name ?? existingQueueById.name ?? existingQueueById.id,
        );

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

    private *requestKeyIterator(rqClient: RequestQueueClient): IterableIterator<string> {
        for (let i = this.forefrontRequestIds.length - 1; i >= 0; i--) {
            yield this.forefrontRequestIds[i];
        }

        for (const key of rqClient.requests.keys()) {
            yield key;
        }
    }

    async listHead(options: storage.ListOptions = {}): Promise<storage.QueueHead> {
        const { limit } = s
            .object({
                limit: s.number.optional.default(100),
            })
            .parse(options);

        const existingQueueById = await findRequestQueueByPossibleId(this.client, this.name ?? this.id);

        if (!existingQueueById) {
            this.throwOnNonExisting(StorageTypes.RequestQueue);
        }

        existingQueueById.updateTimestamps(false);

        const items = [];

        // Tracks processed request IDs to avoid duplicates when a request is in both `forefrontRequestIds` and `requests`.
        const seenRequestIds = new Set<string>();
        // Tracks handled request IDs from `forefrontRequestIds` to be removed.
        const handledForefrontIds = new Set<string>();

        for (const requestId of this.requestKeyIterator(existingQueueById)) {
            if (items.length === limit) {
                break;
            }

            if (seenRequestIds.has(requestId)) {
                continue;
            }

            seenRequestIds.add(requestId);

            const storageEntry = existingQueueById.requests.get(requestId)!;

            let { orderNo } = storageEntry;
            let loaded: InternalRequest;

            // Uncached entry
            if (typeof orderNo === 'undefined') {
                loaded = await storageEntry.get();

                orderNo = loaded.orderNo;
            }

            // Have an order no -> fetch from fs/memory and return
            if (orderNo) {
                items.push(await storageEntry.get());
            } else if (this.forefrontRequestIds.includes(requestId)) {
                handledForefrontIds.add(requestId);
            }
        }

        this.forefrontRequestIds = this.forefrontRequestIds.filter((id) => !handledForefrontIds.has(id));

        return {
            limit,
            hadMultipleClients: false,
            queueModifiedAt: existingQueueById.modifiedAt,
            items: items.sort((a, b) => a.orderNo! - b.orderNo!).map(({ json }) => this._jsonToRequest(json)!),
        };
    }

    async listAndLockHead(options: storage.ListAndLockOptions): Promise<storage.ListAndLockHeadResult> {
        const { limit, lockSecs } = s
            .object({
                limit: s.number.lessThanOrEqual(25).optional.default(25),
                lockSecs: s.number,
            })
            .parse(options);

        const queue = await this.getQueue();

        const start = Date.now();
        const isLocked = (request: InternalRequest) =>
            !request.orderNo || request.orderNo > start || request.orderNo < -start;

        const items = [];

        await queue.mutex.wait();

        try {
            // Tracks processed request IDs to avoid duplicates (when a request is in both `forefrontRequestIds` and `requests`).
            const seenRequestIds = new Set<string>();
            // Tracks handled request IDs from `forefrontRequestIds` (to be all removed at once).
            const handledForefrontIds = new Set<string>();

            for (const requestId of this.requestKeyIterator(queue)) {
                if (items.length === limit) {
                    break;
                }

                if (seenRequestIds.has(requestId)) {
                    continue;
                }

                seenRequestIds.add(requestId);

                const storageEntry = queue.requests.get(requestId)!;

                // This is set to null when the request has been handled, so we don't need to re-fetch from fs
                if (storageEntry.orderNo === null) {
                    if (this.forefrontRequestIds.includes(requestId)) {
                        handledForefrontIds.add(requestId);
                    }
                    continue;
                }

                // Always fetch from fs, as this also locks and we do not want to end up in a state where another process locked the request but we have cached it as unlocked
                const request = await storageEntry.get(true);

                if (isLocked(request)) {
                    continue;
                }

                request.orderNo = (start + lockSecs * 1000) * (request.orderNo! > 0 ? 1 : -1);
                await storageEntry.update(request);

                items.push(request);
            }

            this.forefrontRequestIds = this.forefrontRequestIds.filter((id) => !handledForefrontIds.has(id));

            return {
                limit,
                lockSecs,
                hadMultipleClients: false,
                queueModifiedAt: queue.modifiedAt,
                items: items.map(({ json }) => this._jsonToRequest(json)!),
            };
        } finally {
            queue.mutex.shift();
        }
    }

    async prolongRequestLock(
        id: string,
        options: storage.ProlongRequestLockOptions,
    ): Promise<storage.ProlongRequestLockResult> {
        s.string.parse(id);
        const { lockSecs, forefront } = s
            .object({
                lockSecs: s.number,
                forefront: s.boolean.optional.default(false),
            })
            .parse(options);

        const queue = await this.getQueue();
        const request = queue.requests.get(id);

        const internalRequest = await request?.get();

        if (!internalRequest) {
            throw new Error(`Request with ID ${id} not found in queue ${queue.name ?? queue.id}`);
        }

        const canProlong = (r: InternalRequest) => !!r.orderNo;

        if (!canProlong(internalRequest)) {
            throw new Error(`Request with ID ${id} has already been handled in queue ${queue.name ?? queue.id}`);
        }

        const unlockTimestamp = Math.abs(internalRequest.orderNo!) + lockSecs * 1000;
        internalRequest.orderNo = forefront ? -unlockTimestamp : unlockTimestamp;

        await request?.update(internalRequest);
        if (forefront) this.forefrontRequestIds.push(id);

        return {
            lockExpiresAt: new Date(unlockTimestamp),
        };
    }

    async deleteRequestLock(id: string, options: storage.DeleteRequestLockOptions = {}): Promise<void> {
        s.string.parse(id);
        const { forefront } = s
            .object({
                forefront: s.boolean.optional.default(false),
            })
            .parse(options);

        const queue = await this.getQueue();
        const request = queue.requests.get(id);

        const internalRequest = await request?.get();

        if (!internalRequest) {
            throw new Error(`Request with ID ${id} not found in queue ${queue.name ?? queue.id}`);
        }

        const start = Date.now();

        // If there is no `orderNo` -> request was marked as handled
        const isLocked = (r: InternalRequest) => r.orderNo && (r.orderNo > start || r.orderNo < -start);
        if (!isLocked(internalRequest)) {
            throw new Error(`Request with ID ${id} is not locked in queue ${queue.name ?? queue.id}`);
        }

        internalRequest.orderNo = forefront ? -start : start;
        if (forefront) this.forefrontRequestIds.push(id);

        await request?.update(internalRequest);
    }

    async addRequest(
        request: storage.RequestSchema,
        options: storage.RequestOptions = {},
    ): Promise<storage.QueueOperationInfo> {
        requestShapeWithoutId.parse(request);
        requestOptionsShape.parse(options);

        const existingQueueById = await findRequestQueueByPossibleId(this.client, this.name ?? this.id);

        if (!existingQueueById) {
            this.throwOnNonExisting(StorageTypes.RequestQueue);
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

        const newEntry = createRequestQueueStorageImplementation({
            persistStorage: existingQueueById.client.persistStorage,
            requestId: requestModel.id,
            storeDirectory: existingQueueById.requestQueueDirectory,
        });

        await newEntry.update(requestModel);

        existingQueueById.requests.set(requestModel.id, newEntry);
        existingQueueById.updateTimestamps(true);

        if (requestModel.orderNo) {
            existingQueueById.pendingRequestCount += 1;
        } else {
            existingQueueById.handledRequestCount += 1;
        }

        if (options.forefront) {
            this.forefrontRequestIds.push(requestModel.id);
        }

        return {
            requestId: requestModel.id,
            // We return wasAlreadyHandled: false even though the request may
            // have been added as handled, because that's how API behaves.
            wasAlreadyHandled: false,
            wasAlreadyPresent: false,
        };
    }

    async batchAddRequests(
        requests: storage.RequestSchema[],
        options: storage.RequestOptions = {},
    ): Promise<storage.BatchAddRequestsResult> {
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

            const newEntry = createRequestQueueStorageImplementation({
                persistStorage: existingQueueById.client.persistStorage,
                requestId: requestModel.id,
                storeDirectory: existingQueueById.requestQueueDirectory,
            });

            await newEntry.update(requestModel);

            existingQueueById.requests.set(requestModel.id, newEntry);

            if (requestModel.orderNo) {
                existingQueueById.pendingRequestCount += 1;
            } else {
                existingQueueById.handledRequestCount += 1;
            }

            if (options.forefront) {
                this.forefrontRequestIds.push(requestModel.id);
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

    async getRequest(id: string): Promise<storage.RequestOptions | undefined> {
        s.string.parse(id);
        const queue = await this.getQueue();
        const json = (await queue.requests.get(id)?.get())?.json;
        return this._jsonToRequest(json);
    }

    async updateRequest(
        request: storage.UpdateRequestSchema,
        options: storage.RequestOptions = {},
    ): Promise<storage.QueueOperationInfo> {
        requestShape.parse(request);
        requestOptionsShape.parse(options);

        const existingQueueById = await findRequestQueueByPossibleId(this.client, this.name ?? this.id);

        if (!existingQueueById) {
            this.throwOnNonExisting(StorageTypes.RequestQueue);
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

        const newEntry = createRequestQueueStorageImplementation({
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

        if (options.forefront && !requestIsHandledAfterUpdate) {
            this.forefrontRequestIds.push(requestModel.id);
        }

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

        const entry = existingQueueById.requests.get(id);

        if (entry) {
            const request = await entry.get();

            existingQueueById.requests.delete(id);
            existingQueueById.updateTimestamps(true);

            if (request.orderNo) {
                existingQueueById.pendingRequestCount -= 1;
            } else {
                existingQueueById.handledRequestCount -= 1;
            }

            await entry.delete();
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

        const data = {
            ...this.toRequestQueueInfo(),
            forefrontRequestIds: this.forefrontRequestIds,
        };

        scheduleBackgroundTask({
            action: 'update-metadata',
            data,
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
