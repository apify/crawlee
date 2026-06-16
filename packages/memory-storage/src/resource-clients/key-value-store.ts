import { randomUUID } from 'node:crypto';

import type * as storage from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import { maybeParseBody } from '../body-parser.js';
import type { MemoryStorageClient } from '../index.js';
import { isBuffer, isStream } from '../utils.js';
import { BaseClient } from './common/base-client.js';
import mime from 'mime-types';

const DEFAULT_LOCAL_FILE_EXTENSION = 'bin';

/**
 * Key under which a run's input is stored in the default key-value store. Matches Crawlee's default
 * `inputKey` (`CRAWLEE_INPUT_KEY`) and the `INPUT` files `FileSystemStorageClient` preserves on purge.
 */
const KEY_VALUE_STORE_INPUT_KEY = 'INPUT';

export interface KeyValueStoreClientOptions {
    name?: string;
    id?: string;
    /**
     * The key used for cache lookup. When provided, takes precedence over `name` and `id`.
     * This allows alias-opened storages to have a directory name that differs from their
     * metadata `name` (which is `undefined` for unnamed storages).
     */
    directoryName?: string;
    client: MemoryStorageClient;
}

export interface InternalKeyRecord {
    key: string;
    value: Buffer | string;
    contentType?: string;
    extension: string;
}

export class KeyValueStoreClient extends BaseClient implements storage.KeyValueStoreClient {
    name?: string;
    /**
     * The key used for cache lookup. For named storages, this equals the name. For alias (unnamed)
     * storages, this is the alias string. Falls back to id.
     */
    directoryName: string;
    createdAt = new Date();
    accessedAt = new Date();
    modifiedAt = new Date();

    private readonly keyValueEntries = new Map<string, InternalKeyRecord>();
    private readonly client: MemoryStorageClient;

    constructor(options: KeyValueStoreClientOptions) {
        super(options.id ?? randomUUID());
        this.name = options.name;
        this.directoryName = options.directoryName ?? this.name ?? this.id;
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
        }
    }

    async purge(): Promise<void> {
        this.keyValueEntries.clear();
        this.updateTimestamps(true);
    }

    /**
     * Purges every record except the run's input. Used by {@link MemoryStorageClient.purge} for the
     * default key-value store, mirroring `FileSystemStorageClient`, which preserves `INPUT` (and its
     * extension variants) when purging the default store. The in-memory key has no extension, so we
     * preserve the bare `INPUT` key only.
     */
    async purgeExceptInput(): Promise<void> {
        for (const key of this.keyValueEntries.keys()) {
            if (key !== KEY_VALUE_STORE_INPUT_KEY) {
                this.keyValueEntries.delete(key);
            }
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

        for (const record of this.keyValueEntries.values()) {
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
     * In-memory records are not file-backed, so there is no public file URL to return.
     * Always resolves to `undefined`.
     * @param key The key of the record to generate the public URL for.
     */
    async getPublicUrl(key: string): Promise<string | undefined> {
        s.string().parse(key);

        return undefined;
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

        const entry = this.keyValueEntries.get(key);

        if (!entry) {
            return undefined;
        }

        const record: storage.KeyValueStoreRecord = {
            key: entry.key,
            value: entry.value,
            contentType: entry.contentType ?? (mime.contentType(entry.extension) as string),
        };

        // Auto-parse the body (JSON → object, text → string, etc.)
        record.value = maybeParseBody(record.value, record.contentType!);

        this.updateTimestamps(false);

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

        this.keyValueEntries.set(key, _record);

        this.updateTimestamps(true);
    }

    async deleteValue(key: string): Promise<void> {
        s.string().parse(key);

        if (this.keyValueEntries.has(key)) {
            this.keyValueEntries.delete(key);
            this.updateTimestamps(true);
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
    }
}
