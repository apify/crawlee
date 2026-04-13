import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { log, LogLevel } from './log.js';
import { serviceLocator } from './service_locator.js';

// Increase the global limit for event emitter memory leak warnings.
EventEmitter.defaultMaxListeners = 50;

// --- Field definition helpers ---

export interface ConfigField<T extends z.ZodType = z.ZodType> {
    schema: T;
    envVar?: string | string[];
}

export function field<T extends z.ZodType>(schema: T, envVar?: string | string[]): ConfigField<T> {
    return { schema, envVar };
}

// --- Zod preprocessors ---

/** Zod preprocessor treating `'0'`, `'false'`, and `''` as falsy. */
export const coerceBoolean = z.preprocess((val) => {
    if (typeof val === 'string') {
        return !['0', 'false', ''].includes(val.toLowerCase());
    }
    return val;
}, z.boolean());

export const coerceNumber = z.preprocess((val) => {
    if (typeof val === 'string') return Number(val);
    return val;
}, z.number());

/** Zod schema accepting both LogLevel enum values and string names (case-insensitive). */
const logLevelSchema = z.preprocess((val) => {
    if (val == null) return val;
    const s = String(val);
    if (Number.isFinite(+s)) return +s;
    const key = s.toUpperCase() as keyof typeof LogLevel;
    if (key in LogLevel) return LogLevel[key];
    return val;
}, z.nativeEnum(LogLevel));

// --- Crawlee config field definitions ---

export const crawleeConfigFields = {
    /** @default 'default' */
    defaultDatasetId: field(z.string().default('default'), 'CRAWLEE_DEFAULT_DATASET_ID'),
    /** @default true */
    purgeOnStart: field(coerceBoolean.default(true), 'CRAWLEE_PURGE_ON_START'),
    /** @default 'default' */
    defaultKeyValueStoreId: field(z.string().default('default'), 'CRAWLEE_DEFAULT_KEY_VALUE_STORE_ID'),
    /** @default 'default' */
    defaultRequestQueueId: field(z.string().default('default'), 'CRAWLEE_DEFAULT_REQUEST_QUEUE_ID'),
    /** @default 0.95 */
    maxUsedCpuRatio: field(coerceNumber.default(0.95)),
    /** @default 0.25 */
    availableMemoryRatio: field(coerceNumber.default(0.25), 'CRAWLEE_AVAILABLE_MEMORY_RATIO'),
    memoryMbytes: field(coerceNumber.optional(), 'CRAWLEE_MEMORY_MBYTES'),
    /** @default 60_000 */
    persistStateIntervalMillis: field(coerceNumber.default(60_000), 'CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS'),
    /** @default 1_000 */
    systemInfoIntervalMillis: field(coerceNumber.default(1_000)),
    /** @default 'INPUT' */
    inputKey: field(z.string().default('INPUT'), 'CRAWLEE_INPUT_KEY'),
    /** @default true */
    headless: field(coerceBoolean.default(true), 'CRAWLEE_HEADLESS'),
    /** @default false */
    xvfb: field(coerceBoolean.default(false), 'CRAWLEE_XVFB'),
    chromeExecutablePath: field(z.string().optional(), 'CRAWLEE_CHROME_EXECUTABLE_PATH'),
    defaultBrowserPath: field(z.string().optional(), 'CRAWLEE_DEFAULT_BROWSER_PATH'),
    disableBrowserSandbox: field(coerceBoolean.optional(), 'CRAWLEE_DISABLE_BROWSER_SANDBOX'),
    logLevel: field(logLevelSchema.optional(), 'CRAWLEE_LOG_LEVEL'),
    /** @default true */
    persistStorage: field(coerceBoolean.default(true), 'CRAWLEE_PERSIST_STORAGE'),
    containerized: field(coerceBoolean.optional(), 'CRAWLEE_CONTAINERIZED'),
};

// --- Type utilities ---

export type FieldsInput<F extends Record<string, ConfigField>> = {
    [K in keyof F]?: z.output<F[K]['schema']>;
};

export type FieldsOutput<F extends Record<string, ConfigField>> = {
    [K in keyof F]: z.output<F[K]['schema']>;
};

export type ConfigurationInput = FieldsInput<typeof crawleeConfigFields>;
export type ResolvedConfigValues = FieldsOutput<typeof crawleeConfigFields>;

/** @deprecated Use {@link ConfigurationInput} instead. */
export type ConfigurationOptions = ConfigurationInput;

// --- Configuration class ---

