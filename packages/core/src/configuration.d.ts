import { z } from 'zod';
import { LogLevel } from './log.js';
export interface ConfigField<T extends z.ZodType = z.ZodType> {
    schema: T;
    envVar?: string | string[];
}
export declare function field<T extends z.ZodType>(schema: T, envVar?: string | string[]): ConfigField<T>;
/** Zod preprocessor treating `'0'` and `'false'` as falsy. */
export declare const coerceBoolean: z.ZodPreprocess<z.ZodBoolean>;
export declare const coerceNumber: z.ZodPreprocess<z.ZodNumber>;
export declare const crawleeConfigFields: {
    /** @default 'default' */
    defaultDatasetId: ConfigField<z.ZodDefault<z.ZodString>>;
    /** @default true */
    purgeOnStart: ConfigField<z.ZodDefault<z.ZodPreprocess<z.ZodBoolean>>>;
    /** @default 'default' */
    defaultKeyValueStoreId: ConfigField<z.ZodDefault<z.ZodString>>;
    /** @default 'default' */
    defaultRequestQueueId: ConfigField<z.ZodDefault<z.ZodString>>;
    /** @default 0.95 */
    maxUsedCpuRatio: ConfigField<z.ZodDefault<z.ZodPreprocess<z.ZodNumber>>>;
    /** @default 0.25 */
    availableMemoryRatio: ConfigField<z.ZodDefault<z.ZodPreprocess<z.ZodNumber>>>;
    memoryMbytes: ConfigField<z.ZodOptional<z.ZodPreprocess<z.ZodNumber>>>;
    /** @default 60_000 */
    persistStateIntervalMillis: ConfigField<z.ZodDefault<z.ZodPreprocess<z.ZodNumber>>>;
    /**
     * Internal safety-net timeout for a single request, in milliseconds. When unset the crawler derives it from
     * the request handler timeout (twice it, and never below 5 minutes).
     */
    internalTimeoutMillis: ConfigField<z.ZodOptional<z.ZodPreprocess<z.ZodNumber>>>;
    /** @default 1_000 */
    systemInfoIntervalMillis: ConfigField<z.ZodDefault<z.ZodPreprocess<z.ZodNumber>>>;
    /** @default 'INPUT' */
    inputKey: ConfigField<z.ZodDefault<z.ZodString>>;
    /** @default true */
    headless: ConfigField<z.ZodDefault<z.ZodPreprocess<z.ZodBoolean>>>;
    /** @default false */
    xvfb: ConfigField<z.ZodDefault<z.ZodPreprocess<z.ZodBoolean>>>;
    chromeExecutablePath: ConfigField<z.ZodOptional<z.ZodString>>;
    defaultBrowserPath: ConfigField<z.ZodOptional<z.ZodString>>;
    /** @default false */
    disableBrowserSandbox: ConfigField<z.ZodDefault<z.ZodPreprocess<z.ZodBoolean>>>;
    logLevel: ConfigField<z.ZodOptional<z.ZodPreprocess<z.ZodEnum<typeof LogLevel>>>>;
    /** @default true */
    persistStorage: ConfigField<z.ZodDefault<z.ZodPreprocess<z.ZodBoolean>>>;
    /** @default './storage' */
    storageDir: ConfigField<z.ZodDefault<z.ZodString>>;
    containerized: ConfigField<z.ZodOptional<z.ZodPreprocess<z.ZodBoolean>>>;
};
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
export interface Configuration extends ResolvedConfigValues {
}
/**
 * `Configuration` is a value object holding Crawlee configuration. By default, there is a
 * global singleton instance of this class available via `Configuration.getGlobalConfiguration()`.
 * Places that depend on a configurable behaviour depend on this class, as they have the global
 * instance as the default value.
 *
 * *Using global configuration:*
 * ```js
 * import { BasicCrawler, Configuration } from 'crawlee';
 *
 * // Get the global configuration
 * const config = Configuration.getGlobalConfiguration();
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
 * `internalTimeoutMillis` | `CRAWLEE_INTERNAL_TIMEOUT` | -
 * `purgeOnStart` | `CRAWLEE_PURGE_ON_START` | `true`
 * `persistStorage` | `CRAWLEE_PERSIST_STORAGE` | `true`
 * `storageDir` | `CRAWLEE_STORAGE_DIR` | `'./storage'`
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
export declare class Configuration {
    #private;
    /**
     * Field definitions for this configuration class.
     * Subclasses override this to register additional fields.
     */
    protected static fields: Record<string, ConfigField>;
    /**
     * Creates new `Configuration` instance with provided options.
     * Constructor options take precedence over environment variables, which take precedence
     * over crawlee.json values, which take precedence over schema defaults.
     */
    constructor(options?: ConfigurationInput);
    /**
     * Returns the global configuration instance. It will respect the environment variables.
     *
     * Delegates to the global ServiceLocator, making it the single source of truth for service management.
     */
    static getGlobalConfiguration(): Configuration;
    /**
     * Resolves all field values once using the priority chain:
     * constructor options > env vars > crawlee.json > schema defaults.
     */
    private static resolveAll;
    /**
     * Registers getters (and throwing setters) on the instance for each field.
     */
    private registerAccessors;
    /**
     * Reads the first defined env var value for a field definition.
     * Empty strings are treated as unset, falling through to crawlee.json or schema defaults.
     * (Crawlee v3 coerced `''` to `false`/`0`/`''` per type — v4 drops that for consistency.)
     */
    private static readEnvVar;
    /**
     * Loads config options from crawlee.json in the current working directory.
     */
    private static loadFileOptions;
}
