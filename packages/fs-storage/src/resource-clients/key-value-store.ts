import { Readable } from 'node:stream';

import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import type {
    FileSystemKeyValueStoreClient as NativeFileSystemKeyValueStoreBackend,
    ListBareFallback,
} from '@crawlee/fs-storage-native';
import { isStream } from '../utils.js';
import { CachedIdClient } from './cached-id-client.js';

/**
 * Out-of-band ("bare") value-file fallbacks tried when the {@link ALLOWED_BARE_FILES} lookup misses the tracked
 * record, so a lookup for `INPUT` also matches a hand-placed `INPUT.json`/`.txt`/`.bin`. Passed to the
 * native `resolveValue`/`resolveExistingKey`, which do the probing and re-keying.
 *
 * Each entry declares the content type to report on a match — the native client does no MIME
 * inference. An empty `contentType` is its sentinel for "keep the synthesized
 * `application/octet-stream`", used for the extensionless key and `.bin`.
 */
const BARE_FILE_FALLBACKS: { extension: string; contentType: string }[] = [
    { extension: '', contentType: '' },
    { extension: '.json', contentType: 'application/json; charset=utf-8' },
    { extension: '.txt', contentType: 'text/plain; charset=utf-8' },
    { extension: '.bin', contentType: '' },
];

const ALLOWED_BARE_FILES = ['INPUT'];

/**
 * The out-of-band ("bare") files to surface from the native `listKeys`, derived from
 * {@link ALLOWED_BARE_FILES} × {@link BARE_FILE_FALLBACKS}. Each native {@link ListBareFallback}
 * `name` is the literal on-disk filename to probe (e.g. `INPUT.json`), and the native lists a match
 * under that same `name` — which is exactly the key we return, so a listed bare file round-trips
 * through `getValue`/`recordExists` (see {@link BARE_FILE_CONTENT_TYPES}).
 */
const LIST_BARE_FALLBACKS: ListBareFallback[] = ALLOWED_BARE_FILES.flatMap((key) =>
    BARE_FILE_FALLBACKS.map(({ extension, contentType }) => ({ name: `${key}${extension}`, contentType })),
);

/**
 * Lookup from a bare file's literal on-disk name (e.g. `INPUT.json`) to the content type to report
 * for it, used to read a listed bare key back directly (`getValue('INPUT.json')`). The empty-extension
 * entry (`INPUT`) is intentionally excluded: an extensionless `INPUT` lookup goes through the
 * `resolveValue` fallback probing instead, which already covers the extensionless file.
 */
const BARE_FILE_CONTENT_TYPES = new Map(
    ALLOWED_BARE_FILES.flatMap((key) =>
        BARE_FILE_FALLBACKS.filter(({ extension }) => extension !== '').map(
            ({ extension, contentType }) => [`${key}${extension}`, contentType] as const,
        ),
    ),
);

/** Maps a bare file's on-disk name (e.g. `INPUT.json`) to its logical key (e.g. `INPUT`), for dedup. */
const BARE_FILE_LOGICAL_KEYS = new Map(
    ALLOWED_BARE_FILES.flatMap((key) =>
        BARE_FILE_FALLBACKS.map(({ extension }) => [`${key}${extension}`, key] as const),
    ),
);

export interface KeyValueStoreBackendOptions {
    /** The user-facing storage name, or `undefined` for unnamed (alias / default) storages. */
    name?: string;
    /**
     * The key used for cache lookup in {@link FileSystemStorageBackend}. For named storages this equals
     * the name; for alias (unnamed) storages it is the alias string. Falls back to the storage id.
     */
    cacheKey: string;
    nativeBackend: NativeFileSystemKeyValueStoreBackend;
    logger?: CrawleeLogger;
}

/**
 * A file-system key-value store backend backed by the native `@crawlee/fs-storage-native` Rust
 * extension.
 *
 * This adapter is a plain byte transport: values are written and read verbatim as `Buffer`s with a
 * content type carried alongside them. Serializing arbitrary values into bytes and parsing them back
 * is the {@apilink KeyValueStore} frontend codec's job, not this backend's.
 */
export class KeyValueStoreBackend extends CachedIdClient implements storage.KeyValueStoreBackend {
    readonly name?: string;
    readonly cacheKey: string;

    private readonly nativeBackend: NativeFileSystemKeyValueStoreBackend;

    constructor(options: KeyValueStoreBackendOptions) {
        super();
        this.name = options.name;
        this.cacheKey = options.cacheKey;
        this.nativeBackend = options.nativeBackend;
    }

