import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';

import type * as storage from '@crawlee/types';
import { s } from '@sapphire/shapeshift';
import { move } from 'fs-extra';
import mime from 'mime-types';

import { scheduleBackgroundTask } from '../background-handler';
import { maybeParseBody } from '../body-parser';
import { findOrCacheKeyValueStoreByPossibleId } from '../cache-helpers';
import { DEFAULT_API_PARAM_LIMIT, StorageTypes } from '../consts';
import type { StorageImplementation } from '../fs/common';
import { createKeyValueStorageImplementation } from '../fs/key-value-store';
import type { MemoryStorage } from '../index';
import { createKeyList, createKeyStringList, isBuffer, isStream } from '../utils';
import { BaseClient } from './common/base-client';

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
        const parsed = s
            .object({
                name: s.string.lengthGreaterThan(0).optional,
            })
            .parse(newFields);

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
        const existingStoreByName = this.client.keyValueStoresHandled.find(
            (store) => store.name?.toLowerCase() === parsed.name!.toLowerCase(),
        );

        if (existingStoreByName) {
            this.throwOnDuplicateEntry(StorageTypes.KeyValueStore, 'name', parsed.name);
        }

        existingStoreById.name = parsed.name;

        const previousDir = existingStoreById.keyValueStoreDirectory;

        existingStoreById.keyValueStoreDirectory = resolve(
            this.client.keyValueStoresDirectory,
            parsed.name ?? existingStoreById.name ?? existingStoreById.id,
        );

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

    listKeys(
        options: storage.KeyValueStoreClientListOptions = {},
    ): AsyncIterable<storage.KeyValueStoreItemData> & Promise<storage.KeyValueStoreClientListData> {
        const { limit, exclusiveStartKey, prefix } = s
            .object({
                limit: s.number.greaterThan(0).optional,
                exclusiveStartKey: s.string.optional,
                collection: s.string.optional, // This is ignored, but kept for validation consistency with API client.
                prefix: s.string.optional,
            })
            .parse(options);

        return createKeyList(
            (pageExclusiveStartKey) =>
                this.listKeysPage({
                    limit: limit ?? DEFAULT_API_PARAM_LIMIT,
                    exclusiveStartKey: pageExclusiveStartKey,
                    prefix,
                }),
            { exclusiveStartKey, limit },
        );
    }

    keys(
        options: storage.KeyValueStoreClientListOptions = {},
    ): AsyncIterable<string> & Promise<storage.KeyValueStoreClientListData> {
        const { limit, exclusiveStartKey, prefix } = s
            .object({
                limit: s.number.greaterThan(0).optional,
                exclusiveStartKey: s.string.optional,
                collection: s.string.optional,
                prefix: s.string.optional,
            })
            .parse(options);

        return createKeyStringList(
            (pageExclusiveStartKey) =>
                this.listKeysPage({
                    limit: limit ?? DEFAULT_API_PARAM_LIMIT,
                    exclusiveStartKey: pageExclusiveStartKey,
                    prefix,
                }),
            { exclusiveStartKey, limit },
        );
    }

    values(options: storage.KeyValueStoreClientListOptions = {}): AsyncIterable<unknown> & Promise<unknown[]> {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;

        // Fetch first page of keys and their values for the Promise
        const firstPagePromise = (async () => {
            const firstPageKeys = await self.keys(options);
            const values: unknown[] = [];
            for (const item of firstPageKeys.items) {
                const record = await self.getRecord(item.key);
                if (record) {
                    values.push(record.value);
                }
            }
            return values;
        })();

        async function* asyncGenerator(): AsyncGenerator<unknown> {
            for await (const key of self.keys(options)) {
                const record = await self.getRecord(key);
                if (record) {
                    yield record.value;
                }
            }
        }

        return Object.defineProperty(firstPagePromise, Symbol.asyncIterator, {
            value: asyncGenerator,
        }) as AsyncIterable<unknown> & Promise<unknown[]>;
    }

    entries(
        options: storage.KeyValueStoreClientListOptions = {},
    ): AsyncIterable<[string, unknown]> & Promise<[string, unknown][]> {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;

        // Fetch first page of keys and their values for the Promise
        const firstPagePromise = (async () => {
            const firstPageKeys = await self.keys(options);
            const entries: [string, unknown][] = [];
            for (const item of firstPageKeys.items) {
                const record = await self.getRecord(item.key);
                if (record) {
                    entries.push([item.key, record.value]);
                }
            }
            return entries;
        })();

        async function* asyncGenerator(): AsyncGenerator<[string, unknown]> {
            for await (const key of self.keys(options)) {
                const record = await self.getRecord(key);
                if (record) {
                    yield [key, record.value];
                }
            }
        }

        return Object.defineProperty(firstPagePromise, Symbol.asyncIterator, {
            value: asyncGenerator,
        }) as AsyncIterable<[string, unknown]> & Promise<[string, unknown][]>;
    }

    private async listKeysPage(
        options: storage.KeyValueStoreClientListOptions = {},
    ): Promise<storage.KeyValueStoreClientListData> {
        const { limit = DEFAULT_API_PARAM_LIMIT, exclusiveStartKey, prefix } = options;

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

        const filteredItems = items.filter((item) => !prefix || item.key.startsWith(prefix));

        let truncatedItems = filteredItems;
        if (exclusiveStartKey) {
            const keyPos = filteredItems.findIndex((item) => item.key === exclusiveStartKey);
            if (keyPos !== -1) truncatedItems = filteredItems.slice(keyPos + 1);
        }

        const limitedItems = truncatedItems.slice(0, limit);

        const lastItemInStore = filteredItems.at(-1);
        const lastSelectedItem = limitedItems.at(-1);
        const isLastSelectedItemAbsolutelyLast = lastItemInStore === lastSelectedItem;
        const nextExclusiveStartKey = isLastSelectedItemAbsolutelyLast ? undefined : lastSelectedItem?.key;

        existingStoreById.updateTimestamps(false);

        return {
            count: limitedItems.length,
            limit,
            exclusiveStartKey,
            isTruncated: !isLastSelectedItemAbsolutelyLast,
            nextExclusiveStartKey,
            items: limitedItems,
        };
    }

    /**
     * Tests whether a record with the given key exists in the key-value store without retrieving its value.
     *
     * @param key The queried record key.
     * @returns `true` if the record exists, `false` if it does not.
     */
    async recordExists(key: string): Promise<boolean> {
        s.string.parse(key);

        // Check by id
        const existingStoreById = await findOrCacheKeyValueStoreByPossibleId(this.client, this.name ?? this.id);

        if (!existingStoreById) {
            this.throwOnNonExisting(StorageTypes.KeyValueStore);
        }

        return existingStoreById.keyValueEntries.has(key);
    }

    async getRecord(
        key: string,
        options: storage.KeyValueStoreClientGetRecordOptions = {},
    ): Promise<storage.KeyValueStoreRecord | undefined> {
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
            contentType: entry.contentType ?? (mime.contentType(entry.extension) as string),
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
            value: s.union(
                s.null,
                s.string,
                s.number,
                s.instance(Buffer),
                s.instance(ArrayBuffer),
                s.typedArray(),
                // disabling validation will make shapeshift only check the object given is an actual object, not null, nor array
                s
                    .object({})
                    .setValidationEnabled(false),
            ),
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
        scheduleBackgroundTask({
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
