import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { MemoryStorageOptions } from '@crawlee/memory-storage';
import { MemoryStorage } from '@crawlee/memory-storage';
import type { StorageClient } from '@crawlee/types';
import { pathExistsSync } from 'fs-extra/esm';
import { z } from 'zod';

import log, { LogLevel } from '@apify/log';

import { type EventManager } from './events/event_manager.js';
import { LocalEventManager } from './events/local_event_manager.js';
import type { StorageManager } from './storages/storage_manager.js';
import type { Constructor } from './typedefs.js';

// ============================================================================
// Field Definition Helpers
// ============================================================================

/**
 * Defines a configuration field with its schema and optional environment variable mapping.
 */
export function field<T extends z.ZodType>(schema: T, options: { env?: string | string[] } = {}): ConfigField<T> {
    const envKeys = options.env ? (Array.isArray(options.env) ? options.env : [options.env]) : [];
    return { schema, envKeys };
}

export interface ConfigField<T extends z.ZodType = z.ZodType> {
    schema: T;
    envKeys: string[];
}

export type FieldDefinitions = Record<string, ConfigField>;

/**
 * Infer the input options type from field definitions.
 * All fields are optional for constructor input since they have defaults or env var fallbacks.
 */
export type InferInputOptions<T extends FieldDefinitions> = {
    [K in keyof T]?: z.input<T[K]['schema']>;
};

/**
 * Infer the output options type from field definitions.
 * Respects Zod's output types, so fields with defaults are non-optional.
 */
export type InferOutputOptions<T extends FieldDefinitions> = {
    [K in keyof T]: z.output<T[K]['schema']>;
};

// ============================================================================
// Zod Schemas for Complex Types
// ============================================================================

const storageClientSchema = z.custom<StorageClient>((val) => val != null);
const eventManagerSchema = z.custom<EventManager>((val) => val != null);
const dictionarySchema = z.record(z.unknown());

/** Boolean coercion that treats '0', 'false', '' as falsy */
export const coerceBoolean = z.preprocess((val) => {
    if (typeof val === 'string') {
        return !['0', 'false', ''].includes(val.toLowerCase());
    }
    return Boolean(val);
}, z.boolean());

/** Log level schema that accepts both string names and numeric values */
export const logLevelSchema = z.preprocess((val) => {
    if (val == null) return undefined;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const num = Number(val);
        if (Number.isFinite(num)) return num;
        return LogLevel[val.toUpperCase() as keyof typeof LogLevel];
    }
    return val;
}, z.nativeEnum(LogLevel).optional());

// ============================================================================
// Crawlee Configuration Field Definitions
// ============================================================================

/**
 * Field definitions for Crawlee Configuration.
 * Each field defines its Zod schema and optional environment variable mapping.
 *
 * To extend in Apify SDK:
 * ```ts
 * const apifyConfigFields = {
 *     ...crawleeConfigFields,
 *     token: field(z.string().optional(), { env: 'APIFY_TOKEN' }),
 *     actorId: field(z.string().optional(), { env: ['ACTOR_ID', 'APIFY_ACTOR_ID'] }),
 * };
 * ```
 */
export const crawleeConfigFields = {
    // Storage clients (no env vars, constructor only)
    storageClient: field(storageClientSchema.optional()),
    eventManager: field(eventManagerSchema.optional()),
    storageClientOptions: field(dictionarySchema.default({})),

    // Storage IDs
    defaultDatasetId: field(z.string().default('default'), {
        env: 'CRAWLEE_DEFAULT_DATASET_ID',
    }),
    defaultKeyValueStoreId: field(z.string().default('default'), {
        env: 'CRAWLEE_DEFAULT_KEY_VALUE_STORE_ID',
    }),
    defaultRequestQueueId: field(z.string().default('default'), {
        env: 'CRAWLEE_DEFAULT_REQUEST_QUEUE_ID',
    }),

    // Storage behavior
    purgeOnStart: field(coerceBoolean.default(true), {
        env: 'CRAWLEE_PURGE_ON_START',
    }),
    persistStorage: field(coerceBoolean.default(true), {
        env: 'CRAWLEE_PERSIST_STORAGE',
    }),

    // Memory and CPU limits
    maxUsedCpuRatio: field(z.coerce.number().default(0.95)),
    availableMemoryRatio: field(z.coerce.number().default(0.25), {
        env: 'CRAWLEE_AVAILABLE_MEMORY_RATIO',
    }),
    memoryMbytes: field(z.coerce.number().optional(), {
        env: 'CRAWLEE_MEMORY_MBYTES',
    }),

    // Intervals
    persistStateIntervalMillis: field(z.coerce.number().default(60_000), {
        env: 'CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS',
    }),
    systemInfoIntervalMillis: field(z.coerce.number().default(1_000)),

    // Input
    inputKey: field(z.string().default('INPUT'), {
        env: 'CRAWLEE_INPUT_KEY',
    }),

    // Browser options
    headless: field(coerceBoolean.default(true), {
        env: 'CRAWLEE_HEADLESS',
    }),
    xvfb: field(coerceBoolean.default(false), {
        env: 'CRAWLEE_XVFB',
    }),
    chromeExecutablePath: field(z.string().optional(), {
        env: 'CRAWLEE_CHROME_EXECUTABLE_PATH',
    }),
    defaultBrowserPath: field(z.string().optional(), {
        env: 'CRAWLEE_DEFAULT_BROWSER_PATH',
    }),
    disableBrowserSandbox: field(coerceBoolean.optional(), {
        env: 'CRAWLEE_DISABLE_BROWSER_SANDBOX',
    }),

    // Logging
    logLevel: field(logLevelSchema, {
        env: 'CRAWLEE_LOG_LEVEL',
    }),

    // System info
    systemInfoV2: field(coerceBoolean.default(true), {
        env: 'CRAWLEE_SYSTEM_INFO_V2',
    }),
    containerized: field(coerceBoolean.optional(), {
        env: 'CRAWLEE_CONTAINERIZED',
    }),
} as const;

