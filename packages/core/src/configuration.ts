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
    storageClient?: StorageClient;
    eventManager?: EventManager;
    storageClientOptions?: Dictionary;
    defaultDatasetId?: string;
    purgeOnStart?: boolean;
    defaultKeyValueStoreId?: string;
    defaultRequestQueueId?: string;
    maxUsedCpuRatio?: number;
    availableMemoryRatio?: number;
    memoryMbytes?: number;
    persistStateIntervalMillis?: number;
    systemInfoIntervalMillis?: number;
    inputKey?: string;
    headless?: boolean;
    xvfb?: boolean;
    chromeExecutablePath?: string;
    defaultBrowserPath?: string;
    disableBrowserSandbox?: boolean;
    logLevel?: LogLevel | LogLevel[keyof LogLevel];
}

/**
 * `Configuration` is a value object holding Crawlee configuration. By default, there is a
 * global singleton instance of this class available via `Configuration.getGlobalConfig()`.
 * Places that depend on a configurable behaviour depend on this class as have the global
 * instance as the default value.
 *
 * ```js
 * import { BasicCrawler, Configuration } from 'crawlee';
 *
 * const config = new Configuration({ persistStateIntervalMillis: 30_000 });
 * const crawler = new BasicCrawler({ ... }, config);
 * ```
 *
 * The configuration provided via environment variables always takes precedence. We can also
 * define the `crawlee.json` file in the project root directory which will serve as a baseline,
 * so the options provided in constructor will override those.
 *
 * > In other words, the precedence is: crawlee.json < constructor options < environment variables.
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
 * `persistStateIntervalMillis` | `CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS` | `60e3`
 *
 * ## Advanced Configuration Options
 *
 * Key | Environment Variable | Default Value
 * ---|---|---
 * `inputKey` | `CRAWLEE_INPUT_KEY` | `'INPUT'`
 * `xvfb` | `CRAWLEE_XVFB` | -
 * `chromeExecutablePath` | `CRAWLEE_CHROME_EXECUTABLE_PATH` | -
 * `defaultBrowserPath` | `CRAWLEE_DEFAULT_BROWSER_PATH` | -
 */
export class Configuration {
    /**
     * Maps environment variables to config keys (e.g. `CRAWLEE_MEMORY_MBYTES` to `memoryMbytes`)
     */
    protected static ENV_MAP = {
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
    };

    protected static BOOLEAN_VARS: string[] = ['purgeOnStart', 'headless', 'xvfb', 'disableBrowserSandbox'];

    protected static INTEGER_VARS = ['memoryMbytes', 'persistStateIntervalMillis', 'systemInfoIntervalMillis'];

    protected static DEFAULTS = {
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
                envValue = process.env[k];

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
     * Returns cached instance of {@link StorageClient} using options as defined in the environment variables or in
     * this {@link Configuration} instance. Only first call of this method will create the client, following calls will
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

        const storage = new MemoryStorage(options);
        this.services.set(cacheKey, storage);

        return storage;
    }

    useStorageClient(client: StorageClient): void {
        this.options.set('storageClient', client);
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
     * Gets default {@link StorageClient} instance.
     */
    static getStorageClient(): StorageClient {
        return this.getGlobalConfig().getStorageClient();
    }

    /**
     * Gets default {@link EventManager} instance.
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
