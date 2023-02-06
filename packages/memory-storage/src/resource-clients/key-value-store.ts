import type * as storage from '@crawlee/types';
import { s } from '@sapphire/shapeshift';
import mime from 'mime-types';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import { move } from 'fs-extra';
import type { MemoryStorage } from '../index';
import { maybeParseBody } from '../body-parser';
import { DEFAULT_API_PARAM_LIMIT, StorageTypes } from '../consts';
import { isBuffer, isStream } from '../utils';
import { BaseClient } from './common/base-client';
import { sendWorkerMessage } from '../workers/instance';
import { findOrCacheKeyValueStoreByPossibleId } from '../cache-helpers';
import type { StorageImplementation } from '../fs/common';
import { createKeyValueStorageImplementation } from '../fs/key-value-store';

const DEFAULT_LOCAL_FILE_EXTENSION = 'bin';

export interface KeyValueStoreClientOptions {
    name?: string;
    id?: string;
    baseStorageDirectory: string;
    client: MemoryStorage;
}

export interface InternalKeyRecord {
    key: string;
    value: Buffer | string;
    contentType?: string;
    extension: string;
}

export class KeyValueStoreClient extends BaseClient {
    name?: string;
    createdAt = new Date();
    accessedAt = new Date();
    modifiedAt = new Date();
    keyValueStoreDirectory: string;

    private readonly keyValueEntries = new Map<string, StorageImplementation<InternalKeyRecord>>();
    private readonly client: MemoryStorage;

    constructor(options: KeyValueStoreClientOptions) {
        super(options.id ?? randomUUID());
        this.name = options.name;
        this.keyValueStoreDirectory = resolve(options.baseStorageDirectory, this.name ?? this.id);
        this.client = options.client;
    }

    async get(): Promise<storage.KeyValueStoreInfo | undefined> {
        const found = await findOrCacheKeyValueStoreByPossibleId(this.client, this.name ?? this.id);

        if (found) {
            found.updateTimestamps(false);
            return found.toKeyValueStoreInfo();
        }

        return undefined;
    }

    async update(newFields: storage.KeyValueStoreClientUpdateOptions = {}): Promise<storage.KeyValueStoreInfo> {
        const parsed = s.object({
            name: s.string.lengthGreaterThan(0).optional,
        }).parse(newFields);

        // Check by id
        const existingStoreById = await findOrCacheKeyValueStoreByPossibleId(this.client, this.name ?? this.id);

        if (!existingStoreById) {
            this.throwOnNonExisting(StorageTypes.KeyValueStore);
        }

        // Skip if no changes
        if (!parsed.name) {
            return existingStoreById.toKeyValueStoreInfo();
        }

        // Check that name is not in use already
        const existingStoreByName = this.client.keyValueStoresHandled.find((store) => store.name?.toLowerCase() === parsed.name!.toLowerCase());

        if (existingStoreByName) {
            this.throwOnDuplicateEntry(StorageTypes.KeyValueStore, 'name', parsed.name);
        }

        existingStoreById.name = parsed.name;

        const previousDir = existingStoreById.keyValueStoreDirectory;

        existingStoreById.keyValueStoreDirectory = resolve(this.client.keyValueStoresDirectory, parsed.name ?? existingStoreById.name ?? existingStoreById.id);

        await move(previousDir, existingStoreById.keyValueStoreDirectory, { overwrite: true });

        // Update timestamps
        existingStoreById.updateTimestamps(true);

        return existingStoreById.toKeyValueStoreInfo();
    }

    async delete(): Promise<void> {
        const storeIndex = this.client.keyValueStoresHandled.findIndex((store) => store.id === this.id);

        if (storeIndex !== -1) {
            const [oldClient] = this.client.keyValueStoresHandled.splice(storeIndex, 1);
            oldClient.keyValueEntries.clear();

            await rm(oldClient.keyValueStoreDirectory, { recursive: true, force: true });
        }
    }

    async listKeys(options: storage.KeyValueStoreClientListOptions = {}): Promise<storage.KeyValueStoreClientListData> {
        const {
            limit = DEFAULT_API_PARAM_LIMIT,
            exclusiveStartKey,
        } = s.object({
            limit: s.number.greaterThan(0).optional,
            exclusiveStartKey: s.string.optional,
        }).parse(options);

        // Check by id
        const existingStoreById = await findOrCacheKeyValueStoreByPossibleId(this.client, this.name ?? this.id);

        if (!existingStoreById) {
            this.throwOnNonExisting(StorageTypes.KeyValueStore);
        }

        const items = [];

        for (const storageEntry of existingStoreById.keyValueEntries.values()) {
            const record = await storageEntry.get();

            const size = Buffer.byteLength(record.value);
            items.push({
                key: record.key,
                size,
            });
        }

        // Lexically sort to emulate API.
        // TODO(vladfrangu): ensure the sorting works the same way as before (if it matters)
        items.sort((a, b) => {
            return a.key.localeCompare(b.key);
        });

        let truncatedItems = items;
        if (exclusiveStartKey) {
            const keyPos = items.findIndex((item) => item.key === exclusiveStartKey);
            if (keyPos !== -1) truncatedItems = items.slice(keyPos + 1);
        }

        const limitedItems = truncatedItems.slice(0, limit);

        const lastItemInStore = items[items.length - 1];
        const lastSelectedItem = limitedItems[limitedItems.length - 1];
        const isLastSelectedItemAbsolutelyLast = lastItemInStore === lastSelectedItem;
        const nextExclusiveStartKey = isLastSelectedItemAbsolutelyLast
            ? undefined
            : lastSelectedItem.key;

        existingStoreById.updateTimestamps(false);

        return {
            count: items.length,
            limit,
            exclusiveStartKey,
            isTruncated: !isLastSelectedItemAbsolutelyLast,
            nextExclusiveStartKey,
            items: limitedItems,
        };
    }

