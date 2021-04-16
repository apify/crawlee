import { ENV_VARS } from 'apify-shared/consts';
import { join } from 'path';
import { ApifyStorageLocal } from '@apify/storage-local';
import * as ApifyClient from 'apify-client';
import log from './utils_log';

/**
 * `Configuration` is a value object holding the SDK configuration. We can use it in two ways:
 *
 * 1. When using `Apify` class, we can get the instance configuration via `sdk.config`
 *   ```js
 *   const { Apify } = require('apify');
 *
 *   const sdk = new Apify({ token: '123' });
 *   console.log(sdk.config.get('token')); // '123'
 *   ```
 * 2. To get the global configuration (singleton instance). It will respect the environment variables.
 *   ```js
 *   console.log(Configuration.getGlobalConfig().get('token')); // returns the token from APIFY_TOKEN env var
 *   ```
 *
 * ## Supported Configuration Options
 *
 * > All env vars are also accessible with `APIFY_` prefix (e.g. `APIFY_TOKEN`)
 *
 * Key | Environment Variable | Default Value
 * ---|---|---
 * `defaultDatasetId` | `DEFAULT_DATASET_ID` | `'default'`
 * `defaultKeyValueStoreId` | `DEFAULT_KEY_VALUE_STORE_ID` | `'default'`
 * `defaultRequestQueueId` | `DEFAULT_REQUEST_QUEUE_ID` | `'default'`
 * `localStorageDir` | `LOCAL_STORAGE_DIR` | `'./apify_storage'`
 * `localStorageEnableWalMode` | `LOCAL_STORAGE_ENABLE_WAL_MODE` | `true`
 * `persistStateIntervalMillis` | `PERSIST_STATE_INTERVAL_MILLIS` | `60e3`
 * `token` | `TOKEN` | -
 *
 * ## Advanced Configuration Options
 *
 * Key | Environment Variable | Default Value
 * ---|---|---
 * `actorEventsWsUrl` | `ACTOR_EVENTS_WS_URL` | -
 * `actorId` | `ACTOR_ID` | -
 * `actorRunId` | `ACTOR_RUN_ID` | -
 * `actorTaskId` | `ACTOR_TASK_ID` | -
 * `apiBaseUrl` | `API_BASE_URL` | `'https://api.apify.com/v2'`
 * `containerPort` | `CONTAINER_PORT` | `4321`
 * `containerUrl` | `CONTAINER_URL` | `'http://localhost:4321'`
 * `inputKey` | `INPUT_KEY` | `'INPUT'`
 * `isAtHome` | `IS_AT_HOME` | -
 * `maxOpenedStorages` | `MAX_OPENED_STORAGES` | `1000`
 * `metamorphAfterSleepMillis` | `METAMORPH_AFTER_SLEEP_MILLIS` | `300e3`
 * `proxyHostname` | `PROXY_HOSTNAME` | `'proxy.apify.com'`
 * `proxyPassword` | `PROXY_PASSWORD` | -
 * `proxyPort` | `PROXY_PORT` | `8000`
 * `proxyStatusUrl` | `PROXY_STATUS_URL` | `'http://proxy.apify.com'`
 * `userId` | `USER_ID` | -
 *
 * ## Not Supported environment variables
 *
 * - `MEMORY_MBYTES`
 * - `HEADLESS`
 * - `XVFB`
 * - `CHROME_EXECUTABLE_PATH`
 */
export class Configuration {
    // all env vars also supports `APIFY_` prefix
    static ENV_MAP = {
        TOKEN: 'token',
        LOCAL_STORAGE_DIR: 'localStorageDir',
        LOCAL_STORAGE_ENABLE_WAL_MODE: 'localStorageEnableWalMode',
        DEFAULT_DATASET_ID: 'defaultDatasetId',
        DEFAULT_KEY_VALUE_STORE_ID: 'defaultKeyValueStoreId',
        DEFAULT_REQUEST_QUEUE_ID: 'defaultRequestQueueId',
        METAMORPH_AFTER_SLEEP_MILLIS: 'metamorphAfterSleepMillis',
        PERSIST_STATE_INTERVAL_MILLIS: 'persistStateIntervalMillis',
        TEST_PERSIST_INTERVAL_MILLIS: 'persistStateIntervalMillis', // for BC, seems to be unused
        ACTOR_EVENTS_WS_URL: 'actorEventsWsUrl',
        INPUT_KEY: 'inputKey',
        ACTOR_ID: 'actorId',
        API_BASE_URL: 'apiBaseUrl',
        IS_AT_HOME: 'isAtHome',
        ACTOR_RUN_ID: 'actorRunId',
        ACTOR_TASK_ID: 'actorTaskId',
        CONTAINER_PORT: 'containerPort',
        CONTAINER_URL: 'containerUrl',
        USER_ID: 'userId',
        PROXY_HOSTNAME: 'proxyHostname',
        PROXY_PASSWORD: 'proxyPassword',
        PROXY_STATUS_URL: 'proxyStatusUrl',
        PROXY_PORT: 'proxyPort',
        MAX_OPENED_STORAGES: 'maxOpenedStorages',

        // not supported, use env vars directly:
        // MEMORY_MBYTES: 'memoryMbytes',
        // HEADLESS: 'headless',
        // XVFB: 'xvfb',
        // CHROME_EXECUTABLE_PATH: 'chromeExecutablePath',
    };