export type CrawleeConfigFields = typeof crawleeConfigFields;

// ============================================================================
// Configuration Options Types
// ============================================================================

/** Input options for Configuration constructor (all fields optional) */
export type ConfigurationOptions = InferInputOptions<CrawleeConfigFields>;

/** Output options from Configuration.get() (respects defaults) */
export type ConfigurationValues = InferOutputOptions<CrawleeConfigFields>;

// ============================================================================
// Configuration Class
// ============================================================================

/**
 * `Configuration` is a value object holding Crawlee configuration. By default, there is a
 * global singleton instance of this class available via `Configuration.getGlobalConfig()`.
 * Places that depend on a configurable behaviour depend on this class, as they have the global
 * instance as the default value.
 *
 * *Using global configuration:*
 * ```js
 * import { BasicCrawler, Configuration } from 'crawlee';
 *
 * // Get the global configuration
 * const config = Configuration.getGlobalConfig();
 * // Set the 'persistStateIntervalMillis' option
 * // of global configuration to 10 seconds
 * config.set('persistStateIntervalMillis', 10_000);
 *
 * // No need to pass the configuration to the crawler,
 * // as it's using the global configuration by default
 * const crawler = new BasicCrawler();
 * ```
 *
 * *Using custom configuration:*
 * ```js
 * import { BasicCrawler, Configuration } from 'crawlee';
 *
 * // Create a new configuration
 * const config = new Configuration({ persistStateIntervalMillis: 30_000 });
 * // Pass the configuration to the crawler
 * const crawler = new BasicCrawler({ ... }, config);
 * ```
 *
 * The configuration provided via constructor always takes precedence. Environment variables
 * come second, followed by `crawlee.json` file in the project root directory. In other words,
 * the precedence is:
 *
 * ```text
 * constructor options > environment variables > crawlee.json > defaults
 * ```
 *
 * ## Supported Configuration Options
 *
 * Key | Environment Variable | Default Value
 * ---|---|---
 * `memoryMbytes` | `CRAWLEE_MEMORY_MBYTES` | -
 * `logLevel` | `CRAWLEE_LOG_LEVEL` | -
 * `headless` | `CRAWLEE_HEADLESS` | `true`
 * `defaultDatasetId` | `CRAWLEE_DEFAULT_DATASET_ID` | `'default'`
 * `defaultKeyValueStoreId` | `CRAWLEE_DEFAULT_KEY_VALUE_STORE_ID` | `'default'`
 * `defaultRequestQueueId` | `CRAWLEE_DEFAULT_REQUEST_QUEUE_ID` | `'default'`
 * `persistStateIntervalMillis` | `CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS` | `60_000`
 * `purgeOnStart` | `CRAWLEE_PURGE_ON_START` | `true`
 * `persistStorage` | `CRAWLEE_PERSIST_STORAGE` | `true`
 *
 * ## Advanced Configuration Options
 *
 * Key | Environment Variable | Default Value
 * ---|---|---
 * `inputKey` | `CRAWLEE_INPUT_KEY` | `'INPUT'`
 * `xvfb` | `CRAWLEE_XVFB` | -
 * `chromeExecutablePath` | `CRAWLEE_CHROME_EXECUTABLE_PATH` | -
 * `defaultBrowserPath` | `CRAWLEE_DEFAULT_BROWSER_PATH` | -
 * `disableBrowserSandbox` | `CRAWLEE_DISABLE_BROWSER_SANDBOX` | -
 * `availableMemoryRatio` | `CRAWLEE_AVAILABLE_MEMORY_RATIO` | `0.25`
 * `systemInfoV2` | `CRAWLEE_SYSTEM_INFO_V2` | false
 * `containerized` | `CRAWLEE_CONTAINERIZED` | -
 */