// Declaration merging: adds resolved config properties to the Configuration type.
// Properties are defined at runtime via Object.defineProperties in registerAccessors().
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Configuration extends ResolvedConfigValues {}

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
 * // Access configuration values directly as properties
 * console.log(config.headless);
 * console.log(config.persistStateIntervalMillis);
 * ```
 *
 * *Using custom configuration:*
 * ```js
 * import { BasicCrawler, Configuration } from 'crawlee';
 *
 * // Create a new configuration
 * const config = new Configuration({ persistStateIntervalMillis: 30_000 });
 * // Pass the configuration to the crawler
 * const crawler = new BasicCrawler({ configuration: config });
 * ```
 *
 * Configuration is immutable — values are set via the constructor and cannot be changed afterwards.
 * The priority order for resolving values is (highest to lowest):
 *
 * ```text
 * constructor options > environment variables > crawlee.json > schema defaults
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
 * `xvfb` | `CRAWLEE_XVFB` | `false`
 * `chromeExecutablePath` | `CRAWLEE_CHROME_EXECUTABLE_PATH` | -
 * `defaultBrowserPath` | `CRAWLEE_DEFAULT_BROWSER_PATH` | -
 * `disableBrowserSandbox` | `CRAWLEE_DISABLE_BROWSER_SANDBOX` | -
 * `availableMemoryRatio` | `CRAWLEE_AVAILABLE_MEMORY_RATIO` | `0.25`
 * `containerized` | `CRAWLEE_CONTAINERIZED` | -
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Configuration {
    /**
     * Field definitions for this configuration class.
     * Subclasses override this to register additional fields.
     */
    protected static fields: Record<string, ConfigField> = crawleeConfigFields;

    private resolvedValues: Record<string, unknown>;

    /**
     * Creates new `Configuration` instance with provided options.
     * Constructor options take precedence over environment variables, which take precedence
     * over crawlee.json values, which take precedence over schema defaults.
     */
    constructor(options: ConfigurationInput = {}) {
        const fileOptions = Configuration.loadFileOptions();
        this.resolvedValues = (this.constructor as typeof Configuration).resolveAll(
            options as Record<string, unknown>,
            fileOptions,
        );
        this.registerAccessors();

        // Set the log level
        const logLevel = this.logLevel;
        if (logLevel != null) {
            log.setLevel(logLevel);
        }
    }

    /**
     * Returns the global configuration instance. It will respect the environment variables.
     *
     * Delegates to the global ServiceLocator, making it the single source of truth for service management.
     */
    static getGlobalConfig(): Configuration {
        return serviceLocator.getConfiguration();
    }

    /**
     * Resolves all field values once using the priority chain:
     * constructor options > env vars > crawlee.json > schema defaults.
     */
    protected static resolveAll(
        userOptions: Record<string, unknown>,
        fileOptions: Record<string, unknown>,
    ): Record<string, unknown> {
        const fields = this.fields;
        const values: Record<string, unknown> = {};

        for (const [key, fieldDef] of Object.entries(fields)) {
            // 1. Constructor options (highest priority)
            if (key in userOptions && userOptions[key] !== undefined) {
                values[key] = fieldDef.schema.parse(userOptions[key]);
                continue;
            }

            // 2. Environment variables
            const envValue = Configuration.readEnvVar(fieldDef);
            if (envValue != null) {
                values[key] = fieldDef.schema.parse(envValue);
                continue;
            }

            // 3. crawlee.json file options
            if (key in fileOptions && fileOptions[key] !== undefined) {
                values[key] = fieldDef.schema.parse(fileOptions[key]);
                continue;
            }

            // 4. Schema default (by parsing undefined through the schema)
            const result = fieldDef.schema.safeParse(undefined);
            values[key] = result.success ? result.data : undefined;
        }

        return values;
    }

    /**
     * Registers getters (and throwing setters) on the instance for each field.
     */
    private registerAccessors(): void {
        const fields = (this.constructor as typeof Configuration).fields;
        const descriptors: PropertyDescriptorMap = {};

        for (const key of Object.keys(fields)) {
            descriptors[key] = {
                get: () => this.resolvedValues[key],
                set() {
                    throw new TypeError('Configuration is immutable. Pass options via the constructor instead.');
                },
                enumerable: true,
                configurable: false,
            };
        }

        Object.defineProperties(this, descriptors);
    }

    /**
     * Reads the first non-empty env var value for a field definition.
     */
    private static readEnvVar(fieldDef: ConfigField): string | undefined {
        if (!fieldDef.envVar) return undefined;
        const envVars = Array.isArray(fieldDef.envVar) ? fieldDef.envVar : [fieldDef.envVar];
        for (const envVar of envVars) {
            const value = process.env[envVar];
            if (value != null && value !== '') return value;
        }
        return undefined;
    }

    /**
     * Loads config options from crawlee.json in the current working directory.
     */
    private static loadFileOptions(): Record<string, unknown> {
        try {
            const file = readFileSync(join(process.cwd(), 'crawlee.json'));
            return JSON.parse(file.toString());
        } catch {
            return {};
        }
    }
}
