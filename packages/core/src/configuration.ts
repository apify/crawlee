import type { MemoryStorageOptions } from '@crawlee/memory-storage';
import { MemoryStorage } from '@crawlee/memory-storage';
import { pathExistsSync, readFileSync } from 'fs-extra';
import { join } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import type { Dictionary, StorageClient } from '@crawlee/types';
import log, { LogLevel } from '@apify/log';
import { entries } from './typedefs';
import type { EventManager } from './events';
import { LocalEventManager } from './events';

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
export class Configuration {
    /**
     * Maps environment variables to config keys (e.g. `CRAWLEE_MEMORY_MBYTES` to `memoryMbytes`)
     */
    protected static ENV_MAP: Dictionary = {
        CRAWLEE_AVAILABLE_MEMORY_RATIO: 'availableMemoryRatio',
        CRAWLEE_PURGE_ON_START: 'purgeOnStart',
        CRAWLEE_MEMORY_MBYTES: 'memoryMbytes',
        CRAWLEE_DEFAULT_DATASET_ID: 'defaultDatasetId',
        CRAWLEE_DEFAULT_KEY_VALUE_STORE_ID: 'defaultKeyValueStoreId',
        CRAWLEE_DEFAULT_REQUEST_QUEUE_ID: 'defaultRequestQueueId',
        CRAWLEE_INPUT_KEY: 'inputKey',
        CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS: 'persistStateIntervalMillis',
        CRAWLEE_HEADLESS: 'headless',
        CRAWLEE_XVFB: 'xvfb',
        CRAWLEE_CHROME_EXECUTABLE_PATH: 'chromeExecutablePath',
        CRAWLEE_DEFAULT_BROWSER_PATH: 'defaultBrowserPath',
        CRAWLEE_DISABLE_BROWSER_SANDBOX: 'disableBrowserSandbox',
        CRAWLEE_LOG_LEVEL: 'logLevel',
        CRAWLEE_PERSIST_STORAGE: 'persistStorage',
    };

    protected static BOOLEAN_VARS = ['purgeOnStart', 'headless', 'xvfb', 'disableBrowserSandbox', 'persistStorage'];

    protected static INTEGER_VARS = ['memoryMbytes', 'persistStateIntervalMillis', 'systemInfoIntervalMillis'];

    protected static DEFAULTS: Dictionary = {
        defaultKeyValueStoreId: 'default',
        defaultDatasetId: 'default',
        defaultRequestQueueId: 'default',
        inputKey: 'INPUT',
        maxUsedCpuRatio: 0.95,
        availableMemoryRatio: 0.25,
        storageClientOptions: {},
        purgeOnStart: true,
        headless: true,
        persistStateIntervalMillis: 60_000,
        systemInfoIntervalMillis: 60_000,
        persistStorage: true,
    };

    /**
     * Provides access to the current-instance-scoped Configuration without passing it around in parameters.
     * @internal
     */
    static storage = new AsyncLocalStorage<Configuration>();

    protected options!: Map<keyof ConfigurationOptions, ConfigurationOptions[keyof ConfigurationOptions]>;
    protected services = new Map<string, unknown>();

    /** @internal */
    static globalConfig?: Configuration;

    /**
     * Creates new `Configuration` instance with provided options. Env vars will have precedence over those.
     */
    constructor(options: ConfigurationOptions = {}) {
        this.buildOptions(options);

        // Increase the global limit for event emitter memory leak warnings.
        EventEmitter.defaultMaxListeners = 50;

        // set the log level to support CRAWLEE_ prefixed env var too
        const logLevel = this.get('logLevel');

        if (logLevel) {
            const level = Number.isFinite(+logLevel) ? +logLevel : LogLevel[String(logLevel).toUpperCase() as unknown as LogLevel];
            log.setLevel(level as LogLevel);
        }
    }

    /**
     * Returns configured value. First checks the environment variables, then provided configuration,
     * fallbacks to the `defaultValue` argument if provided, otherwise uses the default value as described
     * in the above section.
     */
    get<T extends keyof ConfigurationOptions, U extends ConfigurationOptions[T]>(key: T, defaultValue?: U): U {
        // prefer env vars, always iterate through the whole map as there might be duplicate env vars for the same option
        let envValue: string | undefined;

        for (const [k, v] of entries(Configuration.ENV_MAP)) {
            if (key === v) {
                envValue = process.env[k as string];

                if (envValue) {
                    break;
                }
            }
        }

        if (envValue != null) {
            return this._castEnvValue(key, envValue) as U;
        }

        // check instance level options
        if (this.options.has(key)) {
            return this.options.get(key) as U;
        }

        // fallback to defaults
        return (defaultValue ?? Configuration.DEFAULTS[key as keyof typeof Configuration.DEFAULTS] ?? envValue) as U;
    }

    protected _castEnvValue(key: keyof ConfigurationOptions, value: number | string | boolean) {
        if (Configuration.INTEGER_VARS.includes(key)) {
            return +value;
        }

        if (Configuration.BOOLEAN_VARS.includes(key)) {
            // 0, false and empty string are considered falsy values
            return !['0', 'false', ''].includes(String(value).toLowerCase());
        }

        return value;
    }

    /**
     * Sets value for given option. Only affects this `Configuration` instance, the value will not be propagated down to the env var.
     * To reset a value, we can omit the `value` argument or pass `undefined` there.
     */
    set(key: keyof ConfigurationOptions, value?: any): void {
        this.options.set(key, value);
    }

    /**
     * Sets value for given option. Only affects the global `Configuration` instance, the value will not be propagated down to the env var.
     * To reset a value, we can omit the `value` argument or pass `undefined` there.
     */
    static set(key: keyof ConfigurationOptions, value?: any): void {
        this.getGlobalConfig().set(key, value);
    }

    /**
     * Returns cached instance of {@apilink StorageClient} using options as defined in the environment variables or in
     * this {@apilink Configuration} instance. Only first call of this method will create the client, following calls will
     * return the same client instance.
     *
     * Caching works based on the `storageClientOptions`, so calling this method with different options will return
     * multiple instances, one for each variant of the options.
     * @internal
     */
    getStorageClient(): StorageClient {
        if (this.options.has('storageClient')) {
            return this.options.get('storageClient') as StorageClient;
        }

        const options = this.options.get('storageClientOptions') as Dictionary;
        return this.createMemoryStorage(options);
    }

    getEventManager(): EventManager {
        if (this.options.has('eventManager')) {
            return this.options.get('eventManager') as EventManager;
        }

        if (this.services.has('eventManager')) {
            return this.services.get('eventManager') as EventManager;
        }

        const eventManager = new LocalEventManager(this);
        this.services.set('eventManager', eventManager);

        return eventManager;
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
            persistStorage: this.get('persistStorage'),
            // Override persistStorage if user provides it via storageClientOptions
            ...options,
        });
        this.services.set(cacheKey, storage);

        return storage;
    }

    useStorageClient(client: StorageClient): void {
        this.options.set('storageClient', client);
    }

    static useStorageClient(client: StorageClient): void {
        this.getGlobalConfig().useStorageClient(client);
    }

    useEventManager(events: EventManager): void {
        this.options.set('eventManager', events);
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

    protected buildOptions(options: ConfigurationOptions) {
        // try to load configuration from crawlee.json as the baseline
        const path = join(process.cwd(), 'crawlee.json');

        if (pathExistsSync(path)) {
            try {
                const file = readFileSync(path);
                const optionsFromFileConfig = JSON.parse(file.toString());
                Object.assign(options, optionsFromFileConfig);
            } catch {
                // ignore
            }
        }

        this.options = new Map(entries(options));
    }
}
