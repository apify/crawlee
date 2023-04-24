"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Configuration = void 0;
const tslib_1 = require("tslib");
const memory_storage_1 = require("@crawlee/memory-storage");
const fs_extra_1 = require("fs-extra");
const node_path_1 = require("node:path");
const node_async_hooks_1 = require("node:async_hooks");
const node_events_1 = require("node:events");
const log_1 = tslib_1.__importStar(require("@apify/log"));
const typedefs_1 = require("./typedefs");
const events_1 = require("./events");
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
class Configuration {
    /**
     * Creates new `Configuration` instance with provided options. Env vars will have precedence over those.
     */
    constructor(options = {}) {
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "services", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        this.buildOptions(options);
        // Increase the global limit for event emitter memory leak warnings.
        node_events_1.EventEmitter.defaultMaxListeners = 50;
        // set the log level to support CRAWLEE_ prefixed env var too
        const logLevel = this.get('logLevel');
        if (logLevel) {
            const level = Number.isFinite(+logLevel) ? +logLevel : log_1.LogLevel[String(logLevel).toUpperCase()];
            log_1.default.setLevel(level);
        }
    }
    /**
     * Returns configured value. First checks the environment variables, then provided configuration,
     * fallbacks to the `defaultValue` argument if provided, otherwise uses the default value as described
     * in the above section.
     */
    get(key, defaultValue) {
        // prefer env vars, always iterate through the whole map as there might be duplicate env vars for the same option
        let envValue;
        for (const [k, v] of (0, typedefs_1.entries)(Configuration.ENV_MAP)) {
            if (key === v) {
                envValue = process.env[k];
                if (envValue) {
                    break;
                }
            }
        }
        if (envValue != null) {
            return this._castEnvValue(key, envValue);
        }
        // check instance level options
        if (this.options.has(key)) {
            return this.options.get(key);
        }
        // fallback to defaults
        return (defaultValue ?? Configuration.DEFAULTS[key] ?? envValue);
    }
    _castEnvValue(key, value) {
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
    set(key, value) {
        this.options.set(key, value);
    }
    /**
     * Sets value for given option. Only affects the global `Configuration` instance, the value will not be propagated down to the env var.
     * To reset a value, we can omit the `value` argument or pass `undefined` there.
     */
    static set(key, value) {
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
    getStorageClient() {
        if (this.options.has('storageClient')) {
            return this.options.get('storageClient');
        }
        const options = this.options.get('storageClientOptions');
        return this.createMemoryStorage(options);
    }
    getEventManager() {
        if (this.options.has('eventManager')) {
            return this.options.get('eventManager');
        }
        if (this.services.has('eventManager')) {
            return this.services.get('eventManager');
        }
        const eventManager = new events_1.LocalEventManager(this);
        this.services.set('eventManager', eventManager);
        return eventManager;
    }
    /**
     * Creates an instance of MemoryStorage using options as defined in the environment variables or in this `Configuration` instance.
     * @internal
     */
    createMemoryStorage(options = {}) {
        const cacheKey = `MemoryStorage-${JSON.stringify(options)}`;
        if (this.services.has(cacheKey)) {
            return this.services.get(cacheKey);
        }
        const storage = new memory_storage_1.MemoryStorage({
            persistStorage: this.get('persistStorage'),
            // Override persistStorage if user provides it via storageClientOptions
            ...options,
        });
        this.services.set(cacheKey, storage);
        return storage;
    }
    useStorageClient(client) {
        this.options.set('storageClient', client);
    }
    static useStorageClient(client) {
        this.getGlobalConfig().useStorageClient(client);
    }
    useEventManager(events) {
        this.options.set('eventManager', events);
    }
    /**
     * Returns the global configuration instance. It will respect the environment variables.
     */
    static getGlobalConfig() {
        if (Configuration.storage.getStore()) {
            return Configuration.storage.getStore();
        }
        Configuration.globalConfig ?? (Configuration.globalConfig = new Configuration());
        return Configuration.globalConfig;
    }
    /**
     * Gets default {@apilink StorageClient} instance.
     */
    static getStorageClient() {
        return this.getGlobalConfig().getStorageClient();
    }
    /**
     * Gets default {@apilink EventManager} instance.
     */
    static getEventManager() {
        return this.getGlobalConfig().getEventManager();
    }
    /**
     * Resets global configuration instance. The default instance holds configuration based on env vars,
     * if we want to change them, we need to first reset the global state. Used mainly for testing purposes.
     */
    static resetGlobalState() {
        delete this.globalConfig;
    }
    buildOptions(options) {
        // try to load configuration from crawlee.json as the baseline
        const path = (0, node_path_1.join)(process.cwd(), 'crawlee.json');
        if ((0, fs_extra_1.pathExistsSync)(path)) {
            try {
                const file = (0, fs_extra_1.readFileSync)(path);
                const optionsFromFileConfig = JSON.parse(file.toString());
                Object.assign(options, optionsFromFileConfig);
            }
            catch {
                // ignore
            }
        }
        this.options = new Map((0, typedefs_1.entries)(options));
    }
}
/**
 * Maps environment variables to config keys (e.g. `CRAWLEE_MEMORY_MBYTES` to `memoryMbytes`)
 */
Object.defineProperty(Configuration, "ENV_MAP", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
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
    }
});
Object.defineProperty(Configuration, "BOOLEAN_VARS", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: ['purgeOnStart', 'headless', 'xvfb', 'disableBrowserSandbox', 'persistStorage']
});
Object.defineProperty(Configuration, "INTEGER_VARS", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: ['memoryMbytes', 'persistStateIntervalMillis', 'systemInfoIntervalMillis']
});
Object.defineProperty(Configuration, "DEFAULTS", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        defaultKeyValueStoreId: 'default',
        defaultDatasetId: 'default',
        defaultRequestQueueId: 'default',
        inputKey: 'INPUT',
        maxUsedCpuRatio: 0.95,
        availableMemoryRatio: 0.25,
        storageClientOptions: {},
        purgeOnStart: true,
        headless: true,
        persistStateIntervalMillis: 60000,
        systemInfoIntervalMillis: 60000,
        persistStorage: true,
    }
});
/**
 * Provides access to the current-instance-scoped Configuration without passing it around in parameters.
 * @internal
 */
Object.defineProperty(Configuration, "storage", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: new node_async_hooks_1.AsyncLocalStorage()
});
exports.Configuration = Configuration;
//# sourceMappingURL=configuration.js.map