    async getRecord(key: string, options: storage.KeyValueStoreClientGetRecordOptions = {}): Promise<storage.KeyValueStoreRecord | undefined> {
        s.string.parse(key);
        s.object({
            buffer: s.boolean.optional,
            // These options are ignored, but kept here
            // for validation consistency with API client.
            stream: s.boolean.optional,
            disableRedirect: s.boolean.optional,
        }).parse(options);

        // Check by id
        const existingStoreById = await findOrCacheKeyValueStoreByPossibleId(this.client, this.name ?? this.id);

        if (!existingStoreById) {
            this.throwOnNonExisting(StorageTypes.KeyValueStore);
        }

        const storageEntry = existingStoreById.keyValueEntries.get(key);

        if (!storageEntry) {
            return undefined;
        }

        const entry = await storageEntry.get();

        const record: storage.KeyValueStoreRecord = {
            key: entry.key,
            value: entry.value,
            contentType: entry.contentType ?? mime.contentType(entry.extension) as string,
        };

        if (options.stream) {
            record.value = Readable.from(record.value);
        } else if (options.buffer) {
            record.value = Buffer.from(record.value);
        } else {
            record.value = maybeParseBody(record.value, record.contentType!);
        }

        existingStoreById.updateTimestamps(false);

        return record;
    }

    async setRecord(record: storage.KeyValueStoreRecord): Promise<void> {
        s.object({
            key: s.string.lengthGreaterThan(0),
            value: s.union(s.null, s.string, s.number, s.instance(Buffer), s.object({}).passthrough),
            contentType: s.string.lengthGreaterThan(0).optional,
        }).parse(record);

        // Check by id
        const existingStoreById = await findOrCacheKeyValueStoreByPossibleId(this.client, this.name ?? this.id);

        if (!existingStoreById) {
            this.throwOnNonExisting(StorageTypes.KeyValueStore);
        }

        const { key } = record;
        let { value, contentType } = record;

        const valueIsStream = isStream(value);

        const isValueStreamOrBuffer = valueIsStream || isBuffer(value);
        // To allow saving Objects to JSON without providing content type
        if (!contentType) {
            if (isValueStreamOrBuffer) contentType = 'application/octet-stream';
            else if (typeof value === 'string') contentType = 'text/plain; charset=utf-8';
            else contentType = 'application/json; charset=utf-8';
        }

        const extension = mime.extension(contentType) || DEFAULT_LOCAL_FILE_EXTENSION;

        const isContentTypeJson = extension === 'json';

        if (isContentTypeJson && !isValueStreamOrBuffer && typeof value !== 'string') {
            try {
                value = JSON.stringify(value, null, 2);
            } catch (err: any) {
                const msg = `The record value cannot be stringified to JSON. Please provide other content type.\nCause: ${err.message}`;
                throw new Error(msg);
            }
        }

        if (valueIsStream) {
            const chunks = [];
            for await (const chunk of value) {
                chunks.push(chunk);
            }
            value = Buffer.concat(chunks);
        }

        const _record = {
            extension,
            key,
            value,
            contentType,
        } satisfies InternalKeyRecord;

        const entry = createKeyValueStorageImplementation({
            persistStorage: this.client.persistStorage,
            storeDirectory: existingStoreById.keyValueStoreDirectory,
            writeMetadata: existingStoreById.client.writeMetadata,
        });

        await entry.update(_record);

        existingStoreById.keyValueEntries.set(key, entry);

        existingStoreById.updateTimestamps(true);
    }

    async deleteRecord(key: string): Promise<void> {
        s.string.parse(key);

        // Check by id
        const existingStoreById = await findOrCacheKeyValueStoreByPossibleId(this.client, this.name ?? this.id);

        if (!existingStoreById) {
            this.throwOnNonExisting(StorageTypes.KeyValueStore);
        }

        const entry = existingStoreById.keyValueEntries.get(key);

        if (entry) {
            existingStoreById.keyValueEntries.delete(key);
            existingStoreById.updateTimestamps(true);
            await entry.delete();
        }
    }

    toKeyValueStoreInfo(): storage.KeyValueStoreInfo {
        return {
            id: this.id,
            name: this.name,
            accessedAt: this.accessedAt,
            createdAt: this.createdAt,
            modifiedAt: this.modifiedAt,
            userId: '1',
        };
    }

    private updateTimestamps(hasBeenModified: boolean) {
        this.accessedAt = new Date();

        if (hasBeenModified) {
            this.modifiedAt = new Date();
        }

        const data = this.toKeyValueStoreInfo();
        sendWorkerMessage({
            action: 'update-metadata',
            data,
            entityType: 'keyValueStores',
            entityDirectory: this.keyValueStoreDirectory,
            id: this.name ?? this.id,
            writeMetadata: this.client.writeMetadata,
            persistStorage: this.client.persistStorage,
        });
    }
}
