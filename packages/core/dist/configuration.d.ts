/// <reference types="node" />
import type { MemoryStorageOptions } from '@crawlee/memory-storage';
import { MemoryStorage } from '@crawlee/memory-storage';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Dictionary, StorageClient } from '@crawlee/types';
import { LogLevel } from '@apify/log';
import type { EventManager } from './events';
export interface ConfigurationOptions {
    /**
     * Defines storage client to be used.
     * @default {@apilink MemoryStorage}
     */
    storageClient?: StorageClient;
    /**
     * Defines the Event Manager to be used.
     * @default {@apilink EventManager}
     */
    eventManager?: EventManager;
    /**
     * Could be used to adjust the storage client behavior
     * e.g. {@apilink MemoryStorageOptions} could be used to adjust the {@apilink MemoryStorage} behavior.
     */
    storageClientOptions?: Dictionary;
    /**
     * Default dataset id.
     *
     * Alternative to `CRAWLEE_DEFAULT_DATASET_ID` environment variable.
     * @default 'default'
     */
    defaultDatasetId?: string;
    /**
     * Defines whether to purge the default storage folders before starting the crawler run.
     *
     * Alternative to `CRAWLEE_PURGE_ON_START` environment variable.
     * @default true
     */
    purgeOnStart?: boolean;
    /**
     * Default key-value store id.
     *
     * Alternative to `CRAWLEE_DEFAULT_KEY_VALUE_STORE_ID` environment variable.
     * @default 'default'
     */
    defaultKeyValueStoreId?: string;
    /**
     * Default request queue id.
     *
     * Alternative to `CRAWLEE_DEFAULT_REQUEST_QUEUE_ID` environment variable.
     * @default 'default'
     */
    defaultRequestQueueId?: string;
    /**
     * Sets the ratio, defining the maximum CPU usage.
     * When the CPU usage is higher than the provided ratio, the CPU is considered overloaded.
     * @default 0.95
     */
    maxUsedCpuRatio?: number;
    /**
     * Sets the ratio, defining the amount of system memory that could be used by the {@apilink AutoscaledPool}.
     * When the memory usage is more than the provided ratio, the memory is considered overloaded.
     *
     * Alternative to `CRAWLEE_AVAILABLE_MEMORY_RATIO` environment variable.
     * @default 0.25
     */
    availableMemoryRatio?: number;
    /**
     * Sets the amount of system memory in megabytes to be used by the {@apilink AutoscaledPool}.
     * By default, the maximum memory is set to one quarter of total system memory.
     *
     * Alternative to `CRAWLEE_MEMORY_MBYTES` environment variable.
     */
    memoryMbytes?: number;
    /**
     * Defines the interval of emitting the `persistState` event.
     *
     * Alternative to `CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS` environment variable.
     * @default 60_000
     */
    persistStateIntervalMillis?: number;
    /**
     Defines the interval of emitting the `systemInfo` event.
     @default 60_000
     */
    systemInfoIntervalMillis?: number;
    /**
     * Defines the default input key, i.e. the key that is used to get the crawler input value
     * from the default {@apilink KeyValueStore} associated with the current crawler run.
     *
     * Alternative to `CRAWLEE_INPUT_KEY` environment variable.
     * @default 'INPUT'
     */
    inputKey?: string;
    /**
     * Defines whether web browsers launched by Crawlee will run in the headless mode.
     *
     * Alternative to `CRAWLEE_HEADLESS` environment variable.
     * @default true
     */
    headless?: boolean;
    /**
     * Defines whether to run X virtual framebuffer on the web browsers launched by Crawlee.
     *
     * Alternative to `CRAWLEE_XVFB` environment variable.
     * @default false
     */
    xvfb?: boolean;
    /**
     * Defines a path to Chrome executable.
     *
     * Alternative to `CRAWLEE_CHROME_EXECUTABLE_PATH` environment variable.
     */
    chromeExecutablePath?: string;
    /**
     * Defines a path to default browser executable.
     *
     * Alternative to `CRAWLEE_DEFAULT_BROWSER_PATH` environment variable.
     */
    defaultBrowserPath?: string;
    /**
     * Defines whether to disable browser sandbox by adding `--no-sandbox` flag to `launchOptions`.
     *
     * Alternative to `CRAWLEE_DISABLE_BROWSER_SANDBOX` environment variable.
     */
    disableBrowserSandbox?: boolean;
    /**
     * Sets the log level to the given value.
     *
     * Alternative to `CRAWLEE_LOG_LEVEL` environment variable.
     * @default 'INFO'
     */
    logLevel?: LogLevel | LogLevel[keyof LogLevel];
    /**
     * Defines whether the storage client used should persist the data it stores.
     *
     * Alternative to `CRAWLEE_PERSIST_STORAGE` environment variable.
     */
    persistStorage?: boolean;
}
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
 * The configuration provided via environment variables always takes precedence. We can also
 * define the `crawlee.json` file in the project root directory which will serve as a baseline,
 * so the options provided in constructor will override those. In other words, the precedence is:
 *
 * ```text
 * crawlee.json < constructor options < environment variables
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
 */
export declare class Configuration {
    /**
     * Maps environment variables to config keys (e.g. `CRAWLEE_MEMORY_MBYTES` to `memoryMbytes`)
     */
    protected static ENV_MAP: Dictionary;
    protected static BOOLEAN_VARS: string[];
    protected static INTEGER_VARS: string[];
    protected static DEFAULTS: Dictionary;
    /**
     * Provides access to the current-instance-scoped Configuration without passing it around in parameters.
     * @internal
     */
    static storage: AsyncLocalStorage<Configuration>;
    protected options: Map<keyof ConfigurationOptions, ConfigurationOptions[keyof ConfigurationOptions]>;
    protected services: Map<string, unknown>;
    /** @internal */
    static globalConfig?: Configuration;
    /**
     * Creates new `Configuration` instance with provided options. Env vars will have precedence over those.
     */
    constructor(options?: ConfigurationOptions);
    /**
     * Returns configured value. First checks the environment variables, then provided configuration,
     * fallbacks to the `defaultValue` argument if provided, otherwise uses the default value as described
     * in the above section.
     */
    get<T extends keyof ConfigurationOptions, U extends ConfigurationOptions[T]>(key: T, defaultValue?: U): U;
    protected _castEnvValue(key: keyof ConfigurationOptions, value: number | string | boolean): string | number | boolean;
    /**
     * Sets value for given option. Only affects this `Configuration` instance, the value will not be propagated down to the env var.
     * To reset a value, we can omit the `value` argument or pass `undefined` there.
     */
    set(key: keyof ConfigurationOptions, value?: any): void;
    /**
     * Sets value for given option. Only affects the global `Configuration` instance, the value will not be propagated down to the env var.
     * To reset a value, we can omit the `value` argument or pass `undefined` there.
     */
    static set(key: keyof ConfigurationOptions, value?: any): void;
    /**
     * Returns cached instance of {@apilink StorageClient} using options as defined in the environment variables or in
     * this {@apilink Configuration} instance. Only first call of this method will create the client, following calls will
     * return the same client instance.
     *
     * Caching works based on the `storageClientOptions`, so calling this method with different options will return
     * multiple instances, one for each variant of the options.
     * @internal
     */
    getStorageClient(): StorageClient;
    getEventManager(): EventManager;
    /**
     * Creates an instance of MemoryStorage using options as defined in the environment variables or in this `Configuration` instance.
     * @internal
     */
    createMemoryStorage(options?: MemoryStorageOptions): MemoryStorage;
    useStorageClient(client: StorageClient): void;
    static useStorageClient(client: StorageClient): void;
    useEventManager(events: EventManager): void;
    /**
     * Returns the global configuration instance. It will respect the environment variables.
     */
    static getGlobalConfig(): Configuration;
    /**
     * Gets default {@apilink StorageClient} instance.
     */
    static getStorageClient(): StorageClient;
    /**
     * Gets default {@apilink EventManager} instance.
     */
    static getEventManager(): EventManager;
    /**
     * Resets global configuration instance. The default instance holds configuration based on env vars,
     * if we want to change them, we need to first reset the global state. Used mainly for testing purposes.
     */
    static resetGlobalState(): void;
    protected buildOptions(options: ConfigurationOptions): void;
}
//# sourceMappingURL=configuration.d.ts.map