    get keyValueStoreDirectory(): string {
        return this.nativeBackend.pathToKvs;
    }

    static async create(options: KeyValueStoreBackendOptions): Promise<KeyValueStoreBackend> {
        const backend = new KeyValueStoreBackend(options);
        backend.cachedId = (await options.nativeBackend.getMetadata()).id;
        return backend;
    }

    async getMetadata(): Promise<storage.KeyValueStoreInfo> {
        return this.nativeBackend.getMetadata();
    }

    async drop(): Promise<void> {
        await this.nativeBackend.dropStorage();
    }

    async purge(): Promise<void> {
        await this.nativeBackend.purge();
    }

    /**
     * Remove every record from the store except the run input. Used by
     * {@link FileSystemStorageBackend.purge} to clean the default key-value store at the start of a run
     * while preserving the run's input, matching the historical file-system storage behavior.
     *
     * The native `purge` keep-list matches by exact key with no extension globbing, so we pass every
     * filename the input might live under (`INPUT`, `INPUT.json`, `INPUT.txt`, `INPUT.bin`).
     */
    async purgeExceptInput(): Promise<void> {
        await this.nativeBackend.purge(BARE_FILE_FALLBACKS.flatMap(({ extension }) => `INPUT${extension}`));
    }

    async listKeys(options: storage.KeyValueStoreListKeysOptions = {}): Promise<storage.KeyValueStoreListKeysResult> {
        const { prefix, exclusiveStartKey, limit } = s
            .object({
                prefix: s.string().optional(),
                exclusiveStartKey: s.string().optional(),
                limit: s.number().int().greaterThan(0).optional(),
            })
            .parse(options);

        // Pass the bare-file fallbacks so out-of-band value files (e.g. a hand-placed `INPUT.json`)
        // are enumerated alongside tracked records, under their actual on-disk name. The native reads
        // everything it needs off the filesystem index — no per-file reads — so this stays cheap.
        // The native `listKeys` already returns a self-describing page (items + pagination cursors)
        // matching the `KeyValueStoreListKeysResult` contract, so we only post-process the items.
        const page = await this.nativeBackend.listKeys(exclusiveStartKey, limit, prefix, LIST_BARE_FALLBACKS);

        const presentKeys = new Set(page.items.map((record) => record.key));

        // A bare value file is listed under its actual name (`INPUT.json`), which already round-trips
        // through `getValue`/`recordExists`. The only collision is a tracked record occupying the
        // logical key itself (`INPUT`): it shadows the extension-bearing bare variants (`INPUT.json`
        // etc.) for the same logical key, so drop those. The extensionless bare file *is* the logical
        // key, so it is never a separate duplicate.
        const items = page.items.filter((record) => {
            const logicalKey = BARE_FILE_LOGICAL_KEYS.get(record.key);
            const isExtensionBearingBareFile = logicalKey !== undefined && logicalKey !== record.key;
            return !(isExtensionBearingBareFile && presentKeys.has(logicalKey));
        });

        return {
            items,
            count: items.length,
            limit: page.limit,
            exclusiveStartKey: page.exclusiveStartKey,
            isTruncated: page.isTruncated,
            nextExclusiveStartKey: page.nextExclusiveStartKey,
        };
    }

    /**
     * Generates a public `file://` URL for accessing a specific record in the key-value store.
     *
     * Returns `undefined` if the record does not exist.
     * @param key The key of the record to generate the public URL for.
     */
    async getPublicUrl(key: string): Promise<string | undefined> {
        s.string().parse(key);

        // The native `getPublicUrl` stats the encoded path but does not probe bare-file extensions,
        // so we resolve the on-disk key first (handling e.g. `INPUT` -> `INPUT.json`) and normalize
        // the native `null`-for-missing result to the historical `undefined` contract.
        const resolvedKey = await this.resolveExistingKey(key);
        if (resolvedKey === undefined) {
            return undefined;
        }
        return (await this.nativeBackend.getPublicUrl(resolvedKey)) ?? undefined;
    }

    /**
     * Tests whether a record with the given key exists without retrieving its value.
     *
     * @param key The queried record key.
     * @returns `true` if the record exists, `false` otherwise.
     */
    async recordExists(key: string): Promise<boolean> {
        s.string().parse(key);
        return (await this.resolveExistingKey(key)) !== undefined;
    }

