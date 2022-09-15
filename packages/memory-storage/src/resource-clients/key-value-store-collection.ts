import type * as storage from '@crawlee/types';
import { s } from '@sapphire/shapeshift';
import { resolve } from 'node:path';
import { findOrCacheKeyValueStoreByPossibleId } from '../cache-helpers';
import type { MemoryStorage } from '../index';
import { sendWorkerMessage } from '../workers/instance';
import { KeyValueStoreClient } from './key-value-store';

export interface KeyValueStoreCollectionClientOptions {
    baseStorageDirectory: string;
    client: MemoryStorage;
}

export class KeyValueStoreCollectionClient implements storage.KeyValueStoreCollectionClient {
    private readonly keyValueStoresDirectory: string;
    private readonly client: MemoryStorage;

    constructor({ baseStorageDirectory, client }: KeyValueStoreCollectionClientOptions) {
        this.keyValueStoresDirectory = resolve(baseStorageDirectory);
        this.client = client;
    }

    async list(): ReturnType<storage.KeyValueStoreCollectionClient['list']> {
        return {
            total: this.client.keyValueStoresHandled.length,
            count: this.client.keyValueStoresHandled.length,
            offset: 0,
            limit: this.client.keyValueStoresHandled.length,
            desc: false,
            items: this.client.keyValueStoresHandled.map(
                (store) => store.toKeyValueStoreInfo())
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        };
    }

    async getOrCreate(name?: string): Promise<storage.KeyValueStoreInfo> {
        s.string.optional.parse(name);

        if (name) {
            const found = await findOrCacheKeyValueStoreByPossibleId(this.client, name);

            if (found) {
                return found.toKeyValueStoreInfo();
            }
        }

        const newStore = new KeyValueStoreClient({ name, baseStorageDirectory: this.keyValueStoresDirectory, client: this.client });
        this.client.keyValueStoresHandled.push(newStore);

        // Schedule the worker to write to the disk
        const kvStoreInfo = newStore.toKeyValueStoreInfo();
        // eslint-disable-next-line dot-notation
        sendWorkerMessage({
            action: 'update-metadata',
            entityType: 'keyValueStores',
            entityDirectory: newStore.keyValueStoreDirectory,
            id: kvStoreInfo.name ?? kvStoreInfo.id,
            data: kvStoreInfo,
            writeMetadata: this.client.writeMetadata,
            persistStorage: this.client.persistStorage,
        });

        return kvStoreInfo;
    }
}