    static ENV_MAP_REVERSED = Object.entries(Configuration.ENV_MAP).reduce((obj, [key, value]) => {
        obj[value] = key;
        return obj;
    }, {});

    static BOOLEAN_VARS = ['localStorageEnableWalMode'];

    static INTEGER_VARS = ['proxyPort', 'internalPort', 'memoryMbytes', 'containerPort'];

    static DEFAULTS = {
        defaultKeyValueStoreId: 'default',
        defaultDatasetId: 'default',
        defaultRequestQueueId: 'default',
        inputKey: 'INPUT',
        proxyHostname: 'proxy.apify.com',
        apiBaseUrl: 'https://api.apify.com/v2',
        proxyStatusUrl: 'http://proxy.apify.com',
        proxyPort: 8000,
        containerPort: 4321,
        containerUrl: 'http://localhost:4321', // Must match `containerPort` above!
        maxOpenedStorages: 1000,
        metamorphAfterSleepMillis: 300e3,
        persistStateIntervalMillis: 60e3, // This value is mentioned in jsdoc in `events.js`, if you update it here, update it there too.
        localStorageEnableWalMode: true,
    };

    /**
     * Creates new `Configuration` instance with provided options. Env vars will have precedence over those.
     *
     * @param {Record<string, number | string | boolean>} options
     */
    constructor(options = {}) {
        this.options = new Map(Object.entries(options));

        if (!this.get('localStorageDir') && !this.get('token')) {
            const dir = join(process.cwd(), './apify_storage');
            this.set('localStorageDir', dir);
            // eslint-disable-next-line max-len
            log.warning(`Neither ${ENV_VARS.LOCAL_STORAGE_DIR} nor ${ENV_VARS.TOKEN} environment variable is set, defaulting to ${ENV_VARS.LOCAL_STORAGE_DIR}="${dir}"`);
        }
    }

    /**
     * Returns configured value. First checks the environment variables, then provided configuration,
     * fallbacks to the `defaultValue` argument if provided, otherwise uses the default value as described
     * in the above section.
     *
     * @param {string} key
     * @param {string | number | boolean} [defaultValue]
     * @return {string | number | boolean}
     */
    get(key, defaultValue) {
        // prefer env vars
        const envKey = Configuration.ENV_MAP_REVERSED[key] ?? key;
        const envValue = process.env[envKey] ?? process.env[ENV_VARS[envKey] ?? process.env[`APIFY_${envKey}`]];

        if (envValue != null) {
            return this._castEnvValue(key, envValue);
        }

        // check instance level options
        if (this.options.has(key)) {
            return this.options.get(key);
        }

        // fallback to defaults
        return defaultValue ?? Configuration.DEFAULTS[key] ?? envValue;
    }

    /**
     * @param {string} key
     * @param {number | string | boolean} value
     * @return {boolean}
     * @private
     */
    _castEnvValue(key, value) {
        if (key in Configuration.INTEGER_VARS) {
            return +value;
        }

        if (key in Configuration.BOOLEAN_VARS) {
            // 0, false and empty string are considered falsy values
            return !['0', 'false', ''].includes(value.toLowerCase());
        }

        return value;
    }

    /**
     * Sets value for given option. Only affects this `Configuration` instance, the value will not be propagated down to the env var.
     * To reset a value, we can omit the `value` argument or pass `undefined` there.
     *
     * @param {string} key
     * @param {string | number | boolean} [value]
     */
    set(key, value) {
        this.options.set(key, value);
    }

    /**
     * Creates an instance of ApifyClient using options as defined in the environment variables or in this `Configuration` instance.
     *
     * @param {object} [options]
     * @param {string} [options.token]
     * @param {string} [options.maxRetries]
     * @param {string} [options.minDelayBetweenRetriesMillis]
     * @return {ApifyClient}
     * @internal
     */
    createClient(options = {}) {
        return new ApifyClient({
            baseUrl: this.get('apiBaseUrl'),
            token: this.get('token'),
            ...options, // allow overriding the instance configuration
        });
    }

    /**
     * Creates an instance of ApifyStorageLocal using options as defined in the environment variables or in this `Configuration` instance.
     *
     * @param {object} [options]
     * @param {string} [options.storageDir]
     * @param {boolean} [options.enableWalMode=true]
     * @return {ApifyStorageLocal}
     * @internal
     */
    createLocalStorage(options = {}) {
        const storageDir = options.storageDir ?? this.get('localStorageDir');
        const enableWalMode = options.enableWalMode ?? this.get('localStorageEnableWalMode');
        const storage = new ApifyStorageLocal({ ...options, storageDir, enableWalMode });

        process.on('exit', () => {
            // TODO this is not public API, need to update
            // storage local with some teardown
            storage.dbConnections.closeAllConnections();
        });

        return storage;
    }

    /**
     * Returns the global configuration instance. It will respect the environment variables.
     * As opposed to this method, we can also get the SDK instance configuration via `sdk.config` property.
     *
     * @return {Configuration}
     */
    static getGlobalConfig() {
        if (!Configuration.globalConfig) {
            Configuration.globalConfig = new Configuration();
        }

        return Configuration.globalConfig;
    }
}