    async getValue(key: string): Promise<storage.KeyValueStoreRecord | undefined> {
        s.string().parse(key);

        const fallbacks = this.bareFallbacksFor(key);
        const record = fallbacks
            ? await this.nativeBackend.resolveValue(key, fallbacks)
            : await this.nativeBackend.getValue(key);

        if (record) {
            return {
                key: record.key,
                value: record.value,
                contentType: record.contentType,
            };
        }

        return undefined;
    }

    async setValue(record: storage.KeyValueStoreInputRecord): Promise<void> {
        // By the time a value reaches the backend the frontend (KeyValueStore codec) has already
        // serialized it: non-bytes become a `string`, everything else is a `Buffer`/typed array or a
        // stream. So we only accept those shapes here — there is no JSON inference or `String(value)`
        // coercion left to do.
        s.object({
            key: s.string().lengthGreaterThan(0),
            value: s.union([
                s.string(),
                s.instance(Buffer),
                s.instance(ArrayBuffer),
                s.typedArray(),
                // A stream is an object; disabling validation makes shapeshift only check it is a
                // non-null, non-array object (the stream guard below does the real check).
                s.object({}).setValidationEnabled(false),
            ]),
            contentType: s.string().lengthGreaterThan(0).optional(),
        }).parse(record);

        const { key, value } = record;
        // The frontend resolves the content type before it reaches the backend; this backend is a plain
        // byte transport and does not infer content types.
        const contentType = record.contentType ?? 'application/octet-stream';

        // Stream the value straight to disk without buffering it all into memory. The native client
        // consumes a Web `ReadableStream`, so convert the Node `Readable` we get from the frontend.
        if (isStream(value)) {
            const webStream = Readable.toWeb(value as Readable) as ReadableStream<Uint8Array>;
            await this.nativeBackend.setValueStream(key, webStream, contentType);
            return;
        }

        // Normalize the remaining (already-serialized) value into a Buffer for the native client.
        const buffer = Buffer.isBuffer(value)
            ? value
            : value instanceof ArrayBuffer
              ? Buffer.from(value)
              : ArrayBuffer.isView(value)
                ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
                : Buffer.from(value as string);

        await this.nativeBackend.setValue(key, buffer, contentType);
    }

    async deleteValue(key: string): Promise<void> {
        s.string().parse(key);
        await this.nativeBackend.deleteValue(key);
    }

    /**
     * Resolve `key` to the on-disk key that actually exists, or `undefined` if nothing does. Every
     * key is checked against its tracked record; the run-input keys additionally fall back to
     * out-of-band bare files, in which case the matched on-disk key is returned so callers like
     * `getPublicUrl` point at the file that exists. Two run-input shapes are handled (see
     * {@link bareFallbacksFor}): the logical `INPUT`, which probes the conventional extensions, and a
     * literal bare filename such as `INPUT.json` as listed by `listKeys`, which resolves itself.
     */
    private async resolveExistingKey(key: string): Promise<string | undefined> {
        const fallbacks = this.bareFallbacksFor(key);
        if (fallbacks) {
            return (
                (await this.nativeBackend.resolveExistingKey(
                    key,
                    fallbacks.map(({ extension }) => extension),
                )) ?? undefined
            );
        }
        return (await this.nativeBackend.recordExists(key)) ? key : undefined;
    }

    /**
     * The native `resolveValue`/`resolveExistingKey` bare-file fallbacks to use for `key`, or
     * `undefined` if `key` is a plain tracked-record lookup with no bare-file probing.
     *
     * - The logical run-input key (`INPUT`) probes the full extension ladder (`INPUT`, `INPUT.json`,
     *   `INPUT.txt`, `INPUT.bin`), matching how Crawlee reads run input.
     * - A literal bare filename as surfaced by `listKeys` (`INPUT.json`/`.txt`/`.bin`) resolves itself:
     *   the tracked record first, then the bare file at that exact name (a single empty-extension
     *   fallback), so a listed key round-trips through `getValue`/`recordExists`.
     */
    // eslint-disable-next-line class-methods-use-this
    private bareFallbacksFor(key: string): { extension: string; contentType: string }[] | undefined {
        if (ALLOWED_BARE_FILES.includes(key)) {
            return BARE_FILE_FALLBACKS;
        }
        const contentType = BARE_FILE_CONTENT_TYPES.get(key);
        if (contentType !== undefined) {
            return [{ extension: '', contentType }];
        }
        return undefined;
    }
}
