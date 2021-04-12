import { ENV_VARS, INTEGER_ENV_VARS, LOCAL_ENV_VARS } from 'apify-shared/consts';
import { join } from 'path';
import log from './utils_log';
import { ApifyStorageLocal } from '@apify/storage-local';
import * as ApifyClient from 'apify-client';

export class Configuration {

    static ENV_MAP = {
        TOKEN: 'token',
        LOCAL_STORAGE_DIR: 'localStorageDir',
        LOCAL_STORAGE_ENABLE_WAL_MODE: 'localStorageEnableWalMode',
        DEFAULT_DATASET_ID: 'defaultDatasetId',
        DEFAULT_KEY_VALUE_STORE_ID: 'defaultKeyValueStoreId',
        DEFAULT_REQUEST_QUEUE_ID: 'defaultRequestQueueId',
        METAMORPH_AFTER_SLEEP_MILLIS: 'metamorphAfterSleepMillis',
        PERSIST_STATE_INTERVAL_MILLIS: 'persistStateIntervalMillis',
        APIFY_TEST_PERSIST_INTERVAL_MILLIS: 'persistStateIntervalMillis', // for BC, seems to be unused
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

    static BOOLEAN_ENV_VARS = ['LOCAL_STORAGE_ENABLE_WAL_MODE'];

    static DEFAULTS = {
        ...Object.entries(LOCAL_ENV_VARS).reduce((o, [k, v]) => {
            o[Configuration.ENV_MAP_REVERSED[k]] = v;
            return o;
        }, {}),
        maxOpenedStorages: 1000,
        metamorphAfterSleepMillis: 300e3,
        persistStateIntervalMillis: 60e3, // This value is mentioned in jsdoc in `events.js`, if you update it here, update it there too.
    };

    /**
     * @param {Record<keyof Configuration.ENV_MAP_REVERSED, number | string>} options
     */
    constructor(options = {}) {
        this.options = options;

        if (!this.get('localStorageDir') && !this.get('token')) {
            const dir = join(process.cwd(), './apify_storage');
            this.set('localStorageDir', dir);
            log.warning(`Neither ${ENV_VARS.LOCAL_STORAGE_DIR} nor ${ENV_VARS.TOKEN} environment variable is set, defaulting to ${ENV_VARS.LOCAL_STORAGE_DIR}="${dir}"`);
        }
    }

    /**
     * @param {string} key
     * @param {string | number | boolean} [defaultValue]
     * @return {string | number | boolean}
     */
    get(key, defaultValue) {
        // prefer env vars
        const envKey = Configuration.ENV_MAP_REVERSED[key] ?? key;
        const envValue = process.env[envKey] ?? process.env[ENV_VARS[envKey]];

        if (envValue != null) {
            if (envKey in INTEGER_ENV_VARS) {
                return +envValue;
            }

            if (envKey in Configuration.BOOLEAN_ENV_VARS) {
                // 0, false and empty string are considered falsy values
                return !['0', 'false', ''].includes(envValue.toLowerCase());
            }

            return envValue;
        }

        // check instance level options
        if (key in this.options) {
            return this.options[key];
        }

        // fallback to defaults
        return defaultValue ?? Configuration.DEFAULTS[key];
    }

    /**
     * @param {string} key
     * @param {string | number} value
     */
    set(key, value) {
        this.options[key] = value;
    }

    /**
     * Creates an instance of ApifyClient using options as defined in the environment variables.
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
     * Creates an instance of ApifyStorageLocal using options as defined in the environment variables.
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
     * @return {Configuration}
     */
    static getDefaults() {
        if (!Configuration.defaults) {
            Configuration.defaults = new Configuration();
        }

        return Configuration.defaults;
    }

}
