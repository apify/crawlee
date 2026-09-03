import type {
    Awaitable,
    Dictionary,
    KeyValueStoreBackend,
    KeyValueStoreInfo,
    KeyValueStoreItemData,
} from '@crawlee/types';
import { z } from 'zod';

import { KEY_VALUE_STORE_KEY_REGEX } from '@apify/consts';
import { tryCancel } from '@apify/timeout';

import { Configuration } from '../configuration.js';
import { serviceLocator } from '../service_locator.js';
import { parseArgument, schemas, validators } from '../validators.js';
import type { JournalEntry, KeyValueStoreJournalEntry } from './transaction.js';
import {
    activeStorageTransaction,
    operationRejectedInTransaction,
    rejectOperationInTransaction,
    snapshotValue,
    withDirectStorageAccess,
} from './transaction.js';
import { parseValue, serializeValue } from './key_value_store_codec.js';
import type { KeyValueStoreStats } from './storage_stats.js';
import { StorageStatsTracker } from './storage_stats.js';
import type { StorageOpenOptions } from './utils.js';
import type { StorageIdentifier } from './storage_instance_manager.js';
import { resolveStorageIdentifier } from './storage_instance_manager.js';
import { createDualIterable, purgeDefaultStorages } from './utils.js';
import { isBuffer, isStream } from '../byte_utils.js';

/** @internal */
const KVS_KEYS_DEFAULT_LIMIT = 1000;

const keySchema = z.string().nonempty();
const setValueKeySchema = z.string().nonempty().regex(KEY_VALUE_STORE_KEY_REGEX, {
    message: `The "key" argument must be at most 256 characters long and only contain the following characters: a-zA-Z0-9!-_.'()`,
});
const recordOptionsSchema = z.strictObject({
    contentType: z.string().nonempty().optional(),
});
const iteratorOptionsSchema = z.strictObject({
    prefix: z.string().optional(),
});
const openOptionsSchema = z.strictObject({
    configuration: z.instanceof(Configuration).optional(),
    storageBackend: validators.storageBackend.optional(),
});

/**
 * The `KeyValueStore` class represents a key-value store, a simple data storage that is used
 * for saving and reading data records or files. Each data record is
 * represented by a unique key and associated with a MIME content type. Key-value stores are ideal
 * for saving screenshots, crawler inputs and outputs, web pages, PDFs or to persist the state of crawlers.
 *
 * Do not instantiate this class directly, use the
 * {@apilink KeyValueStore.open} function instead.
 *
 * Each crawler run is associated with a default key-value store, which is created exclusively
 * for the run. By convention, the crawler input and output are stored into the
 * default key-value store under the `INPUT` and `OUTPUT` key, respectively.
 * Typically, input and output are JSON files, although it can be any other format.
 * To access the default key-value store directly, you can use the
 * {@apilink KeyValueStore.getValue} and {@apilink KeyValueStore.setValue} convenience functions.
 *
 * To access the input, you can also use the {@apilink KeyValueStore.getInput} convenience function.
 *
 * `KeyValueStore` stores its data on a local disk.
 *
 * If the `CRAWLEE_STORAGE_DIR` environment variable is set, the data is stored in
 * the local directory in the following files:
 * ```
 * {CRAWLEE_STORAGE_DIR}/key_value_stores/{STORE_ID}/{INDEX}.{EXT}
 * ```
 * Note that `{STORE_ID}` is the name or ID of the key-value store. The default key-value store has ID: `default`,
 * unless you override it by setting the `CRAWLEE_DEFAULT_KEY_VALUE_STORE_ID` environment variable.
 * The `{KEY}` is the key of the record and `{EXT}` corresponds to the MIME content type of the data value.
 *
 * **Example usage:**
 *
 * ```javascript
 * // Get crawler input from the default key-value store.
 * const input = await KeyValueStore.getInput();
 * // Get some value from the default key-value store.
 * const otherValue = await KeyValueStore.getValue('my-key');
 *
 * // Write crawler output to the default key-value store.
 * await KeyValueStore.setValue('OUTPUT', { myResult: 123 });
 *
 * // Open a named key-value store
 * const store = await KeyValueStore.open('some-name');
 *
 * // Write a record. JavaScript object is automatically converted to JSON,
 * // strings and binary buffers are stored as they are
 * await store.setValue('some-key', { foo: 'bar' });
 *
 * // Read a record. Note that JSON is automatically parsed to a JavaScript object,
 * // text data returned as a string and other data is returned as binary buffer
 * const value = await store.getValue('some-key');
 *
 *  // Drop (delete) the store
 * await store.drop();
 * ```
 * @category Result Stores
 */
export class KeyValueStore {
    readonly id: string;
    readonly name?: string;
    readonly backend: KeyValueStoreBackend;
    #persistStateEventStarted = false;

