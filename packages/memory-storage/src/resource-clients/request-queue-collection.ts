import type * as storage from '@crawlee/types';
import { s } from '@sapphire/shapeshift';
import { resolve } from 'node:path';
import { findRequestQueueByPossibleId } from '../cache-helpers';
import type { MemoryStorage } from '../index';
import { sendWorkerMessage } from '../workers/instance';
import { RequestQueueClient } from './request-queue';

export interface RequestQueueCollectionClientOptions {
    baseStorageDirectory: string;
    client: MemoryStorage;
}

export class RequestQueueCollectionClient implements storage.RequestQueueCollectionClient {
    private readonly requestQueuesDirectory: string;
    private readonly client: MemoryStorage;

    constructor({ baseStorageDirectory, client }: RequestQueueCollectionClientOptions) {
        this.requestQueuesDirectory = resolve(baseStorageDirectory);
        this.client = client;
    }

    async list(): ReturnType<storage.RequestQueueCollectionClient['list']> {
        return {
            total: this.client.requestQueuesHandled.length,
            count: this.client.requestQueuesHandled.length,
            offset: 0,
            limit: this.client.requestQueuesHandled.length,
            desc: false,
            items: this.client.requestQueuesHandled.map(
                (store) => store.toRequestQueueInfo())
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        };
    }

    async getOrCreate(name?: string): Promise<storage.RequestQueueInfo> {
        s.string.optional.parse(name);

        if (name) {
            const found = await findRequestQueueByPossibleId(this.client, name);

            if (found) {
                return found.toRequestQueueInfo();
            }
        }

        const newStore = new RequestQueueClient({ name, baseStorageDirectory: this.requestQueuesDirectory, client: this.client });
        this.client.requestQueuesHandled.push(newStore);

        // Schedule the worker to write to the disk
        const queueInfo = newStore.toRequestQueueInfo();
        // eslint-disable-next-line dot-notation
        sendWorkerMessage({
            action: 'update-metadata',
            entityType: 'requestQueues',
            entityDirectory: newStore.requestQueueDirectory,
            id: queueInfo.name ?? queueInfo.id,
            data: queueInfo,
            writeMetadata: this.client.writeMetadata,
            persistStorage: this.client.persistStorage,
        });

        return queueInfo;
    }
}
