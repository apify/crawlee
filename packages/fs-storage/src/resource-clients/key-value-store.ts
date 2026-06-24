import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import type * as storage from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import { scheduleBackgroundTask } from '../background-handler/index.js';
import type { StorageImplementation } from '../fs/common.js';
import { createKeyValueStorageImplementation } from '../fs/key-value-store/index.js';
import type { FileSystemStorageClient } from '../index.js';
import { isStream, resolveWithinDirectory, toBuffer } from '../utils.js';
import { BaseClient } from './common/base-client.js';
import mime from 'mime-types';

const DEFAULT_LOCAL_FILE_EXTENSION = 'bin';

export interface KeyValueStoreClientOptions {
    name?: string;
    id?: string;
    /**
     * The directory name to use on disk. When provided, takes precedence over `name` and `id`
     * for the directory path. This allows alias-opened storages to have a directory name
     * that differs from their metadata `name` (which is `undefined` for unnamed storages).
     */
    directoryName?: string;
    baseStorageDirectory: string;
    client: FileSystemStorageClient;
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
    /**
     * The key used for directory naming and cache lookup. For named storages, this equals
     * the name. For alias (unnamed) storages, this is the alias string. Falls back to id.
     */
    directoryName: string;
    createdAt = new Date();
    accessedAt = new Date();
    modifiedAt = new Date();
    keyValueStoreDirectory: string;

    private readonly keyValueEntries = new Map<string, StorageImplementation<InternalKeyRecord>>();
    private readonly client: FileSystemStorageClient;

    constructor(options: KeyValueStoreClientOptions) {
        super(options.id ?? randomUUID());
        this.name = options.name;
        this.directoryName = options.directoryName ?? this.name ?? this.id;
        this.keyValueStoreDirectory = resolveWithinDirectory(options.baseStorageDirectory, this.directoryName);
        this.client = options.client;
    }

    async getMetadata(): Promise<storage.KeyValueStoreInfo> {
        this.updateTimestamps(false);
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
        // Delete all entries
        const entriesToDelete = [...this.keyValueEntries.entries()];
        for (const [key, entry] of entriesToDelete) {
            this.keyValueEntries.delete(key);
            await entry.delete();
        }

        this.updateTimestamps(true);
    }

    async listKeys(options: storage.KeyValueStoreListKeysOptions = {}): Promise<storage.KeyValueStoreItemData[]> {
        const { prefix, exclusiveStartKey, limit } = s
            .object({
                prefix: s.string().optional(),
                exclusiveStartKey: s.string().optional(),
                limit: s.number().int().greaterThan(0).optional(),
            })
            .parse(options);

        const items: storage.KeyValueStoreItemData[] = [];

        for (const storageEntry of this.keyValueEntries.values()) {
            const record = await storageEntry.get();

            const size = Buffer.byteLength(record.value);
            items.push({
                key: record.key,
                size,
            });
        }

        // Lexically sort to emulate API.
        items.sort((a, b) => a.key.localeCompare(b.key));

        let filteredItems = items.filter((item) => !prefix || item.key.startsWith(prefix));

        if (exclusiveStartKey) {
            const keyPos = filteredItems.findIndex((item) => item.key === exclusiveStartKey);
            if (keyPos === -1) {
                throw new Error(
                    `exclusiveStartKey "${exclusiveStartKey}" was not found in the key-value store. ` +
                        `This is likely a bug — the key may have been deleted between paginated listKeys calls.`,
                );
            }
            filteredItems = filteredItems.slice(keyPos + 1);
        }

        if (limit !== undefined) {
            filteredItems = filteredItems.slice(0, limit);
        }

        this.updateTimestamps(false);

        return filteredItems;
    }

    /**
     * Generates a public `file://` URL for accessing a specific record in the key-value store.
     *
     * Returns `undefined` if the record does not exist or has no associated file path (i.e., it is not stored as a file).
     * @param key The key of the record to generate the public URL for.
     */
    async getPublicUrl(key: string): Promise<string | undefined> {
        s.string().parse(key);

        const storageEntry = await this.keyValueEntries.get(key)?.get();

        return storageEntry?.filePath ? pathToFileURL(storageEntry.filePath).href : undefined;
    }

    /**
     * Tests whether a record with the given key exists in the key-value store without retrieving its value.
     *
     * @param key The queried record key.
     * @returns `true` if the record exists, `false` if it does not.
     */
    async recordExists(key: string): Promise<boolean> {
        s.string().parse(key);

        return this.keyValueEntries.has(key);
    }

    async getValue(key: string): Promise<storage.KeyValueStoreRecord | undefined> {
        s.string().parse(key);

        const storageEntry = this.keyValueEntries.get(key);

        if (!storageEntry) {
            return undefined;
        }

        const entry = await storageEntry.get();

        // Return raw bytes + verbatim content type. Parsing is the frontend's job (see the
        // KeyValueStore codec); this client is a plain byte transport. The mime fallback
        // reconstructs the content type for on-disk records that lack one.
        const record: storage.KeyValueStoreRecord = {
            key: entry.key,
            value: typeof entry.value === 'string' ? Buffer.from(entry.value, 'utf-8') : entry.value,
            // mime.contentType returns `false` for unknown extensions; fall back to undefined so the
            // frontend treats it as "no content type" rather than a bogus value.
            contentType: entry.contentType ?? (mime.contentType(entry.extension) || undefined),
        };

        this.updateTimestamps(false);

        return record;
    }

    async setValue(record: storage.KeyValueStoreInputRecord): Promise<void> {
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

        const { key } = record;
        let { value } = record;
        // The frontend (KeyValueStore codec) serializes the value and resolves its content type
        // before it reaches the client. We only need it here for on-disk extension bookkeeping.
        const contentType = record.contentType ?? 'application/octet-stream';

        const extension = mime.extension(contentType) || DEFAULT_LOCAL_FILE_EXTENSION;

        // Draining a stream into a Buffer for storage is the client's responsibility.
        if (isStream(value)) {
            const chunks = [];
            for await (const chunk of value) {
                chunks.push(chunk);
            }
            value = Buffer.concat(chunks as Buffer[]);
        }

        // The on-disk record holds raw bytes (or a string). Streams were drained above, so any
        // remaining non-string value is byte-like; normalize ArrayBuffer / typed-array views to Buffer.
        const normalizedValue: Buffer | string =
            typeof value === 'string' ? value : toBuffer(value as Buffer | ArrayBuffer | ArrayBufferView);

        const _record = {
            extension,
            key,
            value: normalizedValue,
            contentType,
        } satisfies InternalKeyRecord;

        const entry = createKeyValueStorageImplementation({
            storeDirectory: this.keyValueStoreDirectory,
            writeMetadata: this.client.writeMetadata,
            logger: this.client.logger,
        });

        await entry.update(_record);

        this.keyValueEntries.set(key, entry);

        this.updateTimestamps(true);
    }

    async deleteValue(key: string): Promise<void> {
        s.string().parse(key);

        const entry = this.keyValueEntries.get(key);

        if (entry) {
            this.keyValueEntries.delete(key);
            this.updateTimestamps(true);
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
            },
            this.client.logger,
        );
    }
}
