import { Readable } from 'node:stream';

import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import { parseArgument, schemas } from '@crawlee/utils/internal';
import { z } from 'zod';

import type {
    FileSystemKeyValueStoreClient as NativeFileSystemKeyValueStoreBackend,
    ListBareFallback,
} from '@crawlee/fs-storage-native';
import { isStream } from '../utils.js';
import { CachedIdClient } from './cached-id-client.js';

/**
 * Out-of-band ("bare") value-file fallbacks tried when a run-input lookup misses the tracked record, so a
 * lookup for `INPUT` also matches a hand-placed `INPUT.json`/`.txt`/`.bin`. Passed to the native
 * `resolveValue`/`resolveExistingKey`, which do the probing and re-keying.
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

/**
 * The conventional run-input key. Always treated as a run-input key (readable from a bare file and
 * preserved on purge) alongside the configured {@link KeyValueStoreBackendOptions.inputKey}, so that
 * pointing the run at a different key never makes an existing `INPUT.json` unreadable or purgeable.
 */
const DEFAULT_INPUT_KEY = 'INPUT';

const keySchema = z.string();

const inputRecordShape = z.object({
    key: z.string().min(1),
    value: z.union([
        z.string(),
        z.instanceof(Buffer),
        z.instanceof(ArrayBuffer),
        schemas.typedArray,
        // A stream is an object; this only checks it is a non-null, non-array object
        // (the stream guard in `setValue` does the real check).
        schemas.plainObject,
    ]),
    contentType: z.string().min(1).optional(),
});

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
    /**
     * The key the run input is read from (Crawlee's `inputKey` / `CRAWLEE_INPUT_KEY`). Like `INPUT`, it
     * may live on disk as a bare value file with no metadata sidecar (e.g. the Apify CLI writes the
     * effective input to `__CLI_INPUT.json` and points the run at it), so it gets the same
     * out-of-band read fallback and is preserved when the default store is purged.
     *
     * @default 'INPUT'
     */
    inputKey?: string;
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

    readonly #nativeBackend: NativeFileSystemKeyValueStoreBackend;

    /** The logical run-input keys: `INPUT` plus the configured `inputKey` (deduplicated). */
    readonly #inputKeys: string[];

    /**
     * The out-of-band ("bare") files to surface from the native `listKeys`, i.e. {@link #inputKeys} ×
     * {@link BARE_FILE_FALLBACKS}. Each native {@link ListBareFallback} `name` is the literal on-disk
     * filename to probe (e.g. `INPUT.json`), and the native lists a match under that same `name` — which
     * is exactly the key we return, so a listed bare file round-trips through `getValue`/`recordExists`
     * (see {@link #bareFallbacksFor}).
     */
    readonly #listBareFallbacks: ListBareFallback[];

    /** Maps a bare file's on-disk name (e.g. `INPUT.json`) to its logical key (e.g. `INPUT`), for dedup. */
    readonly #bareFileLogicalKeys: Map<string, string>;

    constructor(options: KeyValueStoreBackendOptions) {
        super();
        this.name = options.name;
        this.cacheKey = options.cacheKey;
        this.#nativeBackend = options.nativeBackend;
        this.#inputKeys = [...new Set([DEFAULT_INPUT_KEY, options.inputKey ?? DEFAULT_INPUT_KEY])];
        this.#listBareFallbacks = this.#inputKeys.flatMap((key) =>
            BARE_FILE_FALLBACKS.map(({ extension, contentType }) => ({ name: `${key}${extension}`, contentType })),
        );
        this.#bareFileLogicalKeys = new Map(
            this.#inputKeys.flatMap((key) =>
                BARE_FILE_FALLBACKS.map(({ extension }) => [`${key}${extension}`, key] as const),
            ),
        );
    }

    get keyValueStoreDirectory(): string {
        return this.#nativeBackend.pathToKvs;
    }

    static async create(options: KeyValueStoreBackendOptions): Promise<KeyValueStoreBackend> {
        const backend = new KeyValueStoreBackend(options);
        backend.cachedId = (await options.nativeBackend.getMetadata()).id;
        return backend;
    }

    async getMetadata(): Promise<storage.KeyValueStoreInfo> {
        return this.#nativeBackend.getMetadata();
    }

    async drop(): Promise<void> {
        await this.#nativeBackend.dropStorage();
    }

    async purge(): Promise<void> {
        await this.#nativeBackend.purge();
    }

    /**
     * Remove every record from the store except the run input. Used by
     * {@link FileSystemStorageBackend.purge} to clean the default key-value store at the start of a run
     * while preserving the run's input, matching the historical file-system storage behavior.
     *
     * The native `purge` keep-list matches by exact key with no extension globbing, so we pass every
     * filename the input might live under (`INPUT`, `INPUT.json`, `INPUT.txt`, `INPUT.bin`, and the same
     * ladder for the configured `inputKey`).
     */
    async purgeExceptInput(): Promise<void> {
        const keep = this.#inputKeys.flatMap((key) => BARE_FILE_FALLBACKS.map(({ extension }) => `${key}${extension}`));
        await this.#nativeBackend.purge(keep);
    }

    async listKeys(options: storage.KeyValueStoreListKeysOptions = {}): Promise<storage.KeyValueStoreListKeysResult> {
        const { prefix, exclusiveStartKey, limit } = parseArgument(options, schemas.keyValueStoreListKeysOptions);

        // Pass the bare-file fallbacks so out-of-band value files (e.g. a hand-placed `INPUT.json`)
        // are enumerated alongside tracked records, under their actual on-disk name. The native reads
        // everything it needs off the filesystem index — no per-file reads — so this stays cheap.
        // The native `listKeys` already returns a self-describing page (items + pagination cursors)
        // matching the `KeyValueStoreListKeysResult` contract, so we only post-process the items.
        const page = await this.#nativeBackend.listKeys(exclusiveStartKey, limit, prefix, this.#listBareFallbacks);

        const presentKeys = new Set(page.items.map((record) => record.key));

        // A bare value file is listed under its actual name (`INPUT.json`), which already round-trips
        // through `getValue`/`recordExists`. The only collision is a tracked record occupying the
        // logical key itself (`INPUT`): it shadows the extension-bearing bare variants (`INPUT.json`
        // etc.) for the same logical key, so drop those. The extensionless bare file *is* the logical
        // key, so it is never a separate duplicate.
        const items = page.items.filter((record) => {
            const logicalKey = this.#bareFileLogicalKeys.get(record.key);
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
     * The native `getPublicUrl` derives the URL from the key without probing bare-file extensions, so
     * an `INPUT` that lives on disk as a hand-placed `INPUT.json` is resolved first. Nothing on disk
     * means nothing to resolve — the requested key is used as-is, and the URL is the one the record will
     * have once written.
     * @param key The key of the record to generate the public URL for.
     */
    async getPublicUrl(key: string): Promise<string | undefined> {
        parseArgument(key, keySchema);

        const resolvedKey = (await this.resolveExistingKey(key)) ?? key;
        return this.#nativeBackend.getPublicUrl(resolvedKey);
    }

    /**
     * Tests whether a record with the given key exists without retrieving its value.
     *
     * @param key The queried record key.
     * @returns `true` if the record exists, `false` otherwise.
     */
    async recordExists(key: string): Promise<boolean> {
        parseArgument(key, keySchema);
        return (await this.resolveExistingKey(key)) !== undefined;
    }

    async getValue(key: string): Promise<storage.KeyValueStoreRecord | undefined> {
        parseArgument(key, keySchema);

        const fallbacks = this.#bareFallbacksFor(key);
        const record = fallbacks
            ? await this.#nativeBackend.resolveValue(key, fallbacks)
            : await this.#nativeBackend.getValue(key);

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
        parseArgument(record, inputRecordShape);

        const { key, value } = record;
        // The frontend resolves the content type before it reaches the backend; this backend is a plain
        // byte transport and does not infer content types.
        const contentType = record.contentType ?? 'application/octet-stream';

        // Stream the value straight to disk without buffering it all into memory. The native client
        // consumes a Web `ReadableStream`, so convert the Node `Readable` we get from the frontend.
        if (isStream(value)) {
            const webStream = Readable.toWeb(value as Readable) as ReadableStream<Uint8Array>;
            await this.#nativeBackend.setValueStream(key, webStream, contentType);
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

        await this.#nativeBackend.setValue(key, buffer, contentType);
    }

    async deleteValue(key: string): Promise<void> {
        parseArgument(key, keySchema);
        await this.#nativeBackend.deleteValue(key);
    }

    /**
     * Resolve `key` to the on-disk key that actually exists, or `undefined` if nothing does. Every
     * key is checked against its tracked record; the run-input keys additionally fall back to
     * out-of-band bare files, in which case the matched on-disk key is returned so callers like
     * `getPublicUrl` point at the file that exists. Two run-input shapes are handled (see
     * {@link #bareFallbacksFor}): a logical input key such as `INPUT`, which probes the conventional extensions,
     * and a literal bare filename such as `INPUT.json` as listed by `listKeys`, which resolves itself.
     */
    private async resolveExistingKey(key: string): Promise<string | undefined> {
        const fallbacks = this.#bareFallbacksFor(key);
        if (fallbacks) {
            return (
                (await this.#nativeBackend.resolveExistingKey(
                    key,
                    fallbacks.map(({ extension }) => extension),
                )) ?? undefined
            );
        }
        return (await this.#nativeBackend.recordExists(key)) ? key : undefined;
    }

    /**
     * The native `resolveValue`/`resolveExistingKey` bare-file fallbacks to use for `key`, or
     * `undefined` if `key` is a plain tracked-record lookup with no bare-file probing.
     *
     * - A logical run-input key (`INPUT`, or the configured `inputKey`) probes the full extension ladder
     *   (`INPUT`, `INPUT.json`, `INPUT.txt`, `INPUT.bin`), matching how Crawlee reads run input.
     * - A literal bare filename as surfaced by `listKeys` (`INPUT.json`/`.txt`/`.bin`) resolves itself:
     *   the tracked record first, then the bare file at that exact name (a single empty-extension
     *   fallback), so a listed key round-trips through `getValue`/`recordExists`. The extensionless
     *   name is the logical key itself and is covered by the first case.
     */
    #bareFallbacksFor(key: string): { extension: string; contentType: string }[] | undefined {
        if (this.#inputKeys.includes(key)) {
            return BARE_FILE_FALLBACKS;
        }
        const logicalKey = this.#bareFileLogicalKeys.get(key);
        if (logicalKey === undefined) {
            return undefined;
        }
        const { contentType } = BARE_FILE_FALLBACKS.find(({ extension }) => `${logicalKey}${extension}` === key)!;
        return [{ extension: '', contentType }];
    }
}
