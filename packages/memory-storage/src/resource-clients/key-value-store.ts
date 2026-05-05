import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import type * as storage from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import { scheduleBackgroundTask } from '../background-handler/index.js';
import { maybeParseBody } from '../body-parser.js';
import { findOrCacheKeyValueStoreByPossibleId } from '../cache-helpers.js';
import { StorageTypes } from '../consts.js';
import type { StorageImplementation } from '../fs/common.js';
import { createKeyValueStorageImplementation } from '../fs/key-value-store/index.js';
import type { MemoryStorage } from '../index.js';
import { isBuffer, isStream } from '../utils.js';
import { BaseClient } from './common/base-client.js';
import mime from 'mime-types';

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
    filePath?: string;
}

export class KeyValueStoreClient extends BaseClient implements storage.KeyValueStoreClient {
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

    async getMetadata(): Promise<storage.KeyValueStoreInfo> {
        const found = await findOrCacheKeyValueStoreByPossibleId(this.client, this.name ?? this.id);

        if (found) {
            found.updateTimestamps(false);
            return found.toKeyValueStoreInfo();
        }

        return this.toKeyValueStoreInfo();
    }

    async drop(): Promise<void> {
        const storeIndex = this.client.keyValueStoreCache.findIndex((store) => store.id === this.id);

        if (storeIndex !== -1) {
            const [oldClient] = this.client.keyValueStoreCache.splice(storeIndex, 1);
            oldClient.keyValueEntries.clear();

            await rm(oldClient.keyValueStoreDirectory, { recursive: true, force: true });
        }
    }

    async purge(): Promise<void> {
        const existingStoreById = await findOrCacheKeyValueStoreByPossibleId(this.client, this.name ?? this.id);

        if (!existingStoreById) {
            this.throwOnNonExisting(StorageTypes.KeyValueStore);
        }

        // Delete all entries
        const entriesToDelete = [...existingStoreById.keyValueEntries.entries()];
        for (const [key, entry] of entriesToDelete) {
            existingStoreById.keyValueEntries.delete(key);
            await entry.delete();
        }

        existingStoreById.updateTimestamps(true);
    }

    async *iterateKeys(
        options: storage.KeyValueStoreIterateKeysOptions = {},
    ): AsyncIterable<storage.KeyValueStoreItemData> {
        const { prefix } = s
            .object({
                prefix: s.string().optional(),
            })
            .parse(options);

        // Check by id
        const existingStoreById = await findOrCacheKeyValueStoreByPossibleId(this.client, this.name ?? this.id);

        if (!existingStoreById) {
            this.throwOnNonExisting(StorageTypes.KeyValueStore);
        }

        const items: storage.KeyValueStoreItemData[] = [];

        for (const storageEntry of existingStoreById.keyValueEntries.values()) {
            const record = await storageEntry.get();

            const size = Buffer.byteLength(record.value);
            items.push({
                key: record.key,
                size,
            });
        }

        // Lexically sort to emulate API.
        items.sort((a, b) => a.key.localeCompare(b.key));

        const filteredItems = items.filter((item) => !prefix || item.key.startsWith(prefix));

        existingStoreById.updateTimestamps(false);

        for (const item of filteredItems) {
            yield item;
        }
    }

    /**
     * Generates a public file:// URL for accessing a specific record in the key-value store.
     *
     * Returns `undefined` if the record does not exist or has no associated file path (i.e., it is not stored as a file).
     * @param key The key of the record to generate the public URL for.
     */
    async getPublicUrl(key: string): Promise<string | undefined> {
        s.string().parse(key);

        // Check by id
        const existingStoreById = await findOrCacheKeyValueStoreByPossibleId(this.client, this.name ?? this.id);

        if (!existingStoreById) {
            this.throwOnNonExisting(StorageTypes.KeyValueStore);
        }

        const storageEntry = await existingStoreById.keyValueEntries.get(key)?.get();

        return storageEntry?.filePath;
    }

    /**
     * Tests whether a record with the given key exists in the key-value store without retrieving its value.
     *
     * @param key The queried record key.
     * @returns `true` if the record exists, `false` if it does not.
     */
    async recordExists(key: string): Promise<boolean> {
        s.string().parse(key);

        // Check by id
        const existingStoreById = await findOrCacheKeyValueStoreByPossibleId(this.client, this.name ?? this.id);

        if (!existingStoreById) {
            this.throwOnNonExisting(StorageTypes.KeyValueStore);
        }

        return existingStoreById.keyValueEntries.has(key);
    }

    async getValue(key: string): Promise<storage.KeyValueStoreRecord | undefined> {
        s.string().parse(key);

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

        // Auto-parse the body (JSON → object, text → string, etc.)
        record.value = maybeParseBody(record.value, record.contentType!);

        existingStoreById.updateTimestamps(false);

        return record;
    }

    async setValue(record: storage.KeyValueStoreRecord): Promise<void> {
        s.object({
            key: s.string().lengthGreaterThan(0),
            value: s.union([
                s.null(),
                s.string(),
                s.number(),
                s.instance(Buffer),
                s.instance(ArrayBuffer),
                s.typedArray(),
                // disabling validation will make shapeshift only check the object given is an actual object, not null, nor array
                s.object({}).setValidationEnabled(false),
            ]),
            contentType: s.string().lengthGreaterThan(0).optional(),
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
            logger: this.client.logger,
        });

        await entry.update(_record);

        existingStoreById.keyValueEntries.set(key, entry);

        existingStoreById.updateTimestamps(true);
    }

    async deleteValue(key: string): Promise<void> {
        s.string().parse(key);

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
        scheduleBackgroundTask(
            {
                action: 'update-metadata',
                data,
                entityType: 'keyValueStores',
                entityDirectory: this.keyValueStoreDirectory,
                id: this.name ?? this.id,
                writeMetadata: this.client.writeMetadata,
                persistStorage: this.client.persistStorage,
            },
            this.client.logger,
        );
    }
}