    /** Cache for persistent (auto-saved) values. When we try to set such value, the cache will be updated automatically. */
    readonly #cache = new Map<string, Dictionary>();

    readonly #statsTracker = new StorageStatsTracker<KeyValueStoreStats>({
        readCount: 0,
        writeCount: 0,
        deleteCount: 0,
        listCount: 0,
    });

    /**
     * @internal
     */
    constructor(
        options: KeyValueStoreOptions,
        readonly configuration = Configuration.getGlobalConfiguration(),
    ) {
        this.id = options.metadata.id;
        this.name = options.metadata.name;
        this.backend = options.backend;
    }

    /**
     * Backend-independent usage counters tracked for this key-value store (read / write / delete /
     * list operations issued to the underlying storage backend). Counted per backend call.
     */
    get stats(): KeyValueStoreStats {
        return this.#statsTracker.current;
    }

    /**
     * Gets a value from the key-value store.
     *
     * The function returns a `Promise` that resolves to the record value,
     * whose JavaScript type depends on the MIME content type of the record.
     * Records with the `application/json`
     * content type are automatically parsed and returned as a JavaScript object.
     * Similarly, records with `text/plain` content types are returned as a string.
     * For all other content types, the value is returned as a raw
     * [`Buffer`](https://nodejs.org/api/buffer.html) instance.
     *
     * If the record does not exist, the function resolves to `null`.
     *
     * To save or delete a value in the key-value store, use the
     * {@apilink KeyValueStore.setValue} function.
     *
     * **Example usage:**
     *
     * ```javascript
     * const store = await KeyValueStore.open();
     * const buffer = await store.getValue('screenshot1.png');
     * ```
     * @param key
     *   Unique key of the record. It can be at most 256 characters long and only consist
     *   of the following characters: `a`-`z`, `A`-`Z`, `0`-`9` and `!-_.'()`
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record.
     */
    async getValue<T = unknown>(key: string): Promise<T | null>;
    /**
     * Gets a value from the key-value store.
     *
     * The function returns a `Promise` that resolves to the record value,
     * whose JavaScript type depends on the MIME content type of the record.
     * Records with the `application/json`
     * content type are automatically parsed and returned as a JavaScript object.
     * Similarly, records with `text/plain` content types are returned as a string.
     * For all other content types, the value is returned as a raw
     * [`Buffer`](https://nodejs.org/api/buffer.html) instance.
     *
     * If the record does not exist, the function resolves to `null`.
     *
     * To save or delete a value in the key-value store, use the
     * {@apilink KeyValueStore.setValue} function.
     *
     * **Example usage:**
     *
     * ```javascript
     * const store = await KeyValueStore.open();
     * const buffer = await store.getValue('screenshot1.png');
     * ```
     * @param key
     *   Unique key of the record. It can be at most 256 characters long and only consist
     *   of the following characters: `a`-`z`, `A`-`Z`, `0`-`9` and `!-_.'()`
     * @param defaultValue
     *   Fallback that will be returned if no value if present in the storage.
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or the default value if the key is missing from the store.
     */
    async getValue<T = unknown>(key: string, defaultValue: T): Promise<T>;
    /**
     * Gets a value from the key-value store.
     *
     * The function returns a `Promise` that resolves to the record value,
     * whose JavaScript type depends on the MIME content type of the record.
     * Records with the `application/json`
     * content type are automatically parsed and returned as a JavaScript object.
     * Similarly, records with `text/plain` content types are returned as a string.
     * For all other content types, the value is returned as a raw
     * [`Buffer`](https://nodejs.org/api/buffer.html) instance.
     *
     * If the record does not exist, the function resolves to `null`.
     *
     * To save or delete a value in the key-value store, use the
     * {@apilink KeyValueStore.setValue} function.
     *
     * **Example usage:**
     *
     * ```javascript
     * const store = await KeyValueStore.open();
     * const buffer = await store.getValue('screenshot1.png');
     * ```
     * @param key
     *   Unique key of the record. It can be at most 256 characters long and only consist
     *   of the following characters: `a`-`z`, `A`-`Z`, `0`-`9` and `!-_.'()`
     * @param defaultValue
     *   Fallback that will be returned if no value if present in the storage.
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or `null` if the key is missing from the store.
     */
    async getValue<T = unknown>(key: string, defaultValue?: T): Promise<T | null> {
        tryCancel();

        parseArgument(key, keySchema);
        const record = await this.readRecord(key);

        // A missing record falls back to the default; a record that parses to a falsy value (including
        // a stored literal `null`) is returned verbatim, so callers can tell "stored null" from "absent".
        if (!record) {
            return defaultValue ?? null;
        }

        // Storage backends are byte transports — the value is raw bytes; the frontend parses it here.
        return parseValue(record.value, record.contentType ?? null) as T;
    }

    /**
     * The active transaction's last buffered write per key for this store, derived from its journal.
     * An entry with a `null` value is a tombstone (an in-transaction deletion).
     */
    private bufferedJournalEntries(): Map<string, KeyValueStoreJournalEntry> | undefined {
        const transaction = activeStorageTransaction();
        if (!transaction) return undefined;

        const lastWritePerKey = new Map<string, KeyValueStoreJournalEntry>();

        for (const entry of transaction.journal) {
            if (entry.type === 'keyValueStore' && entry.participant === this) {
                lastWritePerKey.set(entry.key, entry);
            }
        }

        return lastWritePerKey;
    }

    /**
     * The single transaction-aware record read shared by `getValue`, `getRecord`, `recordExists` and the
     * listing paths: buffered key → serialized through the standard codec (same fidelity as a real
     * round-trip); tombstoned key → `null`; otherwise the backend.
     *
     * The per-key buffered lookup requires the whole journal to be reduced to a last-write-per-key map,
     * which is O(journal). Single-record callers let it default (rebuilt per call); the listing paths,
     * which read many keys, pass a map built once so the read stays O(1) per key instead of O(journal).
     */
    private async readRecord(
        key: string,
        buffered = this.bufferedJournalEntries(),
    ): Promise<{ value: Buffer | ArrayBuffer; contentType: string | null } | null> {
        const entry = buffered?.get(key);

        if (entry) {
            if (entry.value === null) {
                return null;
            }

            const serialized = serializeValue(entry.value, entry.options?.contentType);
            return {
                value: normalizeSerializedValue(serialized.value),
                contentType: serialized.contentType ?? null,
            };
        }

        this.#statsTracker.add('readCount');
        const record = await this.backend.getValue(key);
        if (!record) return null;

        return {
            value: record.value,
            contentType: record.contentType ?? null,
        };
    }

    /**
     * Reads a record from the key-value store without parsing the value.
     *
     * Use this when you need the raw bytes and the content type — for example, to run your own
     * parser (`simdjson`, a custom XML library, etc.) or to forward the bytes verbatim.
     *
     * There is no symmetric `setRecord` method, because {@apilink KeyValueStore.setValue} already
     * passes a `Buffer` (or `string` / `Stream`) through unchanged when an explicit `contentType`
     * is provided. To write pre-serialized bytes, call
     * `setValue(key, buffer, { contentType: 'application/json; charset=utf-8' })`.
     *
     * Returns `null` if the record does not exist.
     *
     * **Example usage:**
     * ```javascript
     * const store = await KeyValueStore.open();
     * const record = await store.getRecord('huge.json');
     * if (record) {
     *     const data = simdjson.parse(record.value);
     * }
     * ```
     *
     * @param key
     *   Unique key of the record. It can be at most 256 characters long and only consist
     *   of the following characters: `a`-`z`, `A`-`Z`, `0`-`9` and `!-_.'()`
     */
    async getRecord(key: string): Promise<KeyValueStoreRawRecord | null> {
        tryCancel();

        parseArgument(key, keySchema);
        return this.readRecord(key);
    }

    /**
     * Tests whether a record with the given key exists in the key-value store without retrieving its value.
     *
     * @param key The queried record key.
     * @returns `true` if the record exists, `false` if it does not.
     */
    async recordExists(key: string): Promise<boolean> {
        tryCancel();

        parseArgument(key, keySchema);

        const entry = this.bufferedJournalEntries()?.get(key);
        if (entry) {
            return entry.value !== null;
        }

        return this.backend.recordExists(key);
    }

    async getAutoSavedValue<T extends Dictionary = Dictionary>(key: string, defaultValue = {} as T): Promise<T> {
        tryCancel();

        if (this.#cache.has(key)) {
            return this.#cache.get(key) as T;
        }

        // Auto-saved state is deliberately *not* transactional. The direct read bypasses any active
        // transaction - a buffered value seeded into this shared cache would survive a rollback forever.
        const value = await withDirectStorageAccess(async () => this.getValue<T>(key, defaultValue));

        // The await above could have run in parallel with another call to this function. If the other call finished more quickly,
        // the value will in cache at this point, and returning the new fetched value would introduce two different instances of
        // the auto-saved object, and only the latter one would be persisted.
        // Therefore we re-check the cache here, and if such race condition happened, we drop the fetched value and return the cached one.
        if (this.#cache.has(key)) {
            return this.#cache.get(key) as T;
        }

        this.#cache.set(key, value!);
        this.ensurePersistStateEvent();

        return value!;
    }

    private ensurePersistStateEvent(): void {
        if (this.#persistStateEventStarted) {
            return;
        }

        serviceLocator.getEventManager().on('persistState', async () => {
            const promises: Promise<void>[] = [];

            for (const [key, value] of this.#cache) {
                promises.push(
                    this.setValue(key, value).catch((error) =>
                        serviceLocator.getLogger().warning(`Failed to persist the state value to ${key}`, { error }),
                    ),
                );
            }

            await Promise.all(promises);
        });

        this.#persistStateEventStarted = true;
    }

    private async *fetchKeyValuePages<T>(
        options: KeyValueStoreIteratorOptions,
        mapRecord: (key: string, value: unknown) => T,
    ): AsyncGenerator<T[]> {
        // Reduce the journal once for the whole iteration, not once per key inside `readRecord`.
        const buffered = this.bufferedJournalEntries();

        for await (const page of this.fetchKeyPages(options, buffered)) {
            const results: T[] = [];
            for (const item of page) {
                // The shared transaction-aware read, so a key that exists only in the transaction resolves
                // here instead of being dropped (`values()` would disagree with `keys()` on length).
                const record = await this.readRecord(item.key, buffered);
                if (record) {
                    const parsed = parseValue(record.value, record.contentType ?? null);
                    results.push(mapRecord(item.key, parsed));
                }
            }
            yield results;
        }
    }

    private async *fetchKeyPages(
        options: KeyValueStoreIteratorOptions,
        buffered = this.bufferedJournalEntries(),
        limit = KVS_KEYS_DEFAULT_LIMIT,
    ): AsyncGenerator<KeyValueStoreItemData[]> {
        // Buffered keys are emitted first, then the real pages with any buffered (or tombstoned) key
        // skipped - a merge-join is not an option, since `listKeys` promises no sort order.
        const shadowedKeys = new Set<string>();

        if (buffered) {
            const bufferedItems: KeyValueStoreItemData[] = [];

            for (const [key, entry] of buffered) {
                shadowedKeys.add(key);

                if (entry.value === null) continue;
                if (options.prefix !== undefined && !key.startsWith(options.prefix)) continue;

                bufferedItems.push(bufferedKeyItemData(key, entry));
            }

            if (bufferedItems.length > 0) {
                bufferedItems.sort((a, b) => (a.key < b.key ? -1 : 1));
                yield bufferedItems;
            }
        }

        let exclusiveStartKey: string | undefined;

        while (true) {
            this.#statsTracker.add('listCount');
            const { items, isTruncated, nextExclusiveStartKey } = await this.backend.listKeys({
                ...options,
                exclusiveStartKey,
                limit,
            });
            yield shadowedKeys.size > 0 ? items.filter((item) => !shadowedKeys.has(item.key)) : items;
            if (!isTruncated) break;
            // Paginate from the raw backend cursor - it may reject a key it did not hand out.
            exclusiveStartKey = nextExclusiveStartKey;
        }
    }

    /**
     * Saves or deletes a record in the key-value store.
     * The function returns a promise that resolves once the record has been saved or deleted.
     *
     * **Example usage:**
     *
     * ```javascript
     * const store = await KeyValueStore.open();
     * await store.setValue('OUTPUT', { foo: 'bar' });
     * ```
     *
     * Beware that the key can be at most 256 characters long and only contain the following characters: `a-zA-Z0-9!-_.'()`
     *
     * By default, `value` is converted to JSON and stored with the
     * `application/json; charset=utf-8` MIME content type.
     * To store the value with another content type, pass it in the options as follows:
     * ```javascript
     * const store = await KeyValueStore.open('my-text-store');
     * await store.setValue('RESULTS', 'my text data', { contentType: 'text/plain' });
     * ```
     * If you set custom content type, `value` must be either a string or
     * [`Buffer`](https://nodejs.org/api/buffer.html), otherwise an error will be thrown.
     *
     * If `value` is `null`, the record is deleted instead. Note that the `setValue()` function succeeds
     * regardless whether the record existed or not.
     *
     * To retrieve a value from the key-value store, use the
     * {@apilink KeyValueStore.getValue} function.
     *
     * **IMPORTANT:** Always make sure to use the `await` keyword when calling `setValue()`,
     * otherwise the crawler process might finish before the value is stored!
     *
     * @param key
     *   Unique key of the record. It can be at most 256 characters long and only consist
     *   of the following characters: `a`-`z`, `A`-`Z`, `0`-`9` and `!-_.'()`
     * @param value
     *   Record data, which can be one of the following values:
     *    - If `null`, the record in the key-value store is deleted.
     *    - If no `options.contentType` is specified, `value` can be any JavaScript object and it will be stringified to JSON.
     *    - If `options.contentType` is set, `value` is taken as is and it must be a `String` or [`Buffer`](https://nodejs.org/api/buffer.html).
     *   For any other value an error will be thrown.
     * @param [options] Record options.
     */
    async setValue<T>(key: string, value: T | null, options: RecordOptions = {}): Promise<void> {
        const transaction = activeStorageTransaction();

        parseArgument(key, setValueKeySchema);
        if (options.contentType && !(typeof value === 'string' || isBuffer(value) || isStream(value))) {
            throw new Error(
                'The "value" parameter must be a String, Buffer, ArrayBuffer, TypedArray, or Stream when "options.contentType" is specified.',
            );
        }
        // The parse result is a fresh copy, so we never update what user passed.
        const optionsCopy = parseArgument(options, recordOptionsSchema);

        // The whole transaction branch sits *above* the auto-saved cache update below, so a buffered
        // write touches nothing outside the journal. That cache is shared, process-lifetime frontend
        // state, so mutating it here would survive a rollback and later be persisted by `persistState`.
        // The commit replay re-enters this method with no active transaction and updates it then.
        if (transaction) {
            if (isStream(value)) {
                // A stream cannot serve both a read-your-own-writes read and the commit replay. The
                // transaction is known-active here, so throw directly rather than via the conditional guard.
                throw operationRejectedInTransaction(
                    `KeyValueStore.setValue() with a stream value (key "${key}")`,
                    'a stream can only be consumed once, so it cannot be buffered until commit.',
                );
            }

            // Validation only, result discarded: the journal snapshot (`structuredClone`) accepts values
            // JSON cannot, which would otherwise only throw at a later read or at commit.
            if (value !== null) {
                serializeValue(value, optionsCopy.contentType);
            }

            // One snapshot serves both the reads and the commit replay; `null` is a tombstone.
            transaction.recordJournalEntry({
                type: 'keyValueStore',
                participant: this,
                storageId: this.id,
                key,
                value: value === null ? null : snapshotValue(value),
                options: optionsCopy,
            });
            return;
        }

        // If we try to set the value of a cached state to a different reference, we need to update the cache accordingly.
        const cachedValue = this.#cache.get(key);

        if (cachedValue && cachedValue !== value) {
            if (value === null) {
                // Cached state can be only object, so a propagation of `null` means removing all its properties.
                Object.keys(cachedValue).forEach((k) => this.#cache.delete(k));
            } else if (typeof value === 'object') {
                // We need to remove the keys that are no longer present in the new value.
                Object.keys(cachedValue)
                    .filter((k) => !(k in (value as Dictionary)))
                    .forEach((k) => this.#cache.delete(k));
                // And update the existing ones + add new ones.
                Object.assign(cachedValue, value);
            }
        }

        // In this case delete the record.
        if (value === null) {
            this.#statsTracker.add('deleteCount');
            return this.backend.deleteValue(key);
        }

        const serialized = serializeValue(value, optionsCopy.contentType);

        this.#statsTracker.add('writeCount');
        return this.backend.setValue({
            key,
            value: serialized.value,
            contentType: serialized.contentType,
        });
    }

    /** @internal */
    async commitJournalEntries(entries: JournalEntry[]): Promise<void> {
        // One `setValue` per key, last write wins - idempotent under retry.
        const lastWritePerKey = new Map<string, { value: unknown; options?: RecordOptions }>();

        for (const entry of entries) {
            if (entry.type === 'keyValueStore') {
                lastWritePerKey.set(entry.key, { value: entry.value, options: entry.options });
            }
        }

        for (const [key, { value, options }] of lastWritePerKey) {
            await this.setValue(key, value, options);
        }
    }

    /**
     * Removes the key-value store either from the Apify cloud storage or from the local directory,
     * depending on the mode of operation.
     */
    async drop(): Promise<void> {
        rejectOperationInTransaction('KeyValueStore.drop()');

        await this.backend.drop();
        serviceLocator.getStorageInstanceManager().removeFromCache(this);
    }

    /**
     * Removes all records from the store but keeps the store itself, along with its
     * {@apilink KeyValueStore.id|`id`} and {@apilink KeyValueStore.name|`name`}.
     */
    async purge(): Promise<void> {
        rejectOperationInTransaction('KeyValueStore.purge()');

        await this.backend.purge();
        // The auto-saved values this cache holds are no longer in the store.
        this.#cache.clear();
    }

    /** @internal */
    clearCache(): void {
        rejectOperationInTransaction('KeyValueStore.clearCache()');

        this.#cache.clear();
    }

    /**
     * Iterates over key-value store keys, yielding each in turn to an `iteratee` function.
     * Each invocation of `iteratee` is called with three arguments: `(key, index, info)`, where `key`
     * is the record key, `index` is a zero-based index of the key in the current iteration
     * and `info` is an object that contains a single property `size`
     * indicating size of the record in bytes.
     *
     * If the `iteratee` function returns a Promise then it is awaited before the next call.
     * If it throws an error, the iteration is aborted and the `forEachKey` function throws the error.
     *
     * **Example usage**
     * ```javascript
     * const keyValueStore = await KeyValueStore.open();
     * await keyValueStore.forEachKey(async (key, index, info) => {
     *   console.log(`Key at ${index}: ${key} has size ${info.size}`);
     * });
     * ```
     *
     * @param iteratee A function that is called for every key in the key-value store.
     * @param [options] All `forEachKey()` parameters.
     */
    async forEachKey(iteratee: KeyConsumer, options: KeyValueStoreIteratorOptions = {}): Promise<void> {
        tryCancel();

        parseArgument(iteratee, schemas.anyFunction);
        const parsedOptions = parseArgument(options, iteratorOptionsSchema);

        let index = 0;

        for await (const page of this.fetchKeyPages(parsedOptions)) {
            for (const item of page) {
                await iteratee(item.key, index++, { size: item.size });
            }
        }
    }

    /**
     * Returns key-value store keys.
     *
     * When awaited (`await store.keys()`), returns all keys as a flat `string[]` array.
     * When used as an async iterable (`for await...of`), iterates over all keys across pages
     * without loading everything into memory at once.
     *
     * **Example usage:**
     * ```javascript
     * const keyValueStore = await KeyValueStore.open();
     *
     * // Iterate over all keys (memory-efficient for large stores)
     * for await (const key of keyValueStore.keys()) {
     *   console.log(key);
     * }
     *
     * // Or fetch all keys at once
     * const allKeys = await keyValueStore.keys();
     * console.log(allKeys);
     * ```
     *
     * @param options Options for the iteration.
     */
    keys(options: KeyValueStoreIteratorOptions = {}): AsyncIterable<string> & Promise<string[]> {
        tryCancel();

        return createDualIterable({
            createPages: () => this.fetchKeyPages(options),
            extractItems: (page) => page.map((item) => item.key),
        });
    }

    /**
     * Returns key-value store values.
     *
     * When awaited (`await store.values()`), returns all values as a flat `T[]` array.
     * When used as an async iterable (`for await...of`), iterates over all values across pages
     * without loading everything into memory at once.
     *
     * **Example usage:**
     * ```javascript
     * const keyValueStore = await KeyValueStore.open();
     *
     * // Iterate over all values (memory-efficient for large stores)
     * for await (const value of keyValueStore.values()) {
     *   console.log(value);
     * }
     *
     * // Or fetch all values at once
     * const allValues = await keyValueStore.values();
     * console.log(allValues);
     * ```
     *
     * @param options Options for the iteration.
     */
    values<T = unknown>(options: KeyValueStoreIteratorOptions = {}): AsyncIterable<T> & Promise<T[]> {
        tryCancel();

        return createDualIterable({
            createPages: () => this.fetchKeyValuePages<T>(options, (_key, value) => value as T),
            extractItems: (page) => page,
        });
    }

    /**
     * Returns key-value store entries (key-value pairs).
     *
     * When awaited (`await store.entries()`), returns all entries as a flat `[key, value][]` array.
     * When used as an async iterable (`for await...of`), iterates over all entries across pages
     * without loading everything into memory at once.
     *
     * **Example usage:**
     * ```javascript
     * const keyValueStore = await KeyValueStore.open();
     *
     * // Iterate over all entries (memory-efficient for large stores)
     * for await (const [key, value] of keyValueStore.entries()) {
     *   console.log(`${key}: ${value}`);
     * }
     *
     * // Or fetch all entries at once
     * const allEntries = await keyValueStore.entries();
     * console.log(allEntries);
     * ```
     *
     * @param options Options for the iteration.
     */
    entries<T = unknown>(
        options: KeyValueStoreIteratorOptions = {},
    ): AsyncIterable<[string, T]> & Promise<[string, T][]> {
        tryCancel();

        return createDualIterable({
            createPages: () => this.fetchKeyValuePages<[string, T]>(options, (key, value) => [key, value as T]),
            extractItems: (page) => page,
        });
    }

    /**
     * Default async iterator for the key-value store, iterating over entries (key-value pairs).
     * Allows using the store directly in a `for await...of` loop.
     *
     * **Example usage:**
     * ```javascript
     * const keyValueStore = await KeyValueStore.open();
     * for await (const [key, value] of keyValueStore) {
     *   console.log(`${key}: ${value}`);
     * }
     * ```
     */
    async *[Symbol.asyncIterator]<T = unknown>(): AsyncGenerator<[string, T], void, undefined> {
        yield* this.entries<T>();
    }

    /**
     * Returns a file URL for the given key.
     *
     * The URL is derived from the key, so it is also returned for a record that does not exist (yet) —
     * including one written earlier in an uncommitted storage transaction. Returns `undefined` only when
     * the storage has no file URLs at all (e.g. the in-memory storage).
     *
     * @param key The key of the record to generate the public URL for.
     */
    async getPublicUrl(key: string): Promise<string | undefined> {
        return this.backend.getPublicUrl(key);
    }

    /**
     * Opens a key-value store and returns a promise resolving to an instance of the {@apilink KeyValueStore} class.
     *
     * Key-value stores are used to store records or files, along with their MIME content type.
     * The records are stored and retrieved using a unique key.
     * The actual data is stored either on a local filesystem or in the Apify cloud.
     *
     * For more details and code examples, see the {@apilink KeyValueStore} class.
     *
     * @param [identifier]
     *   ID or name of the key-value store to be opened. If a string is provided, it will first be
     *   looked up as an ID; if no such storage exists, it will be treated as a name.
     *   If `null` or `undefined`, the function returns the default key-value store associated with the crawler run.
     * @param [options] Storage manager options.
     */
    static async open(
        identifier?: string | StorageIdentifier | null,
        options: StorageOpenOptions = {},
    ): Promise<KeyValueStore> {
        tryCancel();

        const parsedOptions = parseArgument(options, openOptionsSchema);

        const configuration = parsedOptions.configuration ?? Configuration.getGlobalConfiguration();
        const storageBackend = parsedOptions.storageBackend ?? serviceLocator.getStorageBackend();

        await purgeDefaultStorages({ onlyPurgeOnce: true, storageBackend, configuration });

        const resolved = await resolveStorageIdentifier(identifier, storageBackend, 'KeyValueStore');

        return serviceLocator.getStorageInstanceManager().openStorage<KeyValueStore>(this, {
            ...resolved,
            backendOpener: () => storageBackend.createKeyValueStoreBackend(resolved),
            backendCacheKey: storageBackend.getStorageBackendCacheKey?.() ?? storageBackend.constructor.name,
        });
    }

    /**
     * Gets a value from the default {@apilink KeyValueStore} associated with the current crawler run.
     *
     * This is just a convenient shortcut for {@apilink KeyValueStore.getValue}.
     * For example, calling the following code:
     * ```javascript
     * const value = await KeyValueStore.getValue('my-key');
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const store = await KeyValueStore.open();
     * const value = await store.getValue('my-key');
     * ```
     *
     * To store the value to the default key-value store, you can use the {@apilink KeyValueStore.setValue} function.
     *
     * For more information, see  {@apilink KeyValueStore.open}
     * and  {@apilink KeyValueStore.getValue}.
     *
     * @param key Unique record key.
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or `null`
     *   if the record is missing.
     * @ignore
     */
    static async getValue<T = unknown>(key: string): Promise<T | null>;
    /**
     * Gets a value from the default {@apilink KeyValueStore} associated with the current crawler run.
     *
     * This is just a convenient shortcut for {@apilink KeyValueStore.getValue}.
     * For example, calling the following code:
     * ```javascript
     * const value = await KeyValueStore.getValue('my-key');
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const store = await KeyValueStore.open();
     * const value = await store.getValue('my-key');
     * ```
     *
     * To store the value to the default key-value store, you can use the {@apilink KeyValueStore.setValue} function.
     *
     * For more information, see  {@apilink KeyValueStore.open}
     * and  {@apilink KeyValueStore.getValue}.
     *
     * @param key Unique record key.
     * @param defaultValue Fallback that will be returned if no value if present in the storage.
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or the provided default value.
     * @ignore
     */
    static async getValue<T = unknown>(key: string, defaultValue: T): Promise<T>;
    /**
     * Gets a value from the default {@apilink KeyValueStore} associated with the current crawler run.
     *
     * This is just a convenient shortcut for {@apilink KeyValueStore.getValue}.
     * For example, calling the following code:
     * ```javascript
     * const value = await KeyValueStore.getValue('my-key');
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const store = await KeyValueStore.open();
     * const value = await store.getValue('my-key');
     * ```
     *
     * To store the value to the default key-value store, you can use the {@apilink KeyValueStore.setValue} function.
     *
     * For more information, see  {@apilink KeyValueStore.open}
     * and  {@apilink KeyValueStore.getValue}.
     *
     * @param key Unique record key.
     * @param defaultValue Fallback that will be returned if no value if present in the storage.
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or `null`
     *   if the record is missing.
     * @ignore
     */
    static async getValue<T = unknown>(key: string, defaultValue?: T): Promise<T | null> {
        const store = await this.open();
        return store.getValue<T>(key, defaultValue as T);
    }

    /**
     * Reads a record from the default {@apilink KeyValueStore} associated with the current crawler run
     * without parsing the value.
     *
     * This is just a convenient shortcut for {@apilink KeyValueStore.getRecord}. Returns `null` if the
     * record does not exist.
     *
     * @param key
     *   Unique key of the record. It can be at most 256 characters long and only consist
     *   of the following characters: `a`-`z`, `A`-`Z`, `0`-`9` and `!-_.'()`
     * @ignore
     */
    static async getRecord(key: string): Promise<KeyValueStoreRawRecord | null> {
        const store = await this.open();
        return store.getRecord(key);
    }

    /**
     * Tests whether a record with the given key exists in the default {@apilink KeyValueStore} associated with the current crawler run.
     * @param key The queried record key.
     * @returns `true` if the record exists, `false` if it does not.
     */
    static async recordExists(key: string): Promise<boolean> {
        const store = await this.open();
        return store.recordExists(key);
    }

    static async getAutoSavedValue<T extends Dictionary = Dictionary>(key: string, defaultValue = {} as T): Promise<T> {
        const store = await this.open();
        return store.getAutoSavedValue(key, defaultValue);
    }

    /**
     * Stores or deletes a value in the default {@apilink KeyValueStore} associated with the current crawler run.
     *
     * This is just a convenient shortcut for  {@apilink KeyValueStore.setValue}.
     * For example, calling the following code:
     * ```javascript
     * await KeyValueStore.setValue('OUTPUT', { foo: "bar" });
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const store = await KeyValueStore.open();
     * await store.setValue('OUTPUT', { foo: "bar" });
     * ```
     *
     * To get a value from the default key-value store, you can use the  {@apilink KeyValueStore.getValue} function.
     *
     * For more information, see  {@apilink KeyValueStore.open}
     * and  {@apilink KeyValueStore.getValue}.
     *
     * @param key
     *   Unique record key.
     * @param value
     *   Record data, which can be one of the following values:
     *    - If `null`, the record in the key-value store is deleted.
     *    - If no `options.contentType` is specified, `value` can be any JavaScript object, and it will be stringified to JSON.
     *    - If `options.contentType` is set, `value` is taken as is, and it must be a `String` or [`Buffer`](https://nodejs.org/api/buffer.html).
     *   For any other value an error will be thrown.
     * @param [options]
     * @ignore
     */
    static async setValue<T>(key: string, value: T | null, options: RecordOptions = {}): Promise<void> {
        const store = await this.open();
        return store.setValue(key, value, options);
    }

    /**
     * Gets the crawler input value from the default {@apilink KeyValueStore} associated with the current crawler run.
     *
     * The input is read from the default {@apilink KeyValueStore} under the configured input key
     * (`CRAWLEE_INPUT_KEY`, default `INPUT`).
     *
     * Note that the `getInput()` function does not cache the value read from the key-value store.
     * If you need to use the input multiple times in your crawler,
     * it is far more efficient to read it once and store it locally.
     *
     * For more information, see {@apilink KeyValueStore.open}
     * and {@apilink KeyValueStore.getValue}.
     *
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or `null`
     *   if the record is missing.
     * @ignore
     */
    static async getInput<T = Dictionary | string | Buffer>(): Promise<T | null> {
        const store = await this.open();
        return store.getValue<T>(store.configuration.inputKey);
    }
}

/** Normalizes a codec-serialized value into the `Buffer | ArrayBuffer` shape raw record reads promise. */
function normalizeSerializedValue(value: ReturnType<typeof serializeValue>['value']): Buffer | ArrayBuffer {
    if (typeof value === 'string') {
        return Buffer.from(value);
    }

    if (ArrayBuffer.isView(value)) {
        return Buffer.isBuffer(value) ? value : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    }

    return value as Buffer | ArrayBuffer;
}

/** Computes the key listing item (serialized byte size and content type) of a buffered entry. */
function bufferedKeyItemData(key: string, entry: { value: unknown; options?: RecordOptions }): KeyValueStoreItemData {
    const serialized = serializeValue(entry.value, entry.options?.contentType);

    return {
        key,
        size: normalizeSerializedValue(serialized.value).byteLength,
        contentType: serialized.contentType,
    };
}

/**
 * User-function used in the  {@apilink KeyValueStore.forEachKey} method.
 */
export interface KeyConsumer {
    /**
     * @param key Current {@apilink KeyValueStore} key being processed.
     * @param index Position of the current key in {@apilink KeyValueStore}.
     * @param info Information about the current {@apilink KeyValueStore} entry.
     * @param info.size Size of the value associated with the current key in bytes.
     */
    (key: string, index: number, info: { size: number }): Awaitable<void>;
}

export interface KeyValueStoreOptions {
    /** Resolved metadata for the key-value store, as returned by the backend's `getMetadata()`. */
    metadata: KeyValueStoreInfo;
    backend: KeyValueStoreBackend;
}

/**
 * A raw, unparsed key-value store record as returned by {@apilink KeyValueStore.getRecord}: the
 * verbatim bytes plus the content type, with parsing left to the caller.
 */
export interface KeyValueStoreRawRecord {
    value: Buffer | ArrayBuffer;
    contentType: string | null;
}

export interface RecordOptions {
    /**
     * Specifies a custom MIME content type of the record.
     */
    contentType?: string;
}

export interface KeyValueStoreIteratorOptions {
    /**
     * If set, only keys that start with this prefix are returned.
     */
    prefix?: string;
}