export class Configuration<
    TFields extends FieldDefinitions = CrawleeConfigFields,
    TInput extends InferInputOptions<TFields> = InferInputOptions<TFields>,
    TOutput extends InferOutputOptions<TFields> = InferOutputOptions<TFields>,
> {
    /**
     * Field definitions for this configuration class.
     * Override in subclasses to add new fields.
     */
    static fields: FieldDefinitions = crawleeConfigFields;

    /**
     * Extends an existing field with additional environment variable mappings.
     * The new env vars are checked first, then the base field's env vars.
     * Intended for use when extending Configuration in other packages (e.g., Apify SDK).
     *
     * @example
     * ```ts
     * const apifyConfigFields = {
     *     ...crawleeConfigFields,
     *     // Adds ACTOR_* and APIFY_* aliases, keeps CRAWLEE_* from base
     *     defaultDatasetId: Configuration.extendField(crawleeConfigFields.defaultDatasetId, {
     *         env: ['ACTOR_DEFAULT_DATASET_ID', 'APIFY_DEFAULT_DATASET_ID'],
     *     }),
     * };
     * ```
     */
    static extendField<T extends z.ZodType>(
        baseField: ConfigField<T>,
        options: { env?: string | string[] } = {},
    ): ConfigField<T> {
        const newEnvKeys = options.env ? (Array.isArray(options.env) ? options.env : [options.env]) : [];
        return {
            schema: baseField.schema,
            envKeys: [...newEnvKeys, ...baseField.envKeys],
        };
    }

    /**
     * Provides access to the current-instance-scoped Configuration without passing it around in parameters.
     * @internal
     */
    static storage = new AsyncLocalStorage<Configuration>();

    /** @internal */
    static globalConfig?: Configuration;

    protected options = new Map<keyof TInput, unknown>();
    protected services = new Map<string, unknown>();
    protected userOptions = new Set<keyof TInput>();

    public readonly storageManagers = new Map<Constructor, StorageManager>();

    /**
     * Creates new `Configuration` instance with provided options.
     * Constructor options take precedence over environment variables.
     */
    constructor(options: TInput = {} as TInput) {
        this.buildOptions(options);

        // Increase the global limit for event emitter memory leak warnings.
        EventEmitter.defaultMaxListeners = 50;

        // Set the log level
        const logLevel = this.get('logLevel' as keyof TOutput);

        if (logLevel != null) {
            log.setLevel(logLevel as LogLevel);
        }
    }

    /**
     * Returns the field definitions for this configuration class.
     * Uses the static `fields` property from the actual class (supports inheritance).
     */
    protected getFields(): TFields {
        return (this.constructor as typeof Configuration).fields as TFields;
    }

    /**
     * Returns configured value. First checks constructor options, then environment variables,
     * then crawlee.json values, and finally falls back to the default value.
     */
    get<K extends keyof TOutput>(key: K, defaultValue: NonNullable<TOutput[K]>): NonNullable<TOutput[K]>;
    get<K extends keyof TOutput>(key: K, defaultValue?: TOutput[K]): TOutput[K];
    get<K extends keyof TOutput>(key: K, defaultValue?: TOutput[K]): TOutput[K] {
        const fields = this.getFields();
        const fieldDef = fields[key as string] as ConfigField | undefined;

        // 1. Constructor options take precedence
        if (this.userOptions.has(key as keyof TInput) && this.options.has(key as keyof TInput)) {
            return this.options.get(key as keyof TInput) as TOutput[K];
        }

        // 2. Check environment variables
        if (fieldDef?.envKeys.length) {
            for (const envKey of fieldDef.envKeys) {
                const envValue = process.env[envKey];
                if (envValue != null && envValue !== '') {
                    // Parse through the field's schema for type coercion
                    const parsed = fieldDef.schema.safeParse(envValue);
                    if (parsed.success) {
                        return parsed.data as TOutput[K];
                    }
                }
            }
        }

        // 3. Check options from crawlee.json (stored in options but not in userOptions)
        if (this.options.has(key as keyof TInput)) {
            return this.options.get(key as keyof TInput) as TOutput[K];
        }

        // 4. Fall back to schema default or provided default
        if (defaultValue !== undefined) {
            return defaultValue;
        }

        if (fieldDef) {
            const parsed = fieldDef.schema.safeParse(undefined);
            if (parsed.success) {
                return parsed.data as TOutput[K];
            }
        }

        return undefined as TOutput[K];
    }

    /**
     * Sets value for given option. Only affects this `Configuration` instance,
     * the value will not be propagated down to the env var.
     * To reset a value, we can omit the `value` argument or pass `undefined` there.
     */
    set<K extends keyof TInput>(key: K, value?: TInput[K]): void {
        this.options.set(key, value);
        this.userOptions.add(key);
    }

    /**
     * Sets value for given option on the global configuration instance.
     */
    static set<K extends keyof ConfigurationOptions>(key: K, value?: ConfigurationOptions[K]): void {
        this.getGlobalConfig().set(key, value);
    }

    /**
     * Returns cached instance of {@apilink StorageClient} using options as defined in the environment variables or in
     * this {@apilink Configuration} instance.
     * @internal
     */
    getStorageClient(): StorageClient {
        const storageClient = this.options.get('storageClient' as keyof TInput);
        if (storageClient) {
            return storageClient as StorageClient;
        }

        const options = this.get('storageClientOptions' as keyof TOutput) as Record<string, unknown> | undefined;
        return this.createMemoryStorage(options);
    }

    getEventManager(): EventManager {
        const eventManager = this.options.get('eventManager' as keyof TInput);
        if (eventManager) {
            return eventManager as EventManager;
        }

        if (this.services.has('eventManager')) {
            return this.services.get('eventManager') as EventManager;
        }

        const newEventManager = new LocalEventManager(this as unknown as Configuration);
        this.services.set('eventManager', newEventManager);

        return newEventManager;
    }

    /**
     * Creates an instance of MemoryStorage using options as defined in the environment variables or in this `Configuration` instance.
     * @internal
     */
    createMemoryStorage(options: MemoryStorageOptions = {}): MemoryStorage {
        const cacheKey = `MemoryStorage-${JSON.stringify(options)}`;

        if (this.services.has(cacheKey)) {
            return this.services.get(cacheKey) as MemoryStorage;
        }

        const storage = new MemoryStorage({
            persistStorage: this.get('persistStorage' as keyof TOutput) as boolean | undefined,
            ...options,
        });
        this.services.set(cacheKey, storage);

        return storage;
    }

    useStorageClient(client: StorageClient): void {
        this.options.set('storageClient' as keyof TInput, client as TInput[keyof TInput]);
        this.userOptions.add('storageClient' as keyof TInput);
    }

    static useStorageClient(client: StorageClient): void {
        this.getGlobalConfig().useStorageClient(client);
    }

    useEventManager(events: EventManager): void {
        this.options.set('eventManager' as keyof TInput, events as TInput[keyof TInput]);
        this.userOptions.add('eventManager' as keyof TInput);
    }

    /**
     * Returns the global configuration instance. It will respect the environment variables.
     */
    static getGlobalConfig(): Configuration {
        if (Configuration.storage.getStore()) {
            return Configuration.storage.getStore()!;
        }

        Configuration.globalConfig ??= new Configuration();
        return Configuration.globalConfig;
    }

    /**
     * Gets default {@apilink StorageClient} instance.
     */
    static getStorageClient(): StorageClient {
        return this.getGlobalConfig().getStorageClient();
    }

    /**
     * Gets default {@apilink EventManager} instance.
     */
    static getEventManager(): EventManager {
        return this.getGlobalConfig().getEventManager();
    }

    /**
     * Resets global configuration instance. The default instance holds configuration based on env vars,
     * if we want to change them, we need to first reset the global state. Used mainly for testing purposes.
     */
    static resetGlobalState(): void {
        delete this.globalConfig;
    }

    protected buildOptions(options: TInput) {
        // Track which options were explicitly provided by the user
        this.userOptions = new Set(Object.keys(options) as (keyof TInput)[]);

        // Try to load configuration from crawlee.json as the baseline
        const path = join(process.cwd(), 'crawlee.json');

        if (pathExistsSync(path)) {
            try {
                const file = readFileSync(path);
                const optionsFromFileConfig = JSON.parse(file.toString());
                // File config is baseline, user options override
                options = { ...optionsFromFileConfig, ...options };
            } catch {
                // ignore
            }
        }

        // Store all options
        for (const [key, value] of Object.entries(options)) {
            this.options.set(key as keyof TInput, value);
        }
    }
